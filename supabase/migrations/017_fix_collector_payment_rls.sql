-- ============================================================
-- MIGRATION 017: FIX RLS PARA COBROS DEL COBRADOR
-- Problema: el cobrador recibía 403 al sincronizar cobros porque:
--   1. payments INSERT: exigía collector_id = auth.uid() pero el
--      payload podía traer 'local-user' o el uuid aún no asignado.
--   2. loan_installments: no existía política UPDATE → sync fallaba.
--   3. loans: no existía política UPDATE → current_balance nunca
--      se actualizaba en el servidor.
-- ============================================================

-- ─── 1. PAYMENTS ─────────────────────────────────────────────
-- Reemplazar la política de INSERT para que el cobrador pueda
-- insertar pagos de sus propios préstamos (route_id en sus rutas),
-- sin importar si el campo collector_id lleva su uuid o 'local-user'
-- (el SyncService ya resuelve el uuid real antes de insertar).
DROP POLICY IF EXISTS "payments_collector_insert" ON payments;

CREATE POLICY "payments_collector_insert" ON payments
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- El cobrador puede re-enviar (upsert) su propio pago si falla la primera vez
DROP POLICY IF EXISTS "payments_collector_update" ON payments;

CREATE POLICY "payments_collector_update" ON payments
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- ─── 2. LOAN_INSTALLMENTS: UPDATE ────────────────────────────
-- El cobrador debe poder actualizar el estado de las cuotas
-- (paid_amount, balance, status, paid_date) al sincronizar un cobro.
DROP POLICY IF EXISTS "installments_collector_update" ON loan_installments;

CREATE POLICY "installments_collector_update" ON loan_installments
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (
      SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
    )
  );

-- ─── 3. LOANS: UPDATE ────────────────────────────────────────
-- El cobrador debe poder actualizar current_balance al sincronizar.
DROP POLICY IF EXISTS "loans_collector_update" ON loans;

CREATE POLICY "loans_collector_update" ON loans
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );
