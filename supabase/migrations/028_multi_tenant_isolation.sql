-- ============================================================
-- MIGRATION 028: AISLAMIENTO MULTIEMPRESA COMPLETO
-- Reemplaza la 026 (que tenía errores y quitaba el filtro por empresa)
-- Implementa aislamiento por empresa en todas las tablas
-- ============================================================

-- 1. NEUTRALIZAR LA 026 (ya no es necesaria, esta migración la sobreescribe)
-- La 026 tenía errores de sintaxis (DROP POLICY IF EXISTS EXISTS) y removía
-- el filtro por empresa de users y routes. Esta migración corrige todo eso.

-- 2. FUNCIONES AUXILIARES (con SET search_path = public)
-- ============================================================

-- get_user_role() - recrear con search_path explícito
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = auth.uid()
$$;

-- get_collector_route_ids() - recrear con search_path explícito y fallback a array vacío
CREATE OR REPLACE FUNCTION get_collector_route_ids()
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT ra.route_id), ARRAY[]::uuid[])
  FROM route_assignments ra
  WHERE ra.collector_id = auth.uid()
    AND ra.date_end IS NULL
$$;

-- get_user_company_id() - recrear con search_path explícito
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.company_id
  FROM users u
  WHERE u.id = auth.uid()
$$;

-- is_super_admin() - recrear con search_path explícito
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = auth.uid() AND r.name = 'SUPER_ADMIN'
  )
$$;

-- get_company_route_ids() - NUEVA: devuelve todas las rutas de la empresa del usuario
CREATE OR REPLACE FUNCTION get_company_route_ids()
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(r.id), ARRAY[]::uuid[])
  FROM routes r WHERE r.company_id = get_user_company_id()
$$;

-- company_is_active() - NUEVA: verifica si la empresa está activa y no vencida
CREATE OR REPLACE FUNCTION company_is_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT c.status = 'ACTIVE'
       AND (c.subscription_expires_at IS NULL OR c.subscription_expires_at > NOW())
    FROM companies c WHERE c.id = get_user_company_id()
  ), false)
$$;

-- 3. DATOS: BACKFILL Y CONVERSIÓN A POR EMPRESA
-- ============================================================

-- Backfill: users y routes con company_id NULL → empresa por defecto
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL AND id NOT IN (
  SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'SUPER_ADMIN'
);

UPDATE routes SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- routes.company_id ahora es NOT NULL
ALTER TABLE routes ALTER COLUMN company_id SET NOT NULL;

-- Cambiar ON DELETE SET NULL a ON DELETE RESTRICT para evitar huérfanos
ALTER TABLE users DROP CONSTRAINT users_company_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE routes DROP CONSTRAINT routes_company_id_fkey;
ALTER TABLE routes ADD CONSTRAINT routes_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_routes_company ON routes(company_id);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

-- 4. CONFIGURACIÓN POR EMPRESA (system_settings, expense_categories, holidays)
-- ============================================================

-- Agregar company_id a system_settings
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE system_settings SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE system_settings ALTER COLUMN company_id SET NOT NULL;

-- Reemplazar UNIQUE global por UNIQUE (company_id, key)
ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_key_key;
ALTER TABLE system_settings ADD CONSTRAINT system_settings_company_key UNIQUE (company_id, key);

-- Agregar company_id a expense_categories
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE expense_categories SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE expense_categories ALTER COLUMN company_id SET NOT NULL;

-- Reemplazar UNIQUE global por UNIQUE (company_id, name)
ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_company_name UNIQUE (company_id, name);

-- Agregar company_id a holidays
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE holidays SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE holidays ALTER COLUMN company_id SET NOT NULL;

-- Reemplazar UNIQUE global por UNIQUE (company_id, holiday_date)
ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_holiday_date_key;
ALTER TABLE holidays ADD CONSTRAINT holidays_company_date UNIQUE (company_id, holiday_date);

