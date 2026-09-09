-- Migración 013: Agregar campo viaticum a route_assignments
-- Permite sobreescribir el viático diario por defecto (default_viaticum) para un cobrador específico.
-- NULL = usar el valor global de system_settings('default_viaticum')

ALTER TABLE route_assignments
  ADD COLUMN IF NOT EXISTS viaticum NUMERIC(12, 2) DEFAULT NULL;

COMMENT ON COLUMN route_assignments.viaticum IS 
  'Viático diario asignado a este cobrador en esta ruta. NULL = heredar default_viaticum de system_settings.';
