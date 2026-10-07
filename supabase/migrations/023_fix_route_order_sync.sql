-- ============================================================
-- MIGRATION 021: Corregir función de orden de clientes y sync_new_loan_bundle
-- 1. update_client_orders debe ser SECURITY DEFINER para actualizar la tabla
--    clients sin depender de contextos RLS en UPDATE ... FROM jsonb_to_recordset.
-- 2. sync_new_loan_bundle debe preservar route_order existente en caso de conflicto.
-- ============================================================

CREATE OR REPLACE FUNCTION update_client_orders(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_role text;
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para actualizar orden de ruta';
  END IF;

  UPDATE clients c
  SET route_order = u.route_order
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, route_order integer)
  WHERE c.id = u.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION update_client_orders(jsonb) TO authenticated;

-- Corregir sync_new_loan_bundle para preservar v_route_order si fue provisto, o la del cliente existente
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
  v_role text;
  v_route_id uuid;
  v_client_id uuid;
  v_loan_id uuid;
  v_inst_count int;
  v_expected int;
  v_amount numeric;
  v_rate numeric;
  v_interest numeric;
  v_obligation numeric;
  v_term int;
  v_daily numeric;
  v_sundays int;
  v_sundays_amt numeric;
  v_receipt numeric;
  v_delivered numeric;
  v_balance numeric;
  v_end date;
  v_grace date;
  v_route_order int;
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para sincronizar préstamos';
  END IF;

  v_client_id := (p_client->>'id')::uuid;
  v_loan_id := (p_loan->>'id')::uuid;
  v_route_id := COALESCE((p_loan->>'route_id')::uuid, (p_client->>'route_id')::uuid);
  v_route_order := NULLIF(p_client->>'route_order', '')::int;

  IF v_client_id IS NULL OR v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Faltan id de cliente o préstamo';
  END IF;

  IF v_route_id IS NULL THEN
    RAISE EXCEPTION 'El préstamo no tiene ruta asignada';
  END IF;

  IF v_role = 'COBRADOR' AND NOT (v_route_id = ANY(get_collector_route_ids())) THEN
    RAISE EXCEPTION 'La ruta no está asignada a este cobrador';
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
    route_id = COALESCE(clients.route_id, EXCLUDED.route_id),
    route_order = COALESCE(v_route_order, clients.route_order),
    photo_face_url = COALESCE(NULLIF(EXCLUDED.photo_face_url, ''), clients.photo_face_url),
    photo_doc_url = COALESCE(NULLIF(EXCLUDED.photo_doc_url, ''), clients.photo_doc_url),
    updated_at = NOW();

  v_amount := ROUND((p_loan->>'amount_requested')::numeric, 6);
  v_rate := ROUND((p_loan->>'interest_rate')::numeric, 4);
  v_interest := ROUND(v_amount * v_rate, 6);
  v_obligation := v_amount + v_interest;
  v_term := (p_loan->>'term_days')::int;
  v_daily := ROUND(v_obligation / v_term, 6);
  v_sundays := COALESCE((p_loan->>'sundays_prepaid_count')::int, 0);
  v_sundays_amt := ROUND(v_sundays * v_daily, 6);
  v_receipt := ROUND(COALESCE((p_loan->>'receipt_fee')::numeric, 0), 6);
  v_delivered := v_amount - v_sundays_amt - v_receipt;
  v_balance := v_obligation - v_sundays_amt;
  v_end := (p_loan->>'end_date')::date;
  v_grace := v_end + 7;

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

  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = v_client_id) THEN
    RAISE EXCEPTION 'El cliente no quedó guardado en el servidor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM loans WHERE id = v_loan_id) THEN
    RAISE EXCEPTION 'El préstamo no quedó guardado en el servidor';
  END IF;

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

GRANT EXECUTE ON FUNCTION sync_new_loan_bundle(jsonb, jsonb, jsonb) TO authenticated;
