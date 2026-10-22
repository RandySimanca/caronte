-- =============================================================================
-- MIGRATION 041: Regla de CLAVO (cliente con préstamo vencido sin saldar)
-- Clavo = préstamo ACTIVO que ya pasó su end_date + 7 días de gracia y aún tiene saldo
-- (current_balance > 0). Un cliente clavo no puede recibir un préstamo nuevo hasta saldar su deuda,
-- pero SÍ puede refinanciar (el saldo pendiente se descuenta del dinero a entregar).
-- Validación del lado del servidor (el celular también la valida, pero puede estar desactualizado):
--   * sync_new_loan_bundle: rechaza si el cliente tiene otro préstamo ACTIVO clavo.
-- sync_refinance_bundle NO cambia (la 039 sigue vigente).
-- Única diferencia respecto a la versión de la 038: el bloque "CLAVO".
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_new_loan_bundle(
  p_client jsonb,
  p_loan jsonb,
  p_installments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           text;
  v_route_id       uuid;
  v_client_id      uuid;
  v_loan_id        uuid;
  v_inst_count     int;
  v_expected       int;
  v_amount         numeric;
  v_rate           numeric;
  v_interest       numeric;
  v_obligation     numeric;
  v_term           int;
  v_daily          numeric;
  v_sundays        int;
  v_sundays_amt    numeric;
  v_receipt        numeric;
  v_delivered      numeric;
  v_balance        numeric;
  v_end            date;
  v_grace          date;
  v_route_order    int;
  v_allowed_routes uuid[];
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para sincronizar préstamos';
  END IF;

  IF NOT company_is_active() THEN
    RAISE EXCEPTION 'La empresa está suspendida o vencida';
  END IF;

  v_client_id   := (p_client->>'id')::uuid;
  v_loan_id     := (p_loan->>'id')::uuid;
  v_route_id    := COALESCE((p_loan->>'route_id')::uuid, (p_client->>'route_id')::uuid);
  v_route_order := NULLIF(p_client->>'route_order', '')::int;

  IF v_client_id IS NULL OR v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Faltan id de cliente o préstamo';
  END IF;

  IF v_route_id IS NULL THEN
    RAISE EXCEPTION 'El préstamo no tiene ruta asignada';
  END IF;

  IF v_role = 'COBRADOR' THEN
    v_allowed_routes := get_collector_route_ids();
  ELSE
    v_allowed_routes := get_company_route_ids();
  END IF;

  IF NOT (v_route_id = ANY(v_allowed_routes)) THEN
    RAISE EXCEPTION 'La ruta no está asignada a este usuario o no pertenece a su empresa';
  END IF;

  INSERT INTO clients (
    id, full_name, document_id, phone, address, neighborhood, municipality,
    route_id, route_order, photo_face_url, photo_doc_url, personal_references, status,
    created_by, created_at, updated_at
  ) VALUES (
    v_client_id,
    p_client->>'full_name',
    p_client->>'document_id',
    NULLIF(p_client->>'phone', ''),
    NULLIF(p_client->>'address', ''),
    NULLIF(p_client->>'neighborhood', ''),
    NULLIF(p_client->>'municipality', ''),
    v_route_id,
    COALESCE(v_route_order, 0),
    NULLIF(p_client->>'photo_face_url', ''),
    NULLIF(p_client->>'photo_doc_url', ''),
    NULLIF(p_client->>'personal_references', ''),
    COALESCE(NULLIF(p_client->>'status', ''), 'ACTIVO')::client_status,
    COALESCE((p_client->>'created_by')::uuid, auth.uid()),
    COALESCE((p_client->>'created_at')::timestamptz, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    status         = CASE WHEN clients.status = 'BLOQUEADO' THEN clients.status ELSE 'ACTIVO'::client_status END,
    route_id       = COALESCE(clients.route_id, EXCLUDED.route_id),
    route_order    = COALESCE(v_route_order, clients.route_order),
    photo_face_url = COALESCE(NULLIF(EXCLUDED.photo_face_url, ''), clients.photo_face_url),
    photo_doc_url  = COALESCE(NULLIF(EXCLUDED.photo_doc_url, ''), clients.photo_doc_url),
    updated_at     = NOW()
  WHERE clients.route_id = ANY(v_allowed_routes);

  -- Si el id de cliente ya existía en OTRA ruta/empresa, el UPDATE de arriba no se
  -- aplicó: no se debe enganchar un préstamo a un cliente ajeno.
  IF NOT EXISTS (
    SELECT 1 FROM clients WHERE id = v_client_id AND route_id = ANY(v_allowed_routes)
  ) THEN
    RAISE EXCEPTION 'El cliente pertenece a otra ruta o empresa';
  END IF;

  -- Cliente CLAVO: tiene otro préstamo ACTIVO vencido (end_date + 7 días de gracia ya pasaron) con saldo
  -- pendiente. No puede recibir un préstamo nuevo hasta que salde su deuda. La fecha de referencia es la
  -- del desembolso del préstamo nuevo (un préstamo creado sin conexión se evalúa al día en que se hizo).
  -- La refinanciación SÍ está permitida: sync_refinance_bundle marca el préstamo anterior como
  -- REFINANCIADO antes de llamar a esta función, por lo que aquí ya no cuenta como activo.
  IF EXISTS (
    SELECT 1 FROM loans l
    WHERE l.client_id = v_client_id
      AND l.id <> v_loan_id
      AND l.status = 'ACTIVO'
      AND COALESCE(l.current_balance, 0) > 0
      AND l.end_date + 7 < COALESCE(
            NULLIF(p_loan->>'disbursement_date', '')::date,
            (NOW() AT TIME ZONE 'America/Bogota')::date
          )
  ) THEN
    RAISE EXCEPTION 'El cliente es CLAVO (préstamo vencido hace más de 7 días sin saldar). No se le puede dar un préstamo nuevo hasta que salde su deuda; puede refinanciar';
  END IF;

  v_amount      := ROUND((p_loan->>'amount_requested')::numeric, 6);
  v_rate        := ROUND((p_loan->>'interest_rate')::numeric, 4);
  v_interest    := ROUND(v_amount * v_rate, 6);
  v_obligation  := v_amount + v_interest;
  v_term        := (p_loan->>'term_days')::int;
  v_daily       := ROUND(v_obligation / v_term, 6);
  v_sundays     := COALESCE((p_loan->>'sundays_prepaid_count')::int, 0);
  v_sundays_amt := ROUND(v_sundays * v_daily, 6);
  v_receipt     := ROUND(COALESCE((p_loan->>'receipt_fee')::numeric, 0), 6);
  v_delivered   := v_amount - v_sundays_amt - v_receipt;
  v_balance     := v_obligation - v_sundays_amt;
  v_end         := (p_loan->>'end_date')::date;
  v_grace       := v_end + 7;

  INSERT INTO loans (
    id, client_id, route_id, collector_id,
    amount_requested, interest_rate, interest_amount, initial_obligation,
    term_days, daily_installment, frequency,
    sundays_prepaid_count, sundays_prepaid_amount, receipt_fee,
    amount_delivered, current_balance,
    disbursement_date, start_date, end_date, grace_end_date,
    status, refinanced_from_loan_id, created_by, created_at,
    wants_raffle, raffle_number
  ) VALUES (
    v_loan_id,
    v_client_id,
    v_route_id,
    COALESCE(NULLIF(p_loan->>'collector_id', '')::uuid, auth.uid()),
    v_amount,
    v_rate,
    v_interest,
    v_obligation,
    v_term,
    v_daily,
    COALESCE(NULLIF(p_loan->>'frequency', ''), 'DIARIO')::payment_frequency,
    v_sundays,
    v_sundays_amt,
    v_receipt,
    v_delivered,
    v_balance,
    (p_loan->>'disbursement_date')::date,
    (p_loan->>'start_date')::date,
    v_end,
    v_grace,
    COALESCE(NULLIF(p_loan->>'status', ''), 'ACTIVO')::loan_status,
    NULLIF(p_loan->>'refinanced_from_loan_id', '')::uuid,
    COALESCE(NULLIF(p_loan->>'created_by', '')::uuid, auth.uid()),
    COALESCE((p_client->>'created_at')::timestamptz, NOW()),
    COALESCE((p_loan->>'wants_raffle')::boolean, false),
    NULLIF(p_loan->>'raffle_number', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Si el id de préstamo ya existía en otra ruta/empresa, no se le agregan cuotas
  IF NOT EXISTS (
    SELECT 1 FROM loans WHERE id = v_loan_id AND route_id = ANY(v_allowed_routes)
  ) THEN
    RAISE EXCEPTION 'El préstamo pertenece a otra ruta o empresa';
  END IF;

  INSERT INTO loan_installments (
    id, loan_id, installment_number, scheduled_date, scheduled_amount,
    paid_amount, balance, status, day_type, is_prepaid, is_sunday, is_holiday, paid_date
  )
  SELECT
    (elem->>'id')::uuid,
    v_loan_id,
    (elem->>'installment_number')::int,
    (elem->>'scheduled_date')::date,
    v_daily,
    CASE WHEN COALESCE((elem->>'is_prepaid')::boolean, false) THEN v_daily ELSE ROUND(COALESCE((elem->>'paid_amount')::numeric, 0), 6) END,
    CASE WHEN COALESCE((elem->>'is_prepaid')::boolean, false) THEN 0 ELSE (v_daily - ROUND(COALESCE((elem->>'paid_amount')::numeric, 0), 6)) END,
    (elem->>'status')::installment_status,
    COALESCE(NULLIF(elem->>'day_type', ''), 'NORMAL')::day_type,
    COALESCE((elem->>'is_prepaid')::boolean, false),
    COALESCE((elem->>'is_sunday')::boolean, false),
    COALESCE((elem->>'is_holiday')::boolean, false),
    NULLIF(elem->>'paid_date', '')::date
  FROM jsonb_array_elements(p_installments) AS elem
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_inst_count FROM loan_installments WHERE loan_id = v_loan_id;
  v_expected := jsonb_array_length(COALESCE(p_installments, '[]'::jsonb));
  IF v_inst_count < v_expected THEN
    RAISE EXCEPTION 'Cuotas incompletas en el servidor (% / %)', v_inst_count, v_expected;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', v_client_id,
    'loan_id', v_loan_id,
    'installments', v_inst_count
  );
END;
$$;
