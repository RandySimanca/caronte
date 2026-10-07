-- ============================================================
-- MIGRATION 024: SAAS MULTI-TENANCY & SUPER ADMIN
-- Caronte SaaS Platform Architecture
-- ============================================================

-- 1. Insert SUPER_ADMIN role if it does not exist in roles table
INSERT INTO roles (name, permissions, description, active)
VALUES (
  'SUPER_ADMIN',
  '{"can_manage_companies": true, "can_manage_all": true, "is_super_admin": true}'::jsonb,
  'Super Administrador del SaaS Caronte con control global de prestamistas y empresas',
  true
)
ON CONFLICT (name) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- 2. Tabla de Empresas / Prestamistas (Tenants)
CREATE TABLE IF NOT EXISTS companies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(150) NOT NULL,
  slug                    VARCHAR(100) UNIQUE,
  owner_name              VARCHAR(150),
  phone                   VARCHAR(30),
  email                   VARCHAR(150),
  status                  VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'INACTIVE'
  plan                    VARCHAR(50) NOT NULL DEFAULT 'PRO',    -- 'BASIC', 'PRO', 'ENTERPRISE'
  max_collectors          INT NOT NULL DEFAULT 10,
  max_routes              INT NOT NULL DEFAULT 10,
  subscription_expires_at TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE companies IS 'Empresas o Prestamistas independientes clientes del SaaS Caronte';

-- Trigger: actualizar updated_at en empresas
DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Agregar company_id a las tablas principales
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- 4. Crear Empresa Por Defecto (Prestamista Principal / Demo) para datos existentes
INSERT INTO companies (id, name, slug, owner_name, email, status, plan, max_collectors, max_routes)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Prestamista Principal',
  'prestamista-principal',
  'Administrador Principal',
  'admin@caronte.com',
  'ACTIVE',
  'ENTERPRISE',
  100,
  100
) ON CONFLICT (id) DO NOTHING;

-- Asignar la empresa por defecto a todos los usuarios y rutas existentes que no tengan company_id
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE routes SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 5. Helper function: Obtener company_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
  SELECT u.company_id
  FROM users u
  WHERE u.id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 6. Helper function: Verificar si el usuario actual es SUPER_ADMIN
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = auth.uid() AND r.name = 'SUPER_ADMIN'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 7. Políticas de RLS para Companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_super_admin_all" ON companies;
CREATE POLICY "companies_super_admin_all" ON companies
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "companies_tenant_select" ON companies;
CREATE POLICY "companies_tenant_select" ON companies
  FOR SELECT USING (id = get_user_company_id());

-- 8. Actualizar RLS en Users y Routes para dar soporte a SUPER_ADMIN
DROP POLICY IF EXISTS "users_admin_all" ON users;
CREATE POLICY "users_admin_all" ON users
  FOR ALL USING (
    is_super_admin() OR 
    (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  );

DROP POLICY IF EXISTS "routes_admin_all" ON routes;
CREATE POLICY "routes_admin_all" ON routes
  FOR ALL USING (
    is_super_admin() OR 
    (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  );
