-- ============================================================
-- MIGRATION 045: MOVIMIENTOS DE CAPITAL DE LA RUTA
-- ============================================================
-- Registra el dinero que el admin pone o saca de la plata que circula en la ruta:
--
--   APORTE_CAPITAL    el admin agrega dinero a la ruta                 (+ base)
--   SALARIO_COBRADOR  pago mensual al cobrador (solo salario)           (- base)
--   SALARIO_ADMIN     retiro mensual del administrador (su salario)     (- base)
--
-- El monto SIEMPRE es positivo; el tipo define si suma o resta.
-- Los movimientos no se editan ni se borran: se anulan (voided_at) con motivo.
--
-- Cómo entran a la liquidación:
--   Cada movimiento lleva una fecha (movement_date). La base automática de un día X es
--       actual_delivery del último cierre aprobado anterior a X
--       + aportes - retiros con fecha en (fecha de ese cierre, X]
--   Por eso no se puede registrar un movimiento con fecha igual o anterior a un día ya liquidado
--   de la ruta: ese día ya está cerrado y su base no cambia.
--
-- Migración ADITIVA: solo crea una tabla y dos funciones. No toca daily_closings ni sus restricciones.
-- Aplicar ANTES de desplegar el código nuevo.
--
-- Nota de privacidad: el salario del administrador NO se guarda en system_settings, porque esa tabla es
-- legible por todos los usuarios y el celular del cobrador descarga todos sus parámetros. Solo vive en
-- esta tabla, que únicamente puede leer el administrador.
-- ============================================================

CREATE TABLE IF NOT EXISTS route_capital_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL DEFAULT get_user_company_id() REFERENCES companies(id),
  route_id       UUID NOT NULL REFERENCES routes(id),
  kind           VARCHAR(30) NOT NULL,
  amount         NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  movement_date  DATE NOT NULL,                       -- día desde el que cuenta para la base
  method         VARCHAR(20),                         -- EFECTIVO | TRANSFERENCIA
  beneficiary_id UUID REFERENCES users(id),           -- a quién se le pagó (solo salarios)
  period_month   DATE,                                -- mes que cubre el pago, siempre día 1 (solo salarios)
  note           TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at      TIMESTAMPTZ,
  voided_by      UUID REFERENCES users(id),
  void_reason    TEXT,

  CONSTRAINT chk_capital_kind CHECK (kind IN ('APORTE_CAPITAL', 'SALARIO_COBRADOR', 'SALARIO_ADMIN')),
  CONSTRAINT chk_capital_method CHECK (method IS NULL OR method IN ('EFECTIVO', 'TRANSFERENCIA')),
  CONSTRAINT chk_capital_salary_fields CHECK (
    (kind = 'APORTE_CAPITAL' AND beneficiary_id IS NULL AND period_month IS NULL)
    OR
    (kind IN ('SALARIO_COBRADOR', 'SALARIO_ADMIN') AND beneficiary_id IS NOT NULL AND period_month IS NOT NULL)
  ),
  CONSTRAINT chk_capital_period_first_day CHECK (
    period_month IS NULL OR period_month = date_trunc('month', period_month)::date
  ),
  CONSTRAINT chk_capital_void_reason CHECK (
    voided_at IS NULL OR length(btrim(COALESCE(void_reason, ''))) >= 3
  )
);

COMMENT ON TABLE route_capital_movements IS 'Aportes de capital a la ruta y pagos de salario (cobrador y admin). Inmutable; se anula, no se borra.';

CREATE INDEX IF NOT EXISTS idx_capital_route_date   ON route_capital_movements(route_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_capital_company      ON route_capital_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_capital_beneficiary  ON route_capital_movements(beneficiary_id, period_month);

-- ─── GUARDA DE INTEGRIDAD ─────────────────────────────────────
-- 1) INSERT: la ruta no puede estar ya liquidada en esa fecha o después de ella.
-- 2) UPDATE: no se edita nada; solo se puede anular (una vez).
-- 3) Anular: solo si el movimiento aún no quedó dentro de una liquidación aprobada.
CREATE OR REPLACE FUNCTION route_capital_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT MAX(dc.closing_date) INTO v_last
      FROM daily_closings dc
     WHERE dc.route_id = NEW.route_id AND dc.is_closed;
    IF v_last IS NOT NULL AND NEW.movement_date <= v_last THEN
      RAISE EXCEPTION 'La ruta ya está liquidada hasta el %: el movimiento debe tener una fecha posterior.',
        to_char(v_last, 'DD/MM/YYYY');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.company_id     IS DISTINCT FROM OLD.company_id
  OR NEW.route_id       IS DISTINCT FROM OLD.route_id
  OR NEW.kind           IS DISTINCT FROM OLD.kind
  OR NEW.amount         IS DISTINCT FROM OLD.amount
  OR NEW.movement_date  IS DISTINCT FROM OLD.movement_date
  OR NEW.method         IS DISTINCT FROM OLD.method
  OR NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id
  OR NEW.period_month   IS DISTINCT FROM OLD.period_month
  OR NEW.note           IS DISTINCT FROM OLD.note
  OR NEW.created_by     IS DISTINCT FROM OLD.created_by
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Los movimientos de capital no se pueden editar: anúlalos y registra uno nuevo.';
  END IF;

  IF OLD.voided_at IS NOT NULL AND (
       NEW.voided_at   IS DISTINCT FROM OLD.voided_at
    OR NEW.voided_by   IS DISTINCT FROM OLD.voided_by
    OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
  ) THEN
    RAISE EXCEPTION 'Este movimiento ya está anulado.';
  END IF;

  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    SELECT MAX(dc.closing_date) INTO v_last
      FROM daily_closings dc
     WHERE dc.route_id = OLD.route_id AND dc.is_closed;
    IF v_last IS NOT NULL AND OLD.movement_date <= v_last THEN
      RAISE EXCEPTION 'Este movimiento ya quedó incluido en una liquidación aprobada (hasta el %). Reabre ese día en Liquidaciones para poder anularlo.',
        to_char(v_last, 'DD/MM/YYYY');
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_route_capital_guard ON route_capital_movements;
CREATE TRIGGER trg_route_capital_guard
  BEFORE INSERT OR UPDATE ON route_capital_movements
  FOR EACH ROW EXECUTE FUNCTION route_capital_guard();

-- ─── RLS ──────────────────────────────────────────────────────
-- Solo el admin ve y registra movimientos (incluye el salario del admin, que el cobrador no debe ver).
-- Sin política de DELETE: los movimientos no se pueden borrar.
ALTER TABLE route_capital_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capital_admin_select       ON route_capital_movements;
DROP POLICY IF EXISTS capital_admin_insert       ON route_capital_movements;
DROP POLICY IF EXISTS capital_admin_update       ON route_capital_movements;
DROP POLICY IF EXISTS capital_super_admin_select ON route_capital_movements;

CREATE POLICY capital_admin_select ON route_capital_movements FOR SELECT
  USING (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY capital_admin_insert ON route_capital_movements FOR INSERT
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND company_id = get_user_company_id()
    AND route_id IN (SELECT id FROM routes WHERE company_id = get_user_company_id())
    AND (beneficiary_id IS NULL OR beneficiary_id IN (SELECT id FROM users WHERE company_id = get_user_company_id()))
  );

CREATE POLICY capital_admin_update ON route_capital_movements FOR UPDATE
  USING      (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id())
  WITH CHECK (get_user_role() = 'ADMINISTRADOR' AND company_id = get_user_company_id());

CREATE POLICY capital_super_admin_select ON route_capital_movements FOR SELECT
  USING (is_super_admin());

-- ─── FUNCIÓN PARA LA BASE AUTOMÁTICA (la usa también el celular del cobrador) ───
-- Devuelve solo totales (no las filas) para que el cobrador nunca vea los pagos de salario.
-- Mismo criterio que la liquidación: movimientos con fecha en (último cierre aprobado anterior a p_date, p_date].
CREATE OR REPLACE FUNCTION get_route_pending_capital(p_route_id UUID, p_date DATE)
RETURNS TABLE (aportes NUMERIC, retiros NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev DATE;
BEGIN
  IF NOT (
    (get_user_role() = 'ADMINISTRADOR'
       AND EXISTS (SELECT 1 FROM routes r WHERE r.id = p_route_id AND r.company_id = get_user_company_id()))
    OR
    (get_user_role() = 'COBRADOR'
       AND EXISTS (SELECT 1 FROM route_assignments ra
                    WHERE ra.route_id = p_route_id AND ra.collector_id = auth.uid() AND ra.date_end IS NULL))
  ) THEN
    RAISE EXCEPTION 'No autorizado para consultar esta ruta.';
  END IF;

  SELECT MAX(dc.closing_date) INTO v_prev
    FROM daily_closings dc
   WHERE dc.route_id = p_route_id AND dc.is_closed AND dc.closing_date < p_date;

  RETURN QUERY
  SELECT
    COALESCE(SUM(m.amount) FILTER (WHERE m.kind = 'APORTE_CAPITAL'), 0)::NUMERIC,
    COALESCE(SUM(m.amount) FILTER (WHERE m.kind IN ('SALARIO_COBRADOR', 'SALARIO_ADMIN')), 0)::NUMERIC
  FROM route_capital_movements m
  WHERE m.route_id = p_route_id
    AND m.voided_at IS NULL
    AND m.movement_date <= p_date
    AND (v_prev IS NULL OR m.movement_date > v_prev);
END $$;

REVOKE ALL ON FUNCTION get_route_pending_capital(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_route_pending_capital(UUID, DATE) TO authenticated;

-- ─── REALTIME (para que el panel se refresque solo) ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'route_capital_movements'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.route_capital_movements;
  END IF;
END $$;
