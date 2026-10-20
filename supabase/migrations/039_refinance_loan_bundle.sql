-- =============================================================================
-- MIGRATION 039: Refinanciación desde el cobrador
-- Cliente con préstamo activo (pocas cuotas por pagar o atrasado) que quiere un
-- préstamo nuevo. Reglas:
--   * El nuevo préstamo (tarjeta) se genera por el valor TOTAL solicitado.
--   * Del dinero a entregar se descuenta el saldo pendiente del préstamo anterior,
--     además de domingos prepagados y boleta:
--       amount_delivered = monto - saldo_pendiente - domingos - boleta
--   * El préstamo anterior pasa a REFINANCIADO y se registra en `refinancing`.
-- El saldo pendiente lo calcula el servidor (no se confía en el celular).
-- Idempotente: reintentar la misma operación no duplica nada.
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_refinance_bundle(
  p_client jsonb,
  p_loan jsonb,
  p_installments jsonb,
  p_original_loan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           text;
  v_allowed_routes uuid[];
  v_new_loan_id    uuid := (p_loan->>'id')::uuid;
  v_client_id      uuid := (p_client->>'id')::uuid;
  v_orig           loans%ROWTYPE;
  v_pending        numeric;
  v_res            jsonb;
  v_net            numeric;
  v_requested      numeric;
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para refinanciar préstamos';
  END IF;

  -- Reintento de una operación ya aplicada
  IF EXISTS (
    SELECT 1 FROM refinancing
    WHERE original_loan_id = p_original_loan_id AND new_loan_id = v_new_loan_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_applied', true, 'loan_id', v_new_loan_id);
  END IF;

  IF v_role = 'COBRADOR' THEN
    v_allowed_routes := get_collector_route_ids();
  ELSE
    v_allowed_routes := get_company_route_ids();
  END IF;

  SELECT * INTO v_orig FROM loans WHERE id = p_original_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo a refinanciar no existe';
  END IF;
  IF NOT (v_orig.route_id = ANY(v_allowed_routes)) THEN
    RAISE EXCEPTION 'El préstamo a refinanciar no pertenece a este usuario o empresa';
  END IF;
  IF v_orig.client_id <> v_client_id THEN
    RAISE EXCEPTION 'El préstamo a refinanciar no corresponde a este cliente';
  END IF;
  IF v_orig.status <> 'ACTIVO' THEN
    RAISE EXCEPTION 'El préstamo anterior ya no está activo (estado: %)', v_orig.status;
  END IF;

  -- Saldo pendiente real según las cuotas; si no hay cuotas, el saldo del préstamo
  SELECT COALESCE(SUM(balance), 0) INTO v_pending
  FROM loan_installments
  WHERE loan_id = p_original_loan_id
    AND status IN ('PENDIENTE', 'PARCIAL', 'ATRASADA');
  IF v_pending <= 0 THEN
    v_pending := COALESCE(v_orig.current_balance, 0);
  END IF;
  IF v_pending <= 0 THEN
    RAISE EXCEPTION 'El préstamo anterior no tiene saldo pendiente; crea un préstamo nuevo normal';
  END IF;

  v_requested := (p_loan->>'amount_requested')::numeric;

  -- Cierra el préstamo anterior primero (así nunca hay dos ACTIVOS del mismo cliente)
  UPDATE loans SET status = 'REFINANCIADO' WHERE id = p_original_loan_id;

  -- Crea cliente (upsert/reactiva), préstamo nuevo y cuotas con la lógica ya probada
  v_res := sync_new_loan_bundle(p_client, p_loan, p_installments);
  IF v_res IS NULL OR (v_res->>'ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'No se pudo crear el préstamo nuevo de la refinanciación';
  END IF;

  -- Descuento del saldo anterior sobre lo entregado
  UPDATE loans
  SET refinanced_from_loan_id = p_original_loan_id,
      amount_delivered = ROUND(amount_delivered - v_pending, 6)
  WHERE id = v_new_loan_id
  RETURNING amount_delivered INTO v_net;

  IF v_net IS NULL OR v_net < 0 THEN
    RAISE EXCEPTION 'El monto nuevo (%) no alcanza para cubrir el saldo pendiente (%) y descuentos', v_requested, v_pending;
  END IF;

  INSERT INTO refinancing (
    original_loan_id, new_loan_id, pending_balance, commercial_value, net_delivered, authorized_by
  ) VALUES (
    p_original_loan_id, v_new_loan_id, ROUND(v_pending, 6), v_requested, v_net, auth.uid()
  );

  RETURN v_res || jsonb_build_object(
    'refinanced', true,
    'pending_balance', v_pending,
    'net_delivered', v_net
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION sync_refinance_bundle(jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION sync_refinance_bundle(jsonb, jsonb, jsonb, uuid) TO authenticated;
