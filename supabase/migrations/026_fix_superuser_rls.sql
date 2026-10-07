-- ============================================================
-- MIGRATION 026: COMPLETAR POLÍTICAS RLS PARA SUPER_ADMIN
-- Asegura que el SUPER_ADMIN tenga acceso completo a todas las tablas
-- ============================================================

-- Eliminar políticas antiguas que solo consideran ADMINISTRADOR
DROP POLICY IF EXISTS "users_admin_all" ON users;
DROP POLICY IF EXISTS "routes_admin_all" ON routes;
DROP POLICY IF EXISTS "companies_super_admin_all" ON companies;
DROP POLICY IF EXISTS "companies_tenant_select" ON companies;

-- Recrear políticas para incluir SUPER_ADMIN

-- USERS: SUPER_ADMIN y ADMINISTRADOR ven todos, usuario ve su propio perfil
DROP POLICY IF EXISTS "users_self_select" ON users;
CREATE POLICY "users_admin_all" ON users
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "users_self_select" ON users
  FOR SELECT USING (id = auth.uid());

-- ROUTES: SUPER_ADMIN y ADMINISTRADOR ven todas
DROP POLICY IF EXISTS "routes_collector_select" ON routes;
CREATE POLICY "routes_admin_all" ON routes
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "routes_collector_select" ON routes
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND id = ANY(get_collector_route_ids())
  );

-- COMPANIES: SUPER_ADMIN ve todas, ADMINISTRADOR ve solo su empresa
DROP POLICY IF EXISTS "companies_tenant_select" ON companies;
CREATE POLICY "companies_super_admin_all" ON companies
  FOR ALL USING (is_super_admin());

CREATE POLICY "companies_tenant_select" ON companies
  FOR SELECT USING (id = get_user_company_id());

-- ROUTE_ASSIGNMENTS
DROP POLICY IF EXISTS "route_assignments_admin_all" ON route_assignments;
DROP POLICY IF EXISTS "route_assignments_collector_select" ON route_assignments;
CREATE POLICY "route_assignments_admin_all" ON route_assignments
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "route_assignments_collector_select" ON route_assignments
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
  );

-- CLIENTS
DROP POLICY IF EXISTS "clients_admin_all" ON clients;
DROP POLICY IF EXISTS "clients_collector_select" ON clients;
DROP POLICY IF EXISTS "clients_collector_insert" ON clients;
CREATE POLICY "clients_admin_all" ON clients
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "clients_collector_select" ON clients
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

CREATE POLICY "clients_collector_insert" ON clients
  FOR INSERT WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- LOANS
DROP POLICY IF EXISTS "loans_admin_all" ON loans;
DROP POLICY IF EXISTS "loans_collector_select" ON loans;
CREATE POLICY "loans_admin_all" ON loans
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "loans_collector_select" ON loans
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

-- LOAN_INSTALLMENTS
DROP POLICY IF EXISTS "loan_installments_admin_all" ON loan_installments;
DROP POLICY IF EXISTS "loan_installments_collector_select" ON loan_installments;
CREATE POLICY "loan_installments_admin_all" ON loan_installments
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "loan_installments_collector_select" ON loan_installments
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (
      SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
    )
  );

-- PAYMENTS
DROP POLICY IF EXISTS "payments_admin_all" ON payments;
DROP POLICY IF EXISTS "payments_collector_select" ON payments;
CREATE POLICY "payments_admin_all" ON payments
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "payments_collector_select" ON payments
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (
      SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
    )
  );

-- EXPENSES
DROP POLICY IF EXISTS "expenses_admin_all" ON expenses;
DROP POLICY IF EXISTS "expenses_collector_own" ON expenses;
DROP POLICY IF EXISTS "expenses_collector_insert" ON expenses;
CREATE POLICY "expenses_admin_all" ON expenses
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

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

-- DAILY_CLOSINGS
DROP POLICY IF EXISTS "daily_closings_admin_all" ON daily_closings;
DROP POLICY IF EXISTS "daily_closings_collector_select" ON daily_closings;
CREATE POLICY "daily_closings_admin_all" ON daily_closings
  FOR ALL USING (is_super_admin() OR get_user_role() = 'ADMINISTRADOR');

CREATE POLICY "daily_closings_collector_select" ON daily_closings
  FOR SELECT USING (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
  );

-- ROLES: SUPER_ADMIN puede ver todos los roles
DROP POLICY IF EXISTS "roles_super_admin_all" ON roles;
CREATE POLICY "roles_super_admin_all" ON roles
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "roles_admin_select" ON roles;
CREATE POLICY "roles_admin_select" ON roles
  FOR SELECT USING (get_user_role() = 'ADMINISTRADOR');

-- SYSTEM_SETTINGS: SUPER_ADMIN y ADMINISTRADOR pueden ver/modificar
DROP POLICY IF EXISTS "system_settings_super_admin_all" ON system_settings;
CREATE POLICY "system_settings_super_admin_all" ON system_settings
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "system_settings_admin_all" ON system_settings;
CREATE POLICY "system_settings_admin_all" ON system_settings
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

-- EXPENSE_CATEGORIES: SUPER_ADMIN y ADMINISTRADOR pueden ver/modificar
DROP POLICY IF EXISTS "expense_categories_super_admin_all" ON expense_categories;
CREATE POLICY "expense_categories_super_admin_all" ON expense_categories
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "expense_categories_admin_all" ON expense_categories;
CREATE POLICY "expense_categories_admin_all" ON expense_categories
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');

-- HOLIDAYS: SUPER_ADMIN y ADMINISTRADOR pueden ver/modificar
DROP POLICY IF EXISTS "holidays_super_admin_all" ON holidays;
CREATE POLICY "holidays_super_admin_all" ON holidays
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "holidays_admin_all" ON holidays;
CREATE POLICY "holidays_admin_all" ON holidays
  FOR ALL USING (get_user_role() = 'ADMINISTRADOR');
