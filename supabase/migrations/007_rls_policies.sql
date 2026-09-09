-- ============================================================
-- MIGRATION 007: ROW LEVEL SECURITY (RLS)
-- Reemplaza el middleware routeGuard del backend tradicional.
-- Cada cobrador solo puede ver y operar sobre sus propios datos.
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_installments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE refinancing          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays             ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings      ENABLE ROW LEVEL SECURITY;

-- ─── FUNCIÓN HELPER: rol del usuario actual ────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT r.name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── FUNCIÓN HELPER: rutas del cobrador actual ────────────
CREATE OR REPLACE FUNCTION get_collector_route_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY_AGG(DISTINCT ra.route_id)
  FROM route_assignments ra
  WHERE ra.collector_id = auth.uid()
    AND ra.date_end IS NULL
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── POLÍTICAS: USERS ─────────────────────────────────────
-- Admin ve todos. Cada usuario ve su propio perfil.
CREATE POLICY "users_admin_all" ON users
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "users_self_select" ON users
  FOR SELECT USING (id = auth.uid());

-- ─── POLÍTICAS: ROUTES ────────────────────────────────────
-- Admin ve todas. Cobrador solo ve sus rutas activas.
CREATE POLICY "routes_admin_all" ON routes
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "routes_collector_select" ON routes
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND id = ANY(get_collector_route_ids())
  );

-- ─── POLÍTICAS: ROUTE_ASSIGNMENTS ─────────────────────────
CREATE POLICY "route_assignments_admin_all" ON route_assignments
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "route_assignments_collector_select" ON route_assignments
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
  );

-- ─── POLÍTICAS: CLIENTS ───────────────────────────────────
-- Admin: todos. Cobrador: solo clientes de sus rutas.
CREATE POLICY "clients_admin_all" ON clients
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "clients_collector_select" ON clients
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- Cobrador puede crear clientes en sus rutas
CREATE POLICY "clients_collector_insert" ON clients
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- Cobrador NO puede eliminar clientes — solo admin

-- ─── POLÍTICAS: LOANS ─────────────────────────────────────
CREATE POLICY "loans_admin_all" ON loans
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "loans_collector_select" ON loans
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

CREATE POLICY "loans_collector_insert" ON loans
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- ─── POLÍTICAS: LOAN_INSTALLMENTS ─────────────────────────
CREATE POLICY "installments_admin_all" ON loan_installments
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "installments_collector_select" ON loan_installments
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (
      SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
    )
  );

-- ─── POLÍTICAS: PAYMENTS ──────────────────────────────────
CREATE POLICY "payments_admin_all" ON payments
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "payments_collector_select" ON payments
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
  );

-- Cobrador puede insertar pagos (via Edge Function que valida)
CREATE POLICY "payments_collector_insert" ON payments
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
    AND route_id = ANY(get_collector_route_ids())
  );

-- Cobrador NO puede UPDATE ni DELETE pagos

-- ─── POLÍTICAS: PAYMENT_ALLOCATIONS ───────────────────────
CREATE POLICY "allocations_admin_all" ON payment_allocations
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "allocations_collector_select" ON payment_allocations
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND payment_id IN (
      SELECT id FROM payments WHERE collector_id = auth.uid()
    )
  );

-- ─── POLÍTICAS: EXPENSES ──────────────────────────────────
CREATE POLICY "expenses_admin_all" ON expenses
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "expenses_collector_own" ON expenses
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
  );

CREATE POLICY "expenses_collector_insert" ON expenses
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
    AND route_id = ANY(get_collector_route_ids())
  );

-- ─── POLÍTICAS: DAILY_CLOSINGS ────────────────────────────
CREATE POLICY "closings_admin_all" ON daily_closings
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "closings_collector_select" ON daily_closings
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
  );

-- ─── POLÍTICAS: REFINANCING ───────────────────────────────
CREATE POLICY "refinancing_admin_all" ON refinancing
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "refinancing_collector_select" ON refinancing
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND original_loan_id IN (
      SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
    )
  );

-- ─── POLÍTICAS: AUDIT_LOGS ────────────────────────────────
-- Solo admin puede ver la auditoría
CREATE POLICY "audit_admin_only" ON audit_logs
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

-- ─── POLÍTICAS: SYNC_OPERATIONS ───────────────────────────
CREATE POLICY "sync_admin_all" ON sync_operations
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "sync_collector_own" ON sync_operations
  FOR ALL USING (
    get_user_role() = 'COBRADOR'
    AND user_id = auth.uid()
  );

-- ─── POLÍTICAS: DEVICES ───────────────────────────────────
CREATE POLICY "devices_admin_all" ON devices
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "devices_collector_own" ON devices
  FOR ALL USING (
    get_user_role() = 'COBRADOR'
    AND user_id = auth.uid()
  );

-- ─── POLÍTICAS: TABLAS DE CATÁLOGO (holidays, categories, settings) ──
-- Todos pueden leer. Solo admin puede escribir.
CREATE POLICY "holidays_read_all" ON holidays FOR SELECT USING (true);
CREATE POLICY "holidays_admin_write" ON holidays FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "expense_categories_read_all" ON expense_categories FOR SELECT USING (true);
CREATE POLICY "expense_categories_admin_write" ON expense_categories FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "system_settings_read_all" ON system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_admin_write" ON system_settings FOR ALL USING (get_user_role() = 'ADMINISTRADOR');