-- Función para copiar configuración por defecto a nueva empresa
CREATE OR REPLACE FUNCTION seed_company_defaults(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Copiar system_settings de la empresa por defecto
  INSERT INTO system_settings (company_id, key, value, description, updated_by, updated_at)
  SELECT p_company_id, key, value, description, updated_by, NOW()
  FROM system_settings
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, key) DO NOTHING;

  -- Copiar expense_categories de la empresa por defecto
  INSERT INTO expense_categories (company_id, name, description, active, is_system)
  SELECT p_company_id, name, description, active, is_system
  FROM expense_categories
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, name) DO NOTHING;

  -- Copiar holidays de la empresa por defecto
  INSERT INTO holidays (company_id, holiday_date, name, country_code, active)
  SELECT p_company_id, holiday_date, name, country_code, active
  FROM holidays
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, holiday_date) DO NOTHING;
END;
$$;

-- Solo service_role puede ejecutar seed_company_defaults
REVOKE EXECUTE ON FUNCTION seed_company_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seed_company_defaults(uuid) TO service_role;

-- 5. POLÍTICAS RLS POR EMPRESA
-- ============================================================

-- CLIENTS
DROP POLICY IF EXISTS clients_admin_all ON clients;
CREATE POLICY clients_admin_all ON clients FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS clients_collector_select ON clients;
CREATE POLICY clients_collector_select ON clients FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND route_id = ANY(get_collector_route_ids()));

DROP POLICY IF EXISTS clients_collector_insert ON clients;
CREATE POLICY clients_collector_insert ON clients FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

DROP POLICY IF EXISTS clients_super_admin_select ON clients;
CREATE POLICY clients_super_admin_select ON clients FOR SELECT USING (is_super_admin());

-- LOANS
DROP POLICY IF EXISTS loans_admin_all ON loans;
CREATE POLICY loans_admin_all ON loans FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS loans_collector_select ON loans FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND route_id = ANY(get_collector_route_ids()));

DROP POLICY IF EXISTS loans_collector_insert ON loans FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

DROP POLICY IF EXISTS loans_collector_update ON loans FOR UPDATE
  USING (get_user_role() = 'COBRADOR' AND route_id = ANY(get_collector_route_ids()));

DROP POLICY IF EXISTS loans_super_admin_select ON loans FOR SELECT USING (is_super_admin());

-- LOAN_INSTALLMENTS
DROP POLICY IF EXISTS installments_admin_all ON loan_installments;
CREATE POLICY installments_admin_all ON loan_installments FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids())
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids())
  ));

DROP POLICY IF EXISTS installments_collector_select ON loan_installments FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
  ));

DROP POLICY IF EXISTS installments_collector_insert ON loan_installments FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids()))
    AND company_is_active()
  );

DROP POLICY IF EXISTS installments_collector_update ON loan_installments FOR UPDATE
  USING (get_user_role() = 'COBRADOR' AND loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
  ));

DROP POLICY IF EXISTS installments_super_admin_select ON loan_installments FOR SELECT USING (is_super_admin());

-- PAYMENTS
DROP POLICY IF EXISTS payments_admin_all ON payments;
CREATE POLICY payments_admin_all ON payments FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS payments_collector_select ON payments FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

DROP POLICY IF EXISTS payments_collector_insert ON payments FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

DROP POLICY IF EXISTS payments_super_admin_select ON payments FOR SELECT USING (is_super_admin());

-- PAYMENT_ALLOCATIONS
DROP POLICY IF EXISTS allocations_admin_all ON payment_allocations;
CREATE POLICY allocations_admin_all ON payment_allocations FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND payment_id IN (
    SELECT id FROM payments WHERE route_id = ANY(get_company_route_ids())
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND payment_id IN (
    SELECT id FROM payments WHERE route_id = ANY(get_company_route_ids())
  ));

DROP POLICY IF EXISTS allocations_collector_select ON payment_allocations FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND payment_id IN (
    SELECT id FROM payments WHERE collector_id = auth.uid()
  ));

DROP POLICY IF EXISTS allocations_super_admin_select ON payment_allocations FOR SELECT USING (is_super_admin());

-- EXPENSES
DROP POLICY IF EXISTS expenses_admin_all ON expenses;
CREATE POLICY expenses_admin_all ON expenses FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS expenses_collector_own ON expenses FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

DROP POLICY IF EXISTS expenses_collector_insert ON expenses FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

DROP POLICY IF EXISTS expenses_super_admin_select ON expenses FOR SELECT USING (is_super_admin());

-- DAILY_CLOSINGS
DROP POLICY IF EXISTS daily_closings_admin_all ON daily_closings;
CREATE POLICY daily_closings_admin_all ON daily_closings FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS daily_closings_collector_select ON daily_closings FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

DROP POLICY IF EXISTS daily_closings_super_admin_select ON daily_closings FOR SELECT USING (is_super_admin());

-- REFINANCING
DROP POLICY IF EXISTS refinancing_admin_all ON refinancing;
CREATE POLICY refinancing_admin_all ON refinancing FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND original_loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids())
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND original_loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids())
  ));

DROP POLICY IF EXISTS refinancing_collector_select ON refinancing FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND original_loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids())
  ));

DROP POLICY IF EXISTS refinancing_super_admin_select ON refinancing FOR SELECT USING (is_super_admin());

-- AUDIT_LOGS
DROP POLICY IF EXISTS audit_admin_only ON audit_logs;
CREATE POLICY audit_admin_only ON audit_logs FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS audit_super_admin_select ON audit_logs FOR SELECT USING (is_super_admin());

-- SYNC_OPERATIONS
DROP POLICY IF EXISTS sync_admin_all ON sync_operations;
CREATE POLICY sync_admin_all ON sync_operations FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND user_id IN (
    SELECT id FROM users WHERE company_id = get_user_company_id()
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND user_id IN (
    SELECT id FROM users WHERE company_id = get_user_company_id()
  ));

DROP POLICY IF EXISTS sync_collector_own ON sync_operations FOR ALL
  USING (get_user_role() = 'COBRADOR' AND user_id = auth.uid())
  WITH CHECK (get_user_role() = 'COBRADOR' AND user_id = auth.uid());

DROP POLICY IF EXISTS sync_super_admin_select ON sync_operations FOR SELECT USING (is_super_admin());

-- DEVICES
DROP POLICY IF EXISTS devices_admin_all ON devices;
CREATE POLICY devices_admin_all ON devices FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND user_id IN (
    SELECT id FROM users WHERE company_id = get_user_company_id()
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND user_id IN (
    SELECT id FROM users WHERE company_id = get_user_company_id()
  ));

DROP POLICY IF EXISTS devices_collector_own ON devices FOR ALL
  USING (get_user_role() = 'COBRADOR' AND user_id = auth.uid())
  WITH CHECK (get_user_role() = 'COBRADOR' AND user_id = auth.uid());

DROP POLICY IF EXISTS devices_super_admin_select ON devices FOR SELECT USING (is_super_admin());

-- USERS
DROP POLICY IF EXISTS users_admin_all ON users;
CREATE POLICY users_admin_all ON users FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

DROP POLICY IF EXISTS users_self_select ON users;
CREATE POLICY users_self_select ON users FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS users_super_admin_all ON users;
CREATE POLICY users_super_admin_all ON users FOR ALL USING (is_super_admin());

-- ROUTES
DROP POLICY IF EXISTS routes_admin_all ON routes;
CREATE POLICY routes_admin_all ON routes FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

DROP POLICY IF EXISTS routes_collector_select ON routes FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND id = ANY(get_collector_route_ids()));

DROP POLICY IF EXISTS routes_super_admin_all ON routes;
CREATE POLICY routes_super_admin_all ON routes FOR ALL USING (is_super_admin());

-- ROUTE_ASSIGNMENTS
DROP POLICY IF EXISTS route_assignments_admin_all ON route_assignments;
CREATE POLICY route_assignments_admin_all ON route_assignments FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

DROP POLICY IF EXISTS route_assignments_collector_select ON route_assignments FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

