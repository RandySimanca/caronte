-- ============================================================
-- MIGRATION 046: ORIGEN DEL DINERO Y OTROS RETIROS
-- ============================================================
-- Se aplica ENCIMA de la 045 (route_capital_movements). Cambios:
--
--   1. Columna source: de dónde sale el dinero de un pago de salario
--        RUTA     descuenta de la base de la ruta (como hasta ahora). Pide ruta.
--        EXTERNO  el admin paga con otro dinero: NO toca la base ni el efectivo de la ruta, pero queda
--                 registrado y cuenta como salario pagado en los reportes. La ruta es opcional
--                 (sirve solo para que cuente en los reportes de esa ruta).
--      Los aportes y los otros retiros siempre son de la ruta.
--   2. Nuevo tipo RETIRO_OTRO: retiro de dinero de la ruta que no es salario. Pide una nota.
--   3. route_id pasa a ser opcional (solo para pagos EXTERNO).
--
-- La base de la liquidación (y la función que usa el celular del cobrador) solo cuenta source = 'RUTA'.
-- Migración ADITIVA: los movimientos que ya existen quedan como 'RUTA', igual que antes.
-- ============================================================

ALTER TABLE route_capital_movements ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'RUTA';
ALTER TABLE route_capital_movements ALTER COLUMN route_id DROP NOT NULL;

ALTER TABLE route_capital_movements DROP CONSTRAINT IF EXISTS chk_capital_kind;
ALTER TABLE route_capital_movements ADD CONSTRAINT chk_capital_kind
  CHECK (kind IN ('APORTE_CAPITAL', 'SALARIO_COBRADOR', 'SALARIO_ADMIN', 'RETIRO_OTRO'));

ALTER TABLE route_capital_movements DROP CONSTRAINT IF EXISTS chk_capital_salary_fields;
ALTER TABLE route_capital_movements ADD CONSTRAINT chk_capital_salary_fields CHECK (
  (kind = 'APORTE_CAPITAL' AND beneficiary_id IS NULL AND period_month IS NULL)
  OR
  (kind IN ('SALARIO_COBRADOR', 'SALARIO_ADMIN') AND beneficiary_id IS NOT NULL AND period_month IS NOT NULL)
  OR
  (kind = 'RETIRO_OTRO' AND beneficiary_id IS NULL AND period_month IS NULL
     AND length(btrim(COALESCE(note, ''))) >= 3)
);

ALTER TABLE route_capital_movements DROP CONSTRAINT IF EXISTS chk_capital_source;
ALTER TABLE route_capital_movements ADD CONSTRAINT chk_capital_source
  CHECK (source IN ('RUTA', 'EXTERNO'));

ALTER TABLE route_capital_movements DROP CONSTRAINT IF EXISTS chk_capital_source_route;
ALTER TABLE route_capital_movements ADD CONSTRAINT chk_capital_source_route CHECK (
  (source = 'RUTA' AND route_id IS NOT NULL)
  OR
  (source = 'EXTERNO' AND kind IN ('SALARIO_COBRADOR', 'SALARIO_ADMIN'))
);

-- ─── GUARDA DE INTEGRIDAD (reemplaza la de la 045) ────────────
-- Las reglas de "día ya liquidado" solo aplican a los movimientos de la ruta: un pago EXTERNO no entra
-- a ninguna liquidación, así que no depende de los cierres.
CREATE OR REPLACE FUNCTION route_capital_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'RUTA' THEN
      SELECT MAX(dc.closing_date) INTO v_last
        FROM daily_closings dc
       WHERE dc.route_id = NEW.route_id AND dc.is_closed;
      IF v_last IS NOT NULL AND NEW.movement_date <= v_last THEN
        RAISE EXCEPTION 'La ruta ya está liquidada hasta el %: el movimiento debe tener una fecha posterior.',
          to_char(v_last, 'DD/MM/YYYY');
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.company_id     IS DISTINCT FROM OLD.company_id
  OR NEW.route_id       IS DISTINCT FROM OLD.route_id
  OR NEW.kind           IS DISTINCT FROM OLD.kind
  OR NEW.source         IS DISTINCT FROM OLD.source
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

  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL AND OLD.source = 'RUTA' THEN
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

-- ─── RLS: ahora route_id puede ser NULL (pagos EXTERNO) ───────
DROP POLICY IF EXISTS capital_admin_insert ON route_capital_movements;
CREATE POLICY capital_admin_insert ON route_capital_movements FOR INSERT
  WITH CHECK (
    get_user_role() = 'ADMINISTRADOR'
    AND company_id = get_user_company_id()
    AND (route_id IS NULL OR route_id IN (SELECT id FROM routes WHERE company_id = get_user_company_id()))
    AND (beneficiary_id IS NULL OR beneficiary_id IN (SELECT id FROM users WHERE company_id = get_user_company_id()))
  );

-- ─── FUNCIÓN PARA LA BASE AUTOMÁTICA (reemplaza la de la 045) ──
-- Solo cuenta movimientos de la ruta (source = 'RUTA') e incluye los otros retiros.
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
    COALESCE(SUM(m.amount) FILTER (WHERE m.kind IN ('SALARIO_COBRADOR', 'SALARIO_ADMIN', 'RETIRO_OTRO')), 0)::NUMERIC
  FROM route_capital_movements m
  WHERE m.route_id = p_route_id
    AND m.source = 'RUTA'
    AND m.voided_at IS NULL
    AND m.movement_date <= p_date
    AND (v_prev IS NULL OR m.movement_date > v_prev);
END $$;

REVOKE ALL ON FUNCTION get_route_pending_capital(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_route_pending_capital(UUID, DATE) TO authenticated;
