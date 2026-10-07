-- ============================================================
-- MIGRATION 028: AISLAMIENTO MULTIEMPRESA COMPLETO (versión corregida)
-- Reemplaza la 026 (que tenía errores de sintaxis y quitaba el filtro por empresa).
--
-- NOTAS IMPORTANTES
--  * Es IDEMPOTENTE: se puede ejecutar más de una vez.
--  * Borra TODAS las políticas RLS de las tablas que gestiona (sin importar su
--    nombre) y las recrea. Así no quedan políticas viejas "permisivas" que
--    anulen el aislamiento (las políticas PERMISIVAS se combinan con OR).
--  * Después de aplicarla hay que cambiar en el cliente:
--      src/services/AdminService.ts (~línea 1127)
--      { onConflict: 'key' }  ->  { onConflict: 'company_id,key' }
--    porque system_settings ya no tiene UNIQUE(key), sino UNIQUE(company_id, key).
--  * Después de aplicarla, crear usuarios desde la app solo funciona con la
--    edge function admin-create-user (la RPC admin_create_user se elimina aquí).
-- ============================================================


-- ============================================================
-- 1. FUNCIONES AUXILIARES (todas con search_path fijo)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_collector_route_ids()
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT ra.route_id), ARRAY[]::uuid[])
  FROM route_assignments ra
  WHERE ra.collector_id = auth.uid()
    AND ra.date_end IS NULL
$$;

CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.company_id
  FROM users u
  WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = auth.uid() AND r.name = 'SUPER_ADMIN'
  )
$$;

-- Rutas de la empresa del usuario actual
CREATE OR REPLACE FUNCTION get_company_route_ids()
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY_AGG(r.id), ARRAY[]::uuid[])
  FROM routes r
  WHERE r.company_id = get_user_company_id()
$$;

-- ¿La empresa del usuario está ACTIVA y con suscripción vigente?
CREATE OR REPLACE FUNCTION company_is_active()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT c.status = 'ACTIVE'
       AND (c.subscription_expires_at IS NULL OR c.subscription_expires_at > NOW())
    FROM companies c
    WHERE c.id = get_user_company_id()
  ), false)
$$;


-- ============================================================
-- 2. DATOS: BACKFILL Y RESTRICCIONES
-- ============================================================

-- Usuarios (que no sean SUPER_ADMIN) y rutas sin empresa -> empresa por defecto
UPDATE users u
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE u.company_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM roles r WHERE r.id = u.role_id AND r.name = 'SUPER_ADMIN'
  );

UPDATE routes
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

ALTER TABLE routes ALTER COLUMN company_id SET NOT NULL;

-- ON DELETE SET NULL -> RESTRICT (no dejar datos huérfanos al borrar empresas)
ALTER TABLE users  DROP CONSTRAINT IF EXISTS users_company_id_fkey;
ALTER TABLE users  ADD CONSTRAINT users_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_company_id_fkey;
ALTER TABLE routes ADD CONSTRAINT routes_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_routes_company ON routes(company_id);
CREATE INDEX IF NOT EXISTS idx_users_company  ON users(company_id);


-- ============================================================
-- 3. CONFIGURACIÓN POR EMPRESA (system_settings, expense_categories, holidays)
-- ============================================================

ALTER TABLE system_settings    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE holidays           ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

UPDATE system_settings    SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE expense_categories SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE holidays           SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

ALTER TABLE system_settings    ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE expense_categories ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE holidays           ALTER COLUMN company_id SET NOT NULL;

-- Quitar los UNIQUE globales de una sola columna (key / name / holiday_date),
-- sin depender del nombre exacto del constraint.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'u'
      AND c.conrelid IN (
        'public.system_settings'::regclass,
        'public.expense_categories'::regclass,
        'public.holidays'::regclass
      )
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE system_settings    DROP CONSTRAINT IF EXISTS system_settings_company_key;
ALTER TABLE system_settings    ADD CONSTRAINT system_settings_company_key UNIQUE (company_id, key);

ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_company_name;
ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_company_name UNIQUE (company_id, name);

