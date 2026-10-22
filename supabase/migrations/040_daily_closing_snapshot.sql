-- ============================================================
-- MIGRATION 040: RESPALDO (SNAPSHOT) DE LA LIQUIDACIÓN APROBADA
-- ============================================================
-- Guarda, al aprobar una liquidación, el detalle completo que vio el admin
-- (base, recaudo, transferencias, gastos con su detalle, viático, préstamos
-- nuevos con su detalle, total a entregar). Así el modal y el PDF de un día ya
-- liquidado muestran exactamente lo aprobado, aunque después se corrijan o
-- eliminen cobros en el servidor.

ALTER TABLE daily_closings
  ADD COLUMN IF NOT EXISTS snapshot JSONB;

COMMENT ON COLUMN daily_closings.snapshot IS
  'Respaldo JSON del detalle de la liquidación al momento de aprobarse (version, base_amount, total_entregar, detail). NULL en liquidaciones anteriores a la migración 040.';