DROP POLICY IF EXISTS route_assignments_super_admin_all ON route_assignments;
CREATE POLICY route_assignments_super_admin_all ON route_assignments FOR ALL USING (is_super_admin());

-- COMPANIES
DROP POLICY IF EXISTS companies_super_admin_all ON companies;
CREATE POLICY companies_super_admin_all ON companies FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS companies_tenant_select ON companies;
CREATE POLICY companies_tenant_select ON companies FOR SELECT
  USING (id = get_user_company_id());

-- ROLES
DROP POLICY IF EXISTS roles_super_admin_all ON roles;
CREATE POLICY roles_super_admin_all ON roles FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS roles_admin_select ON roles;
CREATE POLICY roles_admin_select ON roles FOR SELECT USING (get_user_role() = 'ADMINISTRADOR');

-- SYSTEM_SETTINGS
DROP POLICY IF EXISTS system_settings_read_all ON system_settings;
DROP POLICY IF EXISTS system_settings_admin_write ON system_settings;

CREATE POLICY system_settings_admin_all ON system_settings FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY system_settings_super_admin_all ON system_settings FOR ALL USING (is_super_admin());

CREATE POLICY system_settings_collector_select ON system_settings FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND company_id = get_user_company_id());

-- EXPENSE_CATEGORIES
DROP POLICY IF EXISTS expense_categories_read_all ON expense_categories;
DROP POLICY IF EXISTS expense_categories_admin_write ON expense_categories;

CREATE POLICY expense_categories_admin_all ON expense_categories FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY expense_categories_super_admin_all ON expense_categories FOR ALL USING (is_super_admin());

CREATE POLICY expense_categories_collector_select ON expense_categories FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND company_id = get_user_company_id());

-- HOLIDAYS
DROP POLICY IF EXISTS holidays_read_all ON holidays;
DROP POLICY IF EXISTS holidays_admin_write ON holidays;

CREATE POLICY holidays_admin_all ON holidays FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY holidays_super_admin_all ON holidays FOR ALL USING (is_super_admin());

CREATE POLICY holidays_collector_select ON holidays FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND company_id = get_user_company_id());

-- Tablas de lotería (lottery_draws, lottery_winners) - solo SELECT para super admin, admin de su empresa
DROP POLICY IF EXISTS lottery_draws_admin_all ON lottery_draws;
CREATE POLICY lottery_draws_admin_all ON lottery_draws FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND processed_by IN (
    SELECT id FROM users WHERE company_id = get_user_company_id()
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND processed_by IN (
    SELECT id FROM users WHERE company_id = get_user_company_id()
  ));

DROP POLICY IF EXISTS lottery_draws_super_admin_all ON lottery_draws;
CREATE POLICY lottery_draws_super_admin_all ON lottery_draws FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS lottery_winners_admin_all ON lottery_winners;
CREATE POLICY lottery_winners_admin_all ON lottery_winners FOR ALL
  USING (get_user_role() = 'ADMINISTRADOR' AND loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids())
  ))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND loan_id IN (
    SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids())
  ));

DROP POLICY IF EXISTS lottery_winners_super_admin_all ON lottery_winners;
CREATE POLICY lottery_winners_super_admin_all ON lottery_winners FOR ALL USING (is_super_admin());

-- 6. TRIGGERS DE PROTECCIÓN
-- ============================================================

-- Trigger para proteger privilegios de usuarios
CREATE OR REPLACE FUNCTION guard_users_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_super_role uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;          -- service_role / SQL Editor
  IF is_super_admin() THEN RETURN NEW; END IF;
  SELECT id INTO v_super_role FROM roles WHERE name = 'SUPER_ADMIN';
  IF NEW.role_id = v_super_role THEN
    RAISE EXCEPTION 'No tienes permiso para asignar el rol SUPER_ADMIN';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'No se puede cambiar la empresa de un usuario';
    END IF;
    IF NEW.id = auth.uid() AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
      RAISE EXCEPTION 'No puedes cambiar tu propio rol';
    END IF;
  ELSE
    NEW.company_id := get_user_company_id();               -- el admin solo crea en su empresa
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_users_privileges
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_users_privileges();