ALTER TABLE holidays           DROP CONSTRAINT IF EXISTS holidays_company_date;
ALTER TABLE holidays           ADD CONSTRAINT holidays_company_date UNIQUE (company_id, holiday_date);

CREATE INDEX IF NOT EXISTS idx_system_settings_company    ON system_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_company ON expense_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_holidays_company           ON holidays(company_id);

-- Si el INSERT no trae company_id (el cliente no lo envía), se toma de la empresa
-- del usuario. Las políticas RLS validan después que coincida con la suya.
CREATE OR REPLACE FUNCTION set_company_id_from_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_user_company_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_settings_company ON system_settings;
CREATE TRIGGER trg_system_settings_company
  BEFORE INSERT ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_company_id_from_user();

DROP TRIGGER IF EXISTS trg_expense_categories_company ON expense_categories;
CREATE TRIGGER trg_expense_categories_company
  BEFORE INSERT ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION set_company_id_from_user();

DROP TRIGGER IF EXISTS trg_holidays_company ON holidays;
CREATE TRIGGER trg_holidays_company
  BEFORE INSERT ON holidays
  FOR EACH ROW EXECUTE FUNCTION set_company_id_from_user();

-- Copia la configuración de la empresa por defecto a una empresa nueva
CREATE OR REPLACE FUNCTION seed_company_defaults(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO system_settings (company_id, key, value, description, updated_at)
  SELECT p_company_id, key, value, description, NOW()
  FROM system_settings
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, key) DO NOTHING;

  INSERT INTO expense_categories (company_id, name, description, active, is_system)
  SELECT p_company_id, name, description, active, is_system
  FROM expense_categories
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, name) DO NOTHING;

  INSERT INTO holidays (company_id, holiday_date, name, country_code, active)
  SELECT p_company_id, holiday_date, name, country_code, active
  FROM holidays
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, holiday_date) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION seed_company_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION seed_company_defaults(uuid) TO service_role;

-- Empresas que ya existían (distintas a la de por defecto) quedan con su configuración
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM companies WHERE id <> '00000000-0000-0000-0000-000000000001' LOOP
    PERFORM seed_company_defaults(c.id);
  END LOOP;
END $$;


-- ============================================================
-- 4. POLÍTICAS RLS
-- ============================================================

-- Estas tablas NO tenían RLS habilitado en migraciones anteriores:
-- (lottery_draws/lottery_winners estaban abiertas a cualquier usuario autenticado)
ALTER TABLE roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_draws    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_winners  ENABLE ROW LEVEL SECURITY;

-- Borrar TODAS las políticas existentes de las tablas gestionadas aquí,
-- cualquiera que sea su nombre (007, 015, 019, 024, 026...).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'users', 'roles', 'companies', 'routes', 'route_assignments',
        'clients', 'loans', 'loan_installments', 'payments', 'payment_allocations',
        'expenses', 'daily_closings', 'refinancing',
        'audit_logs', 'sync_operations', 'devices',
        'holidays', 'expense_categories', 'system_settings',
        'lottery_draws', 'lottery_winners'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ─── COMPANIES ───────────────────────────────────────────────
CREATE POLICY companies_super_admin_all ON companies FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY companies_tenant_select ON companies FOR SELECT
  USING (id = get_user_company_id());

-- ─── ROLES (lectura para cualquier usuario autenticado: el login la necesita) ─
CREATE POLICY roles_read_authenticated ON roles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY roles_super_admin_write ON roles FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── USERS ───────────────────────────────────────────────────
CREATE POLICY users_admin_all ON users FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY users_self_select ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY users_super_admin_all ON users FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── ROUTES ──────────────────────────────────────────────────
CREATE POLICY routes_admin_all ON routes FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY routes_collector_select ON routes FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND id = ANY(get_collector_route_ids()));

CREATE POLICY routes_super_admin_all ON routes FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── ROUTE_ASSIGNMENTS ───────────────────────────────────────
CREATE POLICY route_assignments_admin_all ON route_assignments FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

CREATE POLICY route_assignments_collector_select ON route_assignments FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

CREATE POLICY route_assignments_super_admin_select ON route_assignments FOR SELECT
  USING (is_super_admin());

-- ─── CLIENTS ─────────────────────────────────────────────────
CREATE POLICY clients_admin_all ON clients FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

CREATE POLICY clients_collector_select ON clients FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND route_id = ANY(get_collector_route_ids()));

CREATE POLICY clients_collector_insert ON clients FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

CREATE POLICY clients_collector_update ON clients FOR UPDATE
  USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  )
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

CREATE POLICY clients_super_admin_select ON clients FOR SELECT
  USING (is_super_admin());

-- ─── LOANS ───────────────────────────────────────────────────
CREATE POLICY loans_admin_all ON loans FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

CREATE POLICY loans_collector_select ON loans FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND route_id = ANY(get_collector_route_ids()));

CREATE POLICY loans_collector_insert ON loans FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

CREATE POLICY loans_collector_update ON loans FOR UPDATE
  USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  )
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

CREATE POLICY loans_super_admin_select ON loans FOR SELECT
  USING (is_super_admin());

-- ─── LOAN_INSTALLMENTS ───────────────────────────────────────
CREATE POLICY installments_admin_all ON loan_installments FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids()))
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids()))
  );

CREATE POLICY installments_collector_select ON loan_installments FOR SELECT
  USING (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids()))
  );

CREATE POLICY installments_collector_update ON loan_installments FOR UPDATE
  USING (
    get_user_role() = 'COBRADOR'
    AND company_is_active()
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids()))
  )
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids()))
  );

CREATE POLICY installments_super_admin_select ON loan_installments FOR SELECT
  USING (is_super_admin());

-- ─── PAYMENTS ────────────────────────────────────────────────
CREATE POLICY payments_admin_all ON payments FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

CREATE POLICY payments_collector_select ON payments FOR SELECT
  USING (
    get_user_role() = 'COBRADOR'
    AND (collector_id = auth.uid() OR route_id = ANY(get_collector_route_ids()))
  );

-- (019) NO se exige collector_id = auth.uid(): el préstamo puede tener como
-- collector_id al ADMIN que lo creó. La seguridad la da la ruta asignada.
CREATE POLICY payments_collector_insert ON payments FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

CREATE POLICY payments_collector_update ON payments FOR UPDATE
  USING (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  )
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND route_id = ANY(get_collector_route_ids())
  );

CREATE POLICY payments_super_admin_select ON payments FOR SELECT
  USING (is_super_admin());

-- ─── PAYMENT_ALLOCATIONS ─────────────────────────────────────
CREATE POLICY allocations_admin_all ON payment_allocations FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND payment_id IN (SELECT id FROM payments WHERE route_id = ANY(get_company_route_ids()))
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND payment_id IN (SELECT id FROM payments WHERE route_id = ANY(get_company_route_ids()))
  );

CREATE POLICY allocations_collector_select ON payment_allocations FOR SELECT
  USING (
    get_user_role() = 'COBRADOR'
    AND payment_id IN (
      SELECT id FROM payments
      WHERE collector_id = auth.uid() OR route_id = ANY(get_collector_route_ids())
    )
  );

CREATE POLICY allocations_super_admin_select ON payment_allocations FOR SELECT
  USING (is_super_admin());

-- ─── EXPENSES ────────────────────────────────────────────────
CREATE POLICY expenses_admin_all ON expenses FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

CREATE POLICY expenses_collector_own ON expenses FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

CREATE POLICY expenses_collector_insert ON expenses FOR INSERT
  WITH CHECK (
    get_user_role() = 'COBRADOR'
    AND collector_id = auth.uid()
    AND route_id = ANY(get_collector_route_ids())
    AND company_is_active()
  );

CREATE POLICY expenses_super_admin_select ON expenses FOR SELECT
  USING (is_super_admin());

-- ─── DAILY_CLOSINGS ──────────────────────────────────────────
CREATE POLICY closings_admin_all ON daily_closings FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()))
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND route_id = ANY(get_company_route_ids()));

CREATE POLICY closings_collector_select ON daily_closings FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

CREATE POLICY closings_super_admin_select ON daily_closings FOR SELECT
  USING (is_super_admin());

-- ─── REFINANCING ─────────────────────────────────────────────
CREATE POLICY refinancing_admin_all ON refinancing FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND original_loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids()))
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND original_loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids()))
  );

CREATE POLICY refinancing_collector_select ON refinancing FOR SELECT
  USING (
    get_user_role() = 'COBRADOR'
    AND original_loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_collector_route_ids()))
  );

CREATE POLICY refinancing_super_admin_select ON refinancing FOR SELECT
  USING (is_super_admin());

-- ─── AUDIT_LOGS (no tiene route_id: se filtra por la empresa del usuario) ───
CREATE POLICY audit_admin_only ON audit_logs FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND user_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND user_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  );

CREATE POLICY audit_super_admin_select ON audit_logs FOR SELECT
  USING (is_super_admin());

-- ─── SYNC_OPERATIONS ─────────────────────────────────────────
CREATE POLICY sync_admin_all ON sync_operations FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND user_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND user_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  );

CREATE POLICY sync_collector_own ON sync_operations FOR ALL
  USING      (get_user_role() = 'COBRADOR' AND user_id = auth.uid())
  WITH CHECK (get_user_role() = 'COBRADOR' AND user_id = auth.uid());

CREATE POLICY sync_super_admin_select ON sync_operations FOR SELECT
  USING (is_super_admin());

-- ─── DEVICES ─────────────────────────────────────────────────
CREATE POLICY devices_admin_all ON devices FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND user_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND user_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  );

CREATE POLICY devices_collector_own ON devices FOR ALL
  USING      (get_user_role() = 'COBRADOR' AND user_id = auth.uid())
  WITH CHECK (get_user_role() = 'COBRADOR' AND user_id = auth.uid());

CREATE POLICY devices_super_admin_select ON devices FOR SELECT
  USING (is_super_admin());

-- ─── CONFIGURACIÓN POR EMPRESA ───────────────────────────────
-- system_settings
CREATE POLICY system_settings_admin_all ON system_settings FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY system_settings_collector_select ON system_settings FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND company_id = get_user_company_id());

CREATE POLICY system_settings_super_admin_all ON system_settings FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- expense_categories
CREATE POLICY expense_categories_admin_all ON expense_categories FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY expense_categories_collector_select ON expense_categories FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND company_id = get_user_company_id());

CREATE POLICY expense_categories_super_admin_all ON expense_categories FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- holidays
CREATE POLICY holidays_admin_all ON holidays FOR ALL
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY holidays_collector_select ON holidays FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND company_id = get_user_company_id());

CREATE POLICY holidays_super_admin_all ON holidays FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─── LOTERÍA (antes sin RLS) ─────────────────────────────────
CREATE POLICY lottery_draws_admin_all ON lottery_draws FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND processed_by IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND processed_by IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  );

CREATE POLICY lottery_draws_super_admin_select ON lottery_draws FOR SELECT
  USING (is_super_admin());

CREATE POLICY lottery_winners_admin_all ON lottery_winners FOR ALL
  USING (
    get_user_role() = 'ADMINISTRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids()))
  )
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND loan_id IN (SELECT id FROM loans WHERE route_id = ANY(get_company_route_ids()))
  );

CREATE POLICY lottery_winners_super_admin_select ON lottery_winners FOR SELECT
  USING (is_super_admin());


-- ============================================================
-- 5. TRIGGERS DE PROTECCIÓN
-- ============================================================

-- USERS: impide escalar privilegios, fuerza la empresa y valida límites del plan
CREATE OR REPLACE FUNCTION guard_users_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_super_role    uuid;
  v_cobrador_role uuid;
  v_max           int;
  v_count         int;
BEGIN
  -- service_role / SQL Editor / migraciones (sin usuario autenticado)
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
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
    -- INSERT: el admin solo crea usuarios en su propia empresa
    NEW.company_id := get_user_company_id();

    IF NOT company_is_active() THEN
      RAISE EXCEPTION 'La empresa está suspendida o vencida';
    END IF;

    SELECT id INTO v_cobrador_role FROM roles WHERE name = 'COBRADOR';
    IF NEW.role_id = v_cobrador_role THEN
      SELECT max_collectors INTO v_max FROM companies WHERE id = NEW.company_id;
      SELECT COUNT(*) INTO v_count
      FROM users
      WHERE company_id = NEW.company_id AND role_id = v_cobrador_role;

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'Límite de cobradores del plan alcanzado (% de %)', v_count, v_max;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_users_privileges ON users;
CREATE TRIGGER trg_guard_users_privileges
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_users_privileges();

