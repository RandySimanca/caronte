-- ============================================================
-- MIGRATION 004: PAGOS Y DISTRIBUCIÓN
-- payments, payment_allocations
-- ============================================================

-- ─── PAGOS ────────────────────────────────────────────────
-- Cada registro representa dinero físicamente recibido por el cobrador
CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificador único generado en el dispositivo para idempotencia offline
  operation_id          VARCHAR(100) NOT NULL UNIQUE,
  device_id             VARCHAR(100) NOT NULL,
  
  -- Referencias
  loan_id               UUID NOT NULL REFERENCES loans(id),
  collector_id          UUID NOT NULL REFERENCES users(id),
  route_id              UUID NOT NULL REFERENCES routes(id),
  
  -- Dinero recibido
  total_amount          NUMERIC(15,6) NOT NULL CHECK (total_amount > 0),
  
  -- Distribución del dinero (para referencia rápida)
  day_installment_amount NUMERIC(15,6) NOT NULL DEFAULT 0,   -- porción aplicada a cuota del día
  arrears_amount         NUMERIC(15,6) NOT NULL DEFAULT 0,   -- porción aplicada a atrasos
  advance_amount         NUMERIC(15,6) NOT NULL DEFAULT 0,   -- porción aplicada a cuotas futuras
  
  -- Observación automática generada por el sistema (cuando hay excedente)
  auto_observation      TEXT,
  -- Observación manual del cobrador (si la agregó)
  collector_observation TEXT,
  
  -- Indicadores para reportes y auditoría
  is_partial_payment    BOOLEAN NOT NULL DEFAULT false,  -- pago menor a la cuota del día
  is_advance_payment    BOOLEAN NOT NULL DEFAULT false,  -- pago que cubre cuotas futuras
  is_above_expected     BOOLEAN NOT NULL DEFAULT false,  -- pago mayor al valor esperado ese día
  
  -- Sincronización
  sync_status           sync_status NOT NULL DEFAULT 'pending',
  
  -- Timestamps
  collected_at          TIMESTAMPTZ NOT NULL,  -- cuando el cobrador registró en el dispositivo
  synced_at             TIMESTAMPTZ,           -- cuando llegó al servidor
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraint: suma de distribución debe igualar total (tolerancia de decimales)
  CONSTRAINT chk_distribution_sum CHECK (
    ABS((day_installment_amount + arrears_amount + advance_amount) - total_amount) < 0.01
  )
);

COMMENT ON TABLE payments IS 'Pagos recibidos. operation_id es UUID generado en dispositivo para prevenir duplicados offline.';
COMMENT ON COLUMN payments.operation_id IS 'Generado en el dispositivo con UUID v4. El servidor responde idempotentemente si ya existe.';
COMMENT ON COLUMN payments.day_installment_amount IS 'REGLA: primero se cubre la cuota del día actual.';
COMMENT ON COLUMN payments.arrears_amount IS 'REGLA: el excedente sobre la cuota del día se aplica a atrasos.';
COMMENT ON COLUMN payments.advance_amount IS 'REGLA: si hay más dinero después de cubrir atrasos, se aplica a cuotas futuras.';
COMMENT ON COLUMN payments.auto_observation IS 'Generada automáticamente: "El cliente X hizo un abono de $Y, que corresponde a N días pagados."';

CREATE INDEX idx_payments_loan ON payments(loan_id);
CREATE INDEX idx_payments_collector ON payments(collector_id);
CREATE INDEX idx_payments_route ON payments(route_id);
CREATE INDEX idx_payments_collected_at ON payments(collected_at);
CREATE INDEX idx_payments_operation_id ON payments(operation_id);
CREATE INDEX idx_payments_sync ON payments(sync_status) WHERE sync_status != 'synced';

-- ─── DISTRIBUCIÓN DE PAGOS A CUOTAS ───────────────────────
-- Detalle exacto de cómo se aplicó cada peso a cada cuota
CREATE TABLE payment_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  installment_id   UUID NOT NULL REFERENCES loan_installments(id),
  allocated_amount NUMERIC(15,6) NOT NULL CHECK (allocated_amount > 0),
  allocation_type  allocation_type NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_payment_installment UNIQUE (payment_id, installment_id)
);

COMMENT ON TABLE payment_allocations IS 'Registro exacto de cómo se distribuyó cada pago entre cuotas. Permite reconstruir el estado financiero completo del cliente.';
COMMENT ON COLUMN payment_allocations.allocation_type IS 'DIA_ACTUAL: cuota de hoy. ATRASO: cuota atrasada. ADELANTO: cuota futura. PARCIAL: abono parcial.';

CREATE INDEX idx_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_allocations_installment ON payment_allocations(installment_id);
