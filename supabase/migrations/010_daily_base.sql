-- ============================================================
-- MIGRATION 010: BASE INICIAL (FONDO DE CAJA) EN CIERRES
-- ============================================================

-- 1. Añadir la columna de base_amount
ALTER TABLE daily_closings ADD COLUMN base_amount NUMERIC(15,6) NOT NULL DEFAULT 0;

COMMENT ON COLUMN daily_closings.base_amount IS 'Dinero base o fondo inicial entregado al cobrador al inicio del día.';

-- 2. Eliminar la restricción antigua
ALTER TABLE daily_closings DROP CONSTRAINT IF EXISTS chk_expected_delivery;

-- 3. Crear la nueva restricción actualizada con la base inicial
ALTER TABLE daily_closings ADD CONSTRAINT chk_expected_delivery CHECK (
  ABS(expected_delivery - (base_amount + total_collected - viaticum_assigned - total_expenses)) < 0.01
);