-- Limpieza del trigger de la versión anterior (si existiera)
DROP TRIGGER IF EXISTS trg_guard_collectors_limit ON users;
DROP FUNCTION IF EXISTS guard_collectors_limit();

-- ROUTES: fuerza company_id y valida límite de rutas del plan
CREATE OR REPLACE FUNCTION guard_routes_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max   int;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_super_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.company_id := get_user_company_id();

    IF NOT company_is_active() THEN
      RAISE EXCEPTION 'La empresa está suspendida o vencida';
    END IF;

    SELECT max_routes INTO v_max FROM companies WHERE id = NEW.company_id;
    SELECT COUNT(*) INTO v_count FROM routes WHERE company_id = NEW.company_id;

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Límite de rutas del plan alcanzado (% de %)', v_count, v_max;
    END IF;
  ELSE
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'No se puede cambiar la empresa de una ruta';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_routes_company ON routes;
CREATE TRIGGER trg_guard_routes_company
  BEFORE INSERT OR UPDATE ON routes
  FOR EACH ROW EXECUTE FUNCTION guard_routes_company();


-- ============================================================
-- 6. BOLETAS (LOTERÍA): números y modo POR EMPRESA
--    Antes: los 1000 números (000-999) eran globales y lottery_mode se leía
--    sin filtrar, lo que con varias empresas mezcla datos y agota los números.
--    Se conserva el soporte offline de la 011 (no sobreescribir un número ya asignado).
-- ============================================================

CREATE OR REPLACE FUNCTION assign_raffle_number_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode    VARCHAR;
  v_num     VARCHAR(3);
  v_company UUID;
BEGIN
  SELECT company_id INTO v_company FROM routes WHERE id = NEW.route_id;

  SELECT value#>>'{}' INTO v_mode
  FROM system_settings
  WHERE key = 'lottery_mode' AND company_id = v_company;

  IF v_mode IS NULL THEN
    v_mode := 'OPCIONAL';
  END IF;

  IF v_mode = 'OBLIGATORIA' OR NEW.wants_raffle = true THEN

    -- Soporte offline-first: conservar el número que la PWA ya asignó
    IF NEW.raffle_number IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- Número libre (000-999) entre los préstamos ACTIVOS de la MISMA empresa
    SELECT TO_CHAR(num, 'FM000') INTO v_num
    FROM generate_series(0, 999) AS num
    WHERE TO_CHAR(num, 'FM000') NOT IN (
      SELECT l.raffle_number
      FROM loans l
      JOIN routes r ON r.id = l.route_id
      WHERE l.status = 'ACTIVO'
        AND l.raffle_number IS NOT NULL
        AND r.company_id = v_company
    )
    ORDER BY random()
    LIMIT 1;

    IF v_num IS NULL THEN
      v_num := TO_CHAR(floor(random() * 1000)::int, 'FM000');
    END IF;

    NEW.raffle_number := v_num;
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 7. FUNCIONES RPC
-- ============================================================

