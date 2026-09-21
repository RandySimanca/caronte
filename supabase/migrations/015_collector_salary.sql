-- Migración 015: Salario del cobrador
-- Agrega soporte para salario mensual del cobrador,
-- siguiendo el mismo modelo que el viático (global + override por asignación).

-- 1. Columna salary en route_assignments (override por cobrador/ruta).
--    NULL = usar el valor global de system_settings('default_salary')
ALTER TABLE route_assignments
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12, 2) DEFAULT NULL;

COMMENT ON COLUMN route_assignments.salary IS
  'Salario mensual asignado a este cobrador en esta ruta. NULL = heredar default_salary de system_settings.';

-- 2. Valor global por defecto de salario en system_settings.
INSERT INTO system_settings (key, value, description)
VALUES (
  'default_salary',
  '0',
  'Salario mensual base del cobrador. Se puede sobreescribir por cobrador en la asignación de ruta.'
)
ON CONFLICT (key) DO NOTHING;
