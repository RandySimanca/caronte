-- ============================================================
-- MIGRATION 005: GASTOS, CIERRE DIARIO Y REFINANCIACIÓN
-- expenses, daily_closings, refinancing
-- ============================================================

-- ─── GASTOS DEL COBRADOR ──────────────────────────────────
CREATE TABLE expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id     UUID NOT NULL REFERENCES users(id),
  route_id         UUID NOT NULL REFERENCES routes(id),
  expense_date     DATE NOT NULL,
  expense_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category_id      UUID NOT NULL REFERENCES expense_categories(id),
  amount           NUMERIC(15,6) NOT NULL CHECK (amount > 0),
  description      TEXT NOT NULL,
  observation      TEXT,
  receipt_photo_url VARCHAR(500),  -- Supabase Storage URL (opcional, no obligatorio aún)
  status           expense_status NOT NULL DEFAULT 'PENDIENTE',
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Sincronización offline
  operation_id     VARCHAR(100) UNIQUE,  -- para idempotencia offline
  sync_status      sync_status NOT NULL DEFAULT 'pending'
);

COMMENT ON TABLE expenses IS 'Gastos del cobrador durante la ruta (combustible, aceite, reparación, etc.). Se descuentan del dinero a entregar.';
COMMENT ON COLUMN expenses.amount IS 'Este valor se descuenta del total cobrado para calcular dinero_a_entregar.';
COMMENT ON COLUMN expenses.receipt_photo_url IS 'URL en Supabase Storage. Opcional en esta fase. Preparado para futura implementación.';

CREATE INDEX idx_expenses_collector ON expenses(collector_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_route ON expenses(route_id);

-- ─── CIERRE DIARIO ────────────────────────────────────────
CREATE TABLE daily_closings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id                UUID NOT NULL REFERENCES routes(id),
  collector_id            UUID NOT NULL REFERENCES users(id),
  closing_date            DATE NOT NULL,
  
  -- Cobro del día
  expected_amount         NUMERIC(15,6) NOT NULL DEFAULT 0,   -- cuota esperada del día
  arrears_amount          NUMERIC(15,6) NOT NULL DEFAULT 0,   -- total atrasado de días anteriores
  arrears_recovered       NUMERIC(15,6) NOT NULL DEFAULT 0,   -- del atrasado, cuánto se cobró hoy
  total_collected         NUMERIC(15,6) NOT NULL DEFAULT 0,   -- todo el dinero recibido
  partial_payments        NUMERIC(15,6) NOT NULL DEFAULT 0,   -- dinero de pagos parciales
  advance_payments        NUMERIC(15,6) NOT NULL DEFAULT 0,   -- dinero de pagos adelantados
  above_expected_payments NUMERIC(15,6) NOT NULL DEFAULT 0,   -- pagos superiores al valor esperado
  
  -- Viático (pertenece íntegramente al cobrador — sin devolución)
  viaticum_assigned       NUMERIC(15,6) NOT NULL DEFAULT 0,
  
  -- Gastos de ruta (se descuentan del dinero a entregar)
  fuel_expenses           NUMERIC(15,6) NOT NULL DEFAULT 0,
  oil_expenses            NUMERIC(15,6) NOT NULL DEFAULT 0,
  repair_expenses         NUMERIC(15,6) NOT NULL DEFAULT 0,
  tire_expenses           NUMERIC(15,6) NOT NULL DEFAULT 0,
  chain_expenses          NUMERIC(15,6) NOT NULL DEFAULT 0,
  other_expenses          NUMERIC(15,6) NOT NULL DEFAULT 0,
  total_expenses          NUMERIC(15,6) NOT NULL DEFAULT 0,
  
  -- Liquidación
  -- expected_delivery = total_collected - viaticum_assigned - total_expenses
  expected_delivery       NUMERIC(15,6) NOT NULL DEFAULT 0,
  actual_delivery         NUMERIC(15,6) NOT NULL DEFAULT 0,   -- dinero físicamente entregado
  difference              NUMERIC(15,6) NOT NULL DEFAULT 0,   -- actual_delivery - expected_delivery
  
  -- Estado
  observations            TEXT,
  is_closed               BOOLEAN NOT NULL DEFAULT false,
  has_pending_sync        BOOLEAN NOT NULL DEFAULT false,   -- cerrado con operaciones pendientes
  
  -- Auditoría del cierre
  closed_by               UUID REFERENCES users(id),
  closed_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_daily_closing UNIQUE (route_id, closing_date),
  CONSTRAINT chk_total_expenses CHECK (
    total_expenses = fuel_expenses + oil_expenses + repair_expenses + 
                     tire_expenses + chain_expenses + other_expenses
  ),
  CONSTRAINT chk_expected_delivery CHECK (
    ABS(expected_delivery - (total_collected - viaticum_assigned - total_expenses)) < 0.01
  )
);

COMMENT ON TABLE daily_closings IS 'Liquidación diaria por ruta. Una vez is_closed=true, solo el admin puede modificar con auditoría.';
COMMENT ON COLUMN daily_closings.viaticum_assigned IS 'Viático del día: pertenece íntegramente al cobrador. No hay devolución.';
COMMENT ON COLUMN daily_closings.expected_delivery IS 'total_collected - viaticum_assigned - total_expenses. Dinero que debe entregar el cobrador.';
COMMENT ON COLUMN daily_closings.has_pending_sync IS 'true si se cerró el día con operaciones offline sin sincronizar. Para control del admin.';

CREATE TRIGGER trg_daily_closings_updated_at
  BEFORE UPDATE ON daily_closings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_daily_closings_route ON daily_closings(route_id);
CREATE INDEX idx_daily_closings_date ON daily_closings(closing_date);
CREATE INDEX idx_daily_closings_pending ON daily_closings(is_closed) WHERE is_closed = false;

-- ─── REFINANCIACIÓN ───────────────────────────────────────
CREATE TABLE refinancing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_loan_id  UUID NOT NULL REFERENCES loans(id),
  new_loan_id       UUID NOT NULL REFERENCES loans(id),
  pending_balance   NUMERIC(15,6) NOT NULL CHECK (pending_balance > 0),   -- saldo del préstamo anterior
  commercial_value  NUMERIC(15,6) NOT NULL CHECK (commercial_value > 0),  -- valor comercial seleccionado
  net_delivered     NUMERIC(15,6) NOT NULL,   -- dinero real entregado al cliente en la refinanciación
  authorized_by     UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_refinancing_original UNIQUE (original_loan_id),
  CONSTRAINT uq_refinancing_new UNIQUE (new_loan_id),
  CONSTRAINT chk_different_loans CHECK (original_loan_id != new_loan_id)
);

COMMENT ON TABLE refinancing IS 'Relación entre préstamo original y nuevo en refinanciación. Nunca perder el historial.';
COMMENT ON COLUMN refinancing.commercial_value IS 'Valor comercial seleccionado por el admin. La regla de selección está PENDIENTE de definición.';
COMMENT ON COLUMN refinancing.net_delivered IS 'commercial_value - pending_balance - domingos_prepagados - boleta del nuevo préstamo.';
