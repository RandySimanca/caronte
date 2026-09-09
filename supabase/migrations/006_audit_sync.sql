-- ============================================================
-- MIGRATION 006: AUDITORÍA Y SINCRONIZACIÓN
-- audit_logs, sync_operations, devices
-- ============================================================

-- ─── AUDITORÍA ────────────────────────────────────────────
CREATE TABLE audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  user_role      VARCHAR(50),
  action         VARCHAR(100) NOT NULL,  -- CREATE, UPDATE, DELETE, CORRECT, CLOSE, etc.
  entity         VARCHAR(100) NOT NULL,  -- loans, payments, clients, daily_closings, etc.
  entity_id      UUID,
  previous_value JSONB,                  -- estado ANTES de la operación
  new_value      JSONB,                  -- estado DESPUÉS de la operación
  action_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  action_time    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id      VARCHAR(100),
  ip_address     VARCHAR(45),
  reason         TEXT                    -- motivo (obligatorio en correcciones)
);

COMMENT ON TABLE audit_logs IS 'Trazabilidad completa de todas las operaciones financieras. Nunca borrar registros de esta tabla.';
COMMENT ON COLUMN audit_logs.previous_value IS 'JSON con el estado anterior. Permite reconstruir historial.';
COMMENT ON COLUMN audit_logs.reason IS 'Obligatorio en correcciones y anulaciones admin.';

-- Particionamiento por fecha para rendimiento a largo plazo
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_date ON audit_logs(action_date);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- ─── OPERACIONES DE SINCRONIZACIÓN ────────────────────────
CREATE TABLE sync_operations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id     VARCHAR(100) NOT NULL UNIQUE,  -- mismo que el operation_id del payment/expense
  device_id        VARCHAR(100) NOT NULL,
  user_id          UUID REFERENCES users(id),
  operation_type   VARCHAR(50) NOT NULL,    -- PAYMENT, EXPENSE, CLIENT, LOAN, etc.
  entity           VARCHAR(100) NOT NULL,
  payload          JSONB NOT NULL,           -- datos completos de la operación
  retry_count      INTEGER NOT NULL DEFAULT 0,
  status           sync_status NOT NULL DEFAULT 'pending',
  local_timestamp  TIMESTAMPTZ NOT NULL,     -- cuándo se creó en el dispositivo
  server_timestamp TIMESTAMPTZ,             -- cuándo llegó al servidor
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sync_operations IS 'Cola de operaciones offline. Estados: pending→syncing→synced / failed→conflict.';
COMMENT ON COLUMN sync_operations.operation_id IS 'Igual al operation_id de la operación. Garantiza idempotencia.';
COMMENT ON COLUMN sync_operations.payload IS 'Datos completos para poder reprocesr la operación si falla.';

CREATE INDEX idx_sync_status ON sync_operations(status) WHERE status != 'synced';
CREATE INDEX idx_sync_device ON sync_operations(device_id);
CREATE INDEX idx_sync_user ON sync_operations(user_id);
CREATE INDEX idx_sync_type ON sync_operations(operation_type);

-- ─── DISPOSITIVOS ─────────────────────────────────────────
CREATE TABLE devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  device_id   VARCHAR(100) NOT NULL UNIQUE,
  name        VARCHAR(100),
  platform    VARCHAR(50),   -- Android, iOS, Windows, etc.
  last_sync   TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE devices IS 'Dispositivos registrados por usuario. Permite detectar operaciones offline prolongadas.';

CREATE INDEX idx_devices_user ON devices(user_id);
