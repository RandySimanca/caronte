-- ============================================================
-- MIGRATION 019: Orden de ruta en una sola llamada
-- Antes, cada cambio de orden enviaba un UPDATE por cliente (lento y fácil de dejar a medias).
-- Esta función aplica todos los cambios de orden en una sola transacción.
-- SECURITY INVOKER: respeta las políticas RLS de clients (cobrador solo actualiza su ruta).
-- ============================================================
CREATE OR REPLACE FUNCTION update_client_orders(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE clients c
  SET route_order = u.route_order
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, route_order integer)
  WHERE c.id = u.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION update_client_orders(jsonb) TO authenticated;
