-- ============================================================
-- MIGRATION 003: CLIENTES Y PRÉSTAMOS
-- clients, loans, loan_installments
-- ============================================================

-- ─── CLIENTES ─────────────────────────────────────────────
CREATE TABLE clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    VARCHAR(150) NOT NULL,
  document_id  VARCHAR(30) NOT NULL,
  phone        VARCHAR(20),
  address      TEXT,
  neighborhood VARCHAR(100),
  municipality VARCHAR(100),
  route_id     UUID REFERENCES routes(id),
  photo_face_url VARCHAR(500),
  photo_doc_url  VARCHAR(500),
  personal_references TEXT,
  status       client_status NOT NULL DEFAULT 'ACTIVO',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_document_route UNIQUE (document_id, route_id)
);

COMMENT ON TABLE clients IS 'Clientes del sistema. Pueden tener múltiples préstamos históricos. Solo un préstamo ACTIVO por cliente normalmente.';
COMMENT ON COLUMN clients.personal_references IS 'Referencias personales del cliente (texto libre).';

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_clients_route ON clients(route_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_document ON clients(document_id);

-- ─── PRÉSTAMOS ────────────────────────────────────────────
CREATE TABLE loans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES clients(id),
  route_id              UUID NOT NULL REFERENCES routes(id),
  collector_id          UUID NOT NULL REFERENCES users(id),
  
  -- Datos financieros originales (NUNCA modificar después de crear)
  amount_requested      NUMERIC(15,6) NOT NULL CHECK (amount_requested > 0),
  interest_rate         NUMERIC(5,4) NOT NULL DEFAULT 0.2000, -- 20% = 0.2000
  interest_amount       NUMERIC(15,6) NOT NULL,               -- amount_requested × interest_rate
  initial_obligation    NUMERIC(15,6) NOT NULL,               -- amount_requested + interest_amount
  term_days             INTEGER NOT NULL CHECK (term_days IN (30, 40, 45, 60)),
  daily_installment     NUMERIC(15,6) NOT NULL,               -- initial_obligation / term_days (EXACTO, sin redondeo)
  frequency             payment_frequency NOT NULL DEFAULT 'DIARIO',
  
  -- Domingos prepagados
  sundays_prepaid_count   INTEGER NOT NULL DEFAULT 0 CHECK (sundays_prepaid_count >= 0),
  sundays_prepaid_amount  NUMERIC(15,6) NOT NULL DEFAULT 0,   -- count × daily_installment
  
  -- Boleta (reduce dinero entregado, NO reduce obligación)
  receipt_fee           NUMERIC(15,6) NOT NULL DEFAULT 0 CHECK (receipt_fee >= 0),
  
  -- Dinero real entregado al cliente
  amount_delivered      NUMERIC(15,6) NOT NULL,               -- amount_requested - sundays_prepaid_amount - receipt_fee
  
  -- Saldo actual (calculado y actualizado por las Edge Functions)
  current_balance       NUMERIC(15,6) NOT NULL,               -- inicia = initial_obligation - sundays_prepaid_amount
  
  -- Fechas
  disbursement_date     DATE NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  grace_end_date        DATE NOT NULL,  -- end_date + 7 días de gracia

  -- Estado
  status                loan_status NOT NULL DEFAULT 'ACTIVO',
  
  -- Refinanciación (si este préstamo fue creado por refinanciación)
  refinanced_from_loan_id UUID REFERENCES loans(id),
  
  -- Auditoría de creación
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints de integridad financiera
  CONSTRAINT chk_interest_amount CHECK (interest_amount = ROUND(amount_requested * interest_rate, 6)),
  CONSTRAINT chk_initial_obligation CHECK (initial_obligation = amount_requested + interest_amount),
  CONSTRAINT chk_sundays_amount CHECK (sundays_prepaid_amount = sundays_prepaid_count * daily_installment),
  CONSTRAINT chk_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_grace_date CHECK (grace_end_date = end_date + INTERVAL '7 days')
);

COMMENT ON TABLE loans IS 'Préstamos. Los valores financieros originales son INMUTABLES después de crear. current_balance se actualiza por Edge Functions.';
COMMENT ON COLUMN loans.daily_installment IS 'Cuota exacta sin redondeo: initial_obligation / term_days. Tipo NUMERIC(15,6).';
COMMENT ON COLUMN loans.amount_delivered IS 'Dinero físicamente entregado al cliente: amount_requested - sundays_prepaid_amount - receipt_fee.';
COMMENT ON COLUMN loans.current_balance IS 'Saldo actualizado. Inicia en initial_obligation - sundays_prepaid_amount.';
COMMENT ON COLUMN loans.grace_end_date IS '7 días después de end_date. Sin interés adicional. Después: estado CLAVO.';

CREATE INDEX idx_loans_client ON loans(client_id);
CREATE INDEX idx_loans_route ON loans(route_id);
CREATE INDEX idx_loans_collector ON loans(collector_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_active_client ON loans(client_id) WHERE status = 'ACTIVO';

-- ─── CUOTAS (CALENDARIO COMPLETO) ─────────────────────────
CREATE TABLE loan_installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL CHECK (installment_number > 0),
  scheduled_date      DATE NOT NULL,
  scheduled_amount    NUMERIC(15,6) NOT NULL,  -- = daily_installment (exacto)
  paid_amount         NUMERIC(15,6) NOT NULL DEFAULT 0,
  balance             NUMERIC(15,6) NOT NULL,  -- scheduled_amount - paid_amount
  status              installment_status NOT NULL DEFAULT 'PENDIENTE',
  day_type            day_type NOT NULL DEFAULT 'NORMAL',
  is_prepaid          BOOLEAN NOT NULL DEFAULT false,  -- domingo prepagado al desembolso
  is_sunday           BOOLEAN NOT NULL DEFAULT false,
  is_holiday          BOOLEAN NOT NULL DEFAULT false,
  paid_date           DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_loan_installment UNIQUE (loan_id, installment_number),
  CONSTRAINT chk_paid_amount CHECK (paid_amount >= 0 AND paid_amount <= scheduled_amount + 0.01), -- +0.01 tolerancia decimal
  CONSTRAINT chk_balance CHECK (balance = scheduled_amount - paid_amount),
  CONSTRAINT chk_prepaid_status CHECK (
    NOT is_prepaid OR status = 'PAGADA_ANTICIPADAMENTE'
  )
);

COMMENT ON TABLE loan_installments IS 'Calendario COMPLETO de cuotas de cada préstamo. Un registro por cada día calendario del plazo.';
COMMENT ON COLUMN loan_installments.is_prepaid IS 'true = domingo prepagado al momento del desembolso. status = PAGADA_ANTICIPADAMENTE.';
COMMENT ON COLUMN loan_installments.scheduled_amount IS 'Igual a daily_installment del préstamo. NUMERIC(15,6) sin redondeo.';

CREATE INDEX idx_installments_loan ON loan_installments(loan_id);
CREATE INDEX idx_installments_date ON loan_installments(loan_id, scheduled_date);
CREATE INDEX idx_installments_pending ON loan_installments(loan_id, status) WHERE status IN ('PENDIENTE', 'PARCIAL', 'ATRASADA');