-- update_client_orders: solo clientes de rutas permitidas al invocador
CREATE OR REPLACE FUNCTION update_client_orders(p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count          integer;
  v_role           text;
  v_allowed_routes uuid[];
BEGIN
  v_role := get_user_role();
  IF v_role IS NULL OR v_role NOT IN ('COBRADOR', 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No autorizado para actualizar orden de ruta';
  END IF;

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

-- sync_new_loan_bundle: lógica de negocio igual a la 023 + validación de empresa/ruta
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

-- process_lottery_draw: solo ADMINISTRADOR, solo préstamos de su empresa.
-- El parámetro p_admin_id se conserva por compatibilidad con el cliente, pero se
-- IGNORA: quien procesa el sorteo siempre es el usuario autenticado (no se puede
-- falsificar). Base: versión de la 018.
CREATE OR REPLACE FUNCTION process_lottery_draw(p_winning_number VARCHAR(3), p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin          UUID := auth.uid();
  v_draw_id        UUID;
  v_loan           RECORD;
  v_winner_count   INT := 0;
  v_total_prize    NUMERIC := 0;
  v_payment_id     UUID;
  v_allowed_routes uuid[];
BEGIN
  IF get_user_role() IS DISTINCT FROM 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Solo los administradores pueden procesar sorteos';
  END IF;

  IF NOT company_is_active() THEN
    RAISE EXCEPTION 'La empresa está suspendida o vencida';
  END IF;

  IF p_winning_number IS NULL OR p_winning_number !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'El número ganador debe tener 3 dígitos (000-999)';
  END IF;

  v_allowed_routes := get_company_route_ids();

  INSERT INTO lottery_draws (winning_number, draw_date, processed_by)
  VALUES (p_winning_number, CURRENT_DATE, v_admin)
  RETURNING id INTO v_draw_id;

  FOR v_loan IN
    SELECT *
    FROM loans
    WHERE status = 'ACTIVO'
      AND raffle_number = p_winning_number
      AND route_id = ANY(v_allowed_routes)
  LOOP
    v_winner_count := v_winner_count + 1;
    v_total_prize  := v_total_prize + v_loan.current_balance;

    INSERT INTO lottery_winners (draw_id, loan_id, prize_amount)
    VALUES (v_draw_id, v_loan.id, v_loan.current_balance);

    IF v_loan.current_balance > 0 THEN
      INSERT INTO payments (
        operation_id, device_id, loan_id, collector_id, route_id, total_amount,
        day_installment_amount, auto_observation, sync_status, collected_at, created_by
      )
      VALUES (
        gen_random_uuid()::varchar, 'SERVER_LOTTERY', v_loan.id, v_admin, v_loan.route_id, v_loan.current_balance,
        v_loan.current_balance, 'Premio Lotería (Boleta ganadora)', 'synced', NOW(), v_admin
      ) RETURNING id INTO v_payment_id;
    END IF;

    UPDATE loans
    SET current_balance = 0, status = 'CANCELADO'
    WHERE id = v_loan.id;

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

-- delete_client: la función NO está definida en ninguna migración del repo (solo se
-- llama desde AdminService). Si existe en tu base, se le quita el acceso a anon y
-- debes revisar a mano que valide rol y empresa.
DO $$
BEGIN
  IF to_regprocedure('public.delete_client(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.delete_client(uuid) FROM PUBLIC, anon;
    GRANT  EXECUTE ON FUNCTION public.delete_client(uuid) TO authenticated;
  END IF;
END $$;


-- ============================================================
-- 8. ELIMINAR admin_create_user (reemplazada por edge functions)
--    Era invocable sin sesión (NULL NOT IN (...) no lanza excepción),
--    permitía asignar SUPER_ADMIN y no fijaba company_id.
-- ============================================================

DROP FUNCTION IF EXISTS admin_create_user(varchar, varchar, uuid, varchar, varchar);


-- ============================================================
-- 9. PERMISOS DE EJECUCIÓN
-- ============================================================

REVOKE EXECUTE ON FUNCTION get_user_role()                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_user_company_id()                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_super_admin()                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_collector_route_ids()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_company_route_ids()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION company_is_active()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_client_orders(jsonb)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_new_loan_bundle(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION process_lottery_draw(varchar, uuid)      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION get_user_role()                           TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id()                     TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin()                          TO authenticated;
GRANT EXECUTE ON FUNCTION get_collector_route_ids()                 TO authenticated;
GRANT EXECUTE ON FUNCTION get_company_route_ids()                   TO authenticated;
GRANT EXECUTE ON FUNCTION company_is_active()                       TO authenticated;
GRANT EXECUTE ON FUNCTION update_client_orders(jsonb)               TO authenticated;
GRANT EXECUTE ON FUNCTION sync_new_loan_bundle(jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION process_lottery_draw(varchar, uuid)       TO authenticated;