-- ============================================================
-- MIGRATION 044: CUENTA DE EFECTIVO DEL COBRADOR (faltantes y sobrantes)
-- ============================================================
-- Al liquidar, el admin digita el efectivo que realmente recibe. La diferencia
-- contra lo esperado (daily_closings.difference = real - esperado) se registra
-- aquí como un movimiento de la cuenta del cobrador:
--
--   FALTANTE             el cobrador debe esa plata                       (+ deuda)
--   REPOSICION           el cobrador repone parte o todo el faltante      (- deuda)
--   CONDONACION          el admin perdona parte del faltante (con motivo) (- deuda)
--   SOBRANTE             sobró dinero; "por aclarar"                      (+ sobrante)
--   APLICACION_SOBRANTE  el sobrante era un cobro de cliente no digitado  (- sobrante)
--   DEVOLUCION_SOBRANTE  se le devuelve el sobrante al cobrador           (- sobrante)
--   COMPENSACION         un sobrante cubre un faltante (decisión del admin)
--                                                       (- deuda y - sobrante)
--
-- El monto SIEMPRE es positivo; el tipo define si suma o resta.
-- Los movimientos no se editan ni se borran: se anulan (voided_at) con motivo.
--
-- Migración ADITIVA: solo crea una tabla nueva y un parámetro. El código anterior
-- sigue funcionando mientras no se use. Aplicar ANTES de desplegar el código nuevo.
-- ============================================================

CREATE TABLE IF NOT EXISTS collector_cash_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL DEFAULT get_user_company_id() REFERENCES companies(id),
  collector_id   UUID NOT NULL REFERENCES users(id),
  route_id       UUID REFERENCES routes(id),
  closing_id     UUID REFERENCES daily_closings(id) ON DELETE SET NULL,
  kind           VARCHAR(30) NOT NULL,
  amount         NUMERIC(15,6) NOT NULL CHECK (amount > 0),
  movement_date  DATE NOT NULL,                       -- día del cierre (FALTANTE/SOBRANTE) o del movimiento
  method         VARCHAR(20),                         -- EFECTIVO | TRANSFERENCIA (reposiciones)
  related_id     UUID REFERENCES collector_cash_ledger(id),  -- sobrante/faltante que este movimiento afecta
  payment_id     UUID REFERENCES payments(id) ON DELETE SET NULL, -- cobro tardío que aclara un sobrante
  note           TEXT,
  is_late        BOOLEAN NOT NULL DEFAULT false,      -- aclaración fuera del plazo configurado
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at      TIMESTAMPTZ,
  voided_by      UUID REFERENCES users(id),
  void_reason    TEXT,

  CONSTRAINT chk_cash_ledger_kind CHECK (kind IN (
    'FALTANTE', 'SOBRANTE', 'REPOSICION', 'CONDONACION',
    'COMPENSACION', 'APLICACION_SOBRANTE', 'DEVOLUCION_SOBRANTE'
  )),
  CONSTRAINT chk_cash_ledger_method CHECK (method IS NULL OR method IN ('EFECTIVO', 'TRANSFERENCIA')),
  CONSTRAINT chk_cash_ledger_related CHECK (
    kind NOT IN ('APLICACION_SOBRANTE', 'DEVOLUCION_SOBRANTE', 'COMPENSACION') OR related_id IS NOT NULL
  ),
  CONSTRAINT chk_cash_ledger_note CHECK (
    kind NOT IN ('CONDONACION', 'COMPENSACION', 'DEVOLUCION_SOBRANTE')
    OR length(btrim(COALESCE(note, ''))) >= 3
  )
);

COMMENT ON TABLE collector_cash_ledger IS 'Cuenta de efectivo del cobrador: faltantes, sobrantes y sus movimientos. Inmutable; se anula, no se borra.';

