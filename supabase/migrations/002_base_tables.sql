-- ============================================================
-- MIGRATION 002: TABLAS BASE
-- Usuarios, Roles, Rutas, Festivos, Configuraciones
-- ============================================================

-- ─── ROLES ────────────────────────────────────────────────
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL UNIQUE,
  permissions JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'Roles del sistema con permisos configurables por el administrador';
COMMENT ON COLUMN roles.permissions IS 'JSON con permisos granulares: {"can_create_loans": true, "can_view_reports": false, ...}';

-- ─── USERS (extiende auth.users de Supabase) ─────────────
-- Supabase Auth maneja autenticación. Esta tabla extiende el perfil.
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   VARCHAR(150) NOT NULL,
  phone       VARCHAR(20),
  role_id     UUID NOT NULL REFERENCES roles(id),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Perfil extendido de usuarios. Vinculado a auth.users de Supabase.';

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RUTAS ────────────────────────────────────────────────
CREATE TABLE routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  zones       TEXT[] DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE routes IS 'Territorios de cobro. Una ruta puede cambiar de cobrador.';

-- ─── ASIGNACIONES DE RUTA (historial) ────────────────────
CREATE TABLE route_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id     UUID NOT NULL REFERENCES routes(id),
  collector_id UUID NOT NULL REFERENCES users(id),
  date_start   DATE NOT NULL,
  date_end     DATE,   -- NULL = asignación actual activa
  assigned_by  UUID NOT NULL REFERENCES users(id),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation  TEXT,
  
  CONSTRAINT chk_dates CHECK (date_end IS NULL OR date_end >= date_start)
);

COMMENT ON TABLE route_assignments IS 'Historial de cobrador asignado a ruta. Nunca sobrescribir — siempre insertar nuevo registro.';
COMMENT ON COLUMN route_assignments.date_end IS 'NULL indica asignación vigente actualmente.';

-- Índice para obtener cobrador actual de una ruta eficientemente
CREATE INDEX idx_route_assignments_active ON route_assignments(route_id, date_end)
  WHERE date_end IS NULL;

-- ─── FESTIVOS ─────────────────────────────────────────────
CREATE TABLE holidays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'CO',
  active       BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE holidays IS 'Días festivos. Editables por el administrador. Un festivo no elimina una cuota, la deja pendiente si no se cobra.';

CREATE INDEX idx_holidays_date ON holidays(holiday_date) WHERE active = true;

-- ─── CONFIGURACIONES DEL SISTEMA ─────────────────────────
CREATE TABLE system_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         VARCHAR(100) NOT NULL UNIQUE,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE system_settings IS 'Configuraciones administrativas globales. Los cambios NO afectan préstamos históricos.';

-- ─── CATEGORÍAS DE GASTOS ─────────────────────────────────
CREATE TABLE expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80) NOT NULL UNIQUE,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  is_system   BOOLEAN NOT NULL DEFAULT false  -- true = no se puede eliminar
);

COMMENT ON TABLE expense_categories IS 'Categorías de gastos del cobrador durante la ruta.';