-- Trigger para forzar company_id en routes y validar límites
CREATE OR REPLACE FUNCTION guard_routes_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max_routes int;
  v_current_count int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;          -- service_role / SQL Editor
  IF is_super_admin() THEN RETURN NEW; END IF;

  -- FORZAR company_id
  IF TG_OP = 'INSERT' THEN
    NEW.company_id := get_user_company_id();
  END IF;

  -- Validar límite de rutas del plan
  IF TG_OP = 'INSERT' AND NEW.company_id IS NOT NULL THEN
    SELECT max_routes INTO v_max_routes FROM companies WHERE id = NEW.company_id;
    SELECT COUNT(*) INTO v_current_count FROM routes WHERE company_id = NEW.company_id;

    IF v_current_count >= v_max_routes THEN
      RAISE EXCEPTION 'Límite de rutas del plan alcanzado (% de %)', v_current_count, v_max_routes;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_routes_company
  BEFORE INSERT OR UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION guard_routes_company();

-- Trigger para validar límite de cobradores al crear usuario con rol COBRADOR
CREATE OR REPLACE FUNCTION guard_collectors_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max_collectors int;
  v_current_count int;
  v_role_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;          -- service_role / SQL Editor
  IF is_super_admin() THEN RETURN NEW; END IF;

  -- Solo validar en INSERT para usuarios
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'users' THEN
    SELECT name INTO v_role_name FROM roles WHERE id = NEW.role_id;

    IF v_role_name = 'COBRADOR' AND NEW.company_id IS NOT NULL THEN
      SELECT max_collectors INTO v_max_collectors FROM companies WHERE id = NEW.company_id;
      SELECT COUNT(*) INTO v_current_count FROM users
      WHERE company_id = NEW.company_id
        AND role_id = (SELECT id FROM roles WHERE name = 'COBRADOR');

      IF v_current_count >= v_max_collectors THEN
        RAISE EXCEPTION 'Límite de cobradores del plan alcanzado (% de %)', v_current_count, v_max_collectors;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_collectors_limit
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION guard_collectors_limit();

-- 7. CORRECCIÓN DE FUNCIONES RPC
-- ============================================================

-- update_client_orders: validar ruta permitida
CREATE OR REPLACE FUNCTION update_client_orders(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_role text;
  v_allowed_routes uuid[];
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para actualizar orden de ruta';
  END IF;

  -- Determinar rutas permitidas según rol
  IF v_role = 'COBRADOR' THEN
    v_allowed_routes := get_collector_route_ids();
  ELSE
    v_allowed_routes := get_company_route_ids();
  END IF;

  UPDATE clients c
  SET route_order = u.route_order
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, route_order integer)
  WHERE c.id = u.id
    AND c.route_id = ANY(v_allowed_routes);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- sync_new_loan_bundle: validar empresa y proteger ON CONFLICT
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
  v_allowed_routes uuid[];
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para sincronizar préstamos';
  END IF;

  -- Validar empresa activa
  IF NOT company_is_active() THEN
    RAISE EXCEPTION 'La empresa está suspendida o vencida';
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

  -- Determinar rutas permitidas según rol
  IF v_role = 'COBRADOR' THEN
    v_allowed_routes := get_collector_route_ids();
  ELSE
    v_allowed_routes := get_company_route_ids();
  END IF;

  IF NOT (v_route_id = ANY(v_allowed_routes)) THEN
    RAISE EXCEPTION 'La ruta no está asignada a este usuario o empresa';
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
    updated_at = NOW()
  WHERE clients.route_id = ANY(v_allowed_routes);  -- Protección: solo sobrescribir si es de empresa permitida

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
    COALESCE((p_loan->>'created_at')::timestamptz, NOW()),
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

-- process_lottery_draw: validar rol y empresa
CREATE OR REPLACE FUNCTION process_lottery_draw(p_winning_number VARCHAR(3), p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draw_id UUID;
  v_loan RECORD;
  v_winner_count INT := 0;
  v_total_prize NUMERIC := 0;
  v_payment_id UUID;
  v_allowed_routes uuid[];
BEGIN
  -- Validar rol
  IF NOT (get_user_role() = 'ADMINISTRADOR' OR is_super_admin()) THEN
    RAISE EXCEPTION 'Solo administradores pueden procesar sorteos';
  END IF;

  -- Para ADMINISTRADOR, validar que los préstamos sean de su empresa
  IF NOT is_super_admin() THEN
    v_allowed_routes := get_company_route_ids();
  END IF;

  -- Crear el sorteo
  INSERT INTO lottery_draws (winning_number, draw_date, processed_by)
  VALUES (p_winning_number, CURRENT_DATE, p_admin_id)
  RETURNING id INTO v_draw_id;

  -- Buscar ganadores (Préstamos activos con ese número)
  FOR v_loan IN
    SELECT * FROM loans WHERE status = 'ACTIVO' AND raffle_number = p_winning_number
  LOOP
    -- Validar empresa para ADMINISTRADOR
    IF NOT is_super_admin() AND NOT (v_loan.route_id = ANY(v_allowed_routes)) THEN
      CONTINUE;  -- Saltar préstamos de otras empresas
    END IF;

    v_winner_count := v_winner_count + 1;
    v_total_prize := v_total_prize + v_loan.current_balance;

    -- 1. Insertar el ganador
    INSERT INTO lottery_winners (draw_id, loan_id, prize_amount)
    VALUES (v_draw_id, v_loan.id, v_loan.current_balance);

    -- 2. Crear un pago por el valor del current_balance (solo si hay saldo)
    IF v_loan.current_balance > 0 THEN
      INSERT INTO payments (
        operation_id, device_id, loan_id, collector_id, route_id, total_amount,
        day_installment_amount, auto_observation, sync_status, collected_at, created_by
      )
      VALUES (
        gen_random_uuid()::varchar, 'SERVER_LOTTERY', v_loan.id, p_admin_id, v_loan.route_id, v_loan.current_balance,
        v_loan.current_balance, 'Premio Lotería (Boleta ganadora)', 'synced', NOW(), p_admin_id
      ) RETURNING id INTO v_payment_id;
    END IF;

    -- 3. Saldar préstamo: balance 0 y estado CANCELADO
    UPDATE loans
    SET current_balance = 0, status = 'CANCELADO'
    WHERE id = v_loan.id;

    -- 4. Mark pending installments as paid
    UPDATE loan_installments
    SET status = 'PAGADA',
        paid_amount = scheduled_amount,
        balance = 0,
        paid_date = CURRENT_DATE
    WHERE loan_id = v_loan.id AND status IN ('PENDIENTE', 'PARCIAL', 'ATRASADA');

  END LOOP;

  RETURN jsonb_build_object(
    'draw_id', v_draw_id,
    'winners_count', v_winner_count,
    'total_prize', v_total_prize
  );
END;
$$;

-- Revocar permisos de anon y public, otorgar solo a authenticated
REVOKE EXECUTE ON FUNCTION update_client_orders(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_client_orders(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION sync_new_loan_bundle(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_new_loan_bundle(jsonb, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION process_lottery_draw(varchar, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION process_lottery_draw(varchar, uuid) TO authenticated;

-- 8. ELIMINAR admin_create_user
-- ============================================================

DROP FUNCTION IF EXISTS admin_create_user(varchar, varchar, uuid, varchar, varchar);

-- 9. ACTUALIZAR PERMISOS DE FUNCIONES HELPER
-- ============================================================

-- Revocar permisos de anon para funciones helper sensibles
REVOKE EXECUTE ON FUNCTION get_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_user_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_collector_route_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_company_route_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION company_is_active() FROM PUBLIC, anon;

-- Otorgar a authenticated
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_collector_route_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_route_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION company_is_active() TO authenticated;