CREATE INDEX IF NOT EXISTS idx_cash_ledger_collector ON collector_cash_ledger(collector_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_company   ON collector_cash_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_closing   ON collector_cash_ledger(closing_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_related   ON collector_cash_ledger(related_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_payment   ON collector_cash_ledger(payment_id);

-- Un cierre solo puede tener UN movimiento de diferencia vigente (se reemplaza al reabrir y volver a aprobar)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_closing_diff
  ON collector_cash_ledger(closing_id)
  WHERE closing_id IS NOT NULL AND kind IN ('FALTANTE', 'SOBRANTE') AND voided_at IS NULL;

-- ─── GUARDA DE INTEGRIDAD ─────────────────────────────────────
-- 1) Impide editar un movimiento (solo se puede anular o restaurar).
-- 2) Impide que el faltante o el sobrante pendiente del cobrador quede en negativo.
-- 3) Serializa los cambios por cobrador para que dos admins no se pisen.
CREATE OR REPLACE FUNCTION cash_ledger_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_debt    NUMERIC;
  v_surplus NUMERIC;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id    IS DISTINCT FROM OLD.company_id
    OR NEW.collector_id  IS DISTINCT FROM OLD.collector_id
    OR NEW.route_id      IS DISTINCT FROM OLD.route_id
    OR NEW.closing_id    IS DISTINCT FROM OLD.closing_id
    OR NEW.kind          IS DISTINCT FROM OLD.kind
    OR NEW.amount        IS DISTINCT FROM OLD.amount
    OR NEW.movement_date IS DISTINCT FROM OLD.movement_date
    OR NEW.method        IS DISTINCT FROM OLD.method
    OR NEW.related_id    IS DISTINCT FROM OLD.related_id
    OR NEW.note          IS DISTINCT FROM OLD.note
    OR NEW.is_late       IS DISTINCT FROM OLD.is_late
    OR NEW.created_by    IS DISTINCT FROM OLD.created_by
    OR NEW.created_at    IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Los movimientos de la cuenta de efectivo no se pueden editar: anúlalos y registra uno nuevo.';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.collector_id::text));

  SELECT
    COALESCE(SUM(CASE kind
      WHEN 'FALTANTE'    THEN  amount
      WHEN 'REPOSICION'  THEN -amount
      WHEN 'CONDONACION' THEN -amount
      WHEN 'COMPENSACION' THEN -amount
      ELSE 0 END), 0),
    COALESCE(SUM(CASE kind
      WHEN 'SOBRANTE'            THEN  amount
      WHEN 'APLICACION_SOBRANTE' THEN -amount
      WHEN 'DEVOLUCION_SOBRANTE' THEN -amount
      WHEN 'COMPENSACION'        THEN -amount
      ELSE 0 END), 0)
  INTO v_debt, v_surplus
  FROM collector_cash_ledger
  WHERE collector_id = NEW.collector_id
    AND voided_at IS NULL
    AND id <> NEW.id;

  IF NEW.voided_at IS NULL THEN
    v_debt := v_debt + CASE NEW.kind
      WHEN 'FALTANTE'     THEN  NEW.amount
      WHEN 'REPOSICION'   THEN -NEW.amount
      WHEN 'CONDONACION'  THEN -NEW.amount
      WHEN 'COMPENSACION' THEN -NEW.amount
      ELSE 0 END;
    v_surplus := v_surplus + CASE NEW.kind
      WHEN 'SOBRANTE'            THEN  NEW.amount
      WHEN 'APLICACION_SOBRANTE' THEN -NEW.amount
      WHEN 'DEVOLUCION_SOBRANTE' THEN -NEW.amount
      WHEN 'COMPENSACION'        THEN -NEW.amount
      ELSE 0 END;
  END IF;

  IF v_debt < -0.005 THEN
    RAISE EXCEPTION 'La operación dejaría el faltante del cobrador en negativo (la reposición, condonación o compensación supera lo que debe).';
  END IF;
  IF v_surplus < -0.005 THEN
    RAISE EXCEPTION 'La operación dejaría el sobrante del cobrador en negativo (lo aplicado, devuelto o compensado supera el sobrante).';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cash_ledger_guard ON collector_cash_ledger;
CREATE TRIGGER trg_cash_ledger_guard
  BEFORE INSERT OR UPDATE ON collector_cash_ledger
  FOR EACH ROW EXECUTE FUNCTION cash_ledger_guard();

-- ─── RLS ──────────────────────────────────────────────────────
-- Sin política de DELETE: los movimientos no se pueden borrar.
ALTER TABLE collector_cash_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_ledger_admin_select ON collector_cash_ledger;
DROP POLICY IF EXISTS cash_ledger_admin_insert ON collector_cash_ledger;
DROP POLICY IF EXISTS cash_ledger_admin_update ON collector_cash_ledger;
DROP POLICY IF EXISTS cash_ledger_collector_select ON collector_cash_ledger;
DROP POLICY IF EXISTS cash_ledger_super_admin_select ON collector_cash_ledger;

CREATE POLICY cash_ledger_admin_select ON collector_cash_ledger FOR SELECT
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY cash_ledger_admin_insert ON collector_cash_ledger FOR INSERT
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND company_id = get_user_company_id()
    AND collector_id IN (SELECT id FROM users WHERE company_id = get_user_company_id())
  );

CREATE POLICY cash_ledger_admin_update ON collector_cash_ledger FOR UPDATE
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY cash_ledger_collector_select ON collector_cash_ledger FOR SELECT
  USING (get_user_role() = 'COBRADOR' AND collector_id = auth.uid());

CREATE POLICY cash_ledger_super_admin_select ON collector_cash_ledger FOR SELECT
  USING (is_super_admin());

-- ─── REALTIME (para que el panel se refresque solo) ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'collector_cash_ledger'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collector_cash_ledger;
  END IF;
END $$;

-- ─── PARÁMETRO: plazo para aclarar un sobrante sin marcarlo como tardío ───
-- (el código usa 7 por defecto si una empresa nueva aún no tiene la fila)
INSERT INTO system_settings (company_id, key, value, description)
SELECT c.id,
       'late_clarification_days',
       '7'::jsonb,
       'Días máximos para aclarar un sobrante de caja con un cobro de cliente sin que quede marcado como tardío'
FROM companies c
ON CONFLICT (company_id, key) DO NOTHING;
