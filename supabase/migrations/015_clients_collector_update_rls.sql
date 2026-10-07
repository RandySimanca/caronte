-- ============================================================
-- MIGRATION 014: PERMITIR A COBRADORES ACTUALIZAR CLIENTES
-- ============================================================

-- Agregamos la política faltante para permitir que los cobradores
-- puedan editar (UPDATE) los datos de los clientes que pertenecen a sus rutas.

CREATE POLICY "clients_collector_update" ON clients
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );
