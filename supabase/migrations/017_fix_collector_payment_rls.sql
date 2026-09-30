-- ============================================================
-- MIGRATION 017: FIX RLS PARA COBROS DEL COBRADOR
--
-- APLICAR EN: Supabase Dashboard → SQL Editor
-- URL: https://supabase.com/dashboard/project/qmbugzvzkvkiqwazxbvn/sql/new
--
-- PROBLEMA RAIZ:
--   La política payments_collector_insert exigía collector_id = auth.uid()
--   pero el préstamo puede tener el UUID del ADMIN como collector_id
--   (cuando el admin creó el préstamo). El cobrador logueado tiene otro UUID.
--
-- TAMBIÉN FALTABAN políticas UPDATE en loan_installments y loans,
-- por lo que el servidor nunca recibía los cambios de cuotas ni saldo.
-- ============================================================

-- ─── 1. PAYMENTS INSERT ──────────────────────────────────────
-- Quitar la restricción collector_id = auth.uid() del INSERT.
-- La seguridad la garantiza route_id (el cobrador solo puede insertar
-- en rutas que tiene asignadas).
DROP POLICY IF EXISTS "payments_collector_insert" ON payments;

CREATE POLICY "payments_collector_insert" ON payments
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- ─── 2. PAYMENTS UPDATE ──────────────────────────────────────
-- Para reintentos de upsert (idempotencia offline).
DROP POLICY IF EXISTS "payments_collector_update" ON payments;

CREATE POLICY "payments_collector_update" ON payments
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- ─── 3. LOAN_INSTALLMENTS UPDATE ─────────────────────────────
-- El cobrador actualiza estado de cuotas al sincronizar el cobro.
DROP POLICY IF EXISTS "installments_collector_update" ON loan_installments;

CREATE POLICY "installments_collector_update" ON loan_installments
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (
      SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
    )
  );

-- ─── 4. LOANS UPDATE ─────────────────────────────────────────
-- El cobrador actualiza current_balance al sincronizar.
DROP POLICY IF EXISTS "loans_collector_update" ON loans;

CREATE POLICY "loans_collector_update" ON loans
  FOR UPDATE USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- ─── VERIFICAR QUE SE APLICARON ──────────────────────────────
-- Descomenta esta query para confirmar que las políticas existen:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('payments', 'loan_installments', 'loans')
--   AND policyname LIKE '%collector%'
-- ORDER BY tablename, cmd;
