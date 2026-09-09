-- LIMPIEZA DE DATOS DE DESARROLLO
-- Este script elimina todos los clientes y, debido a CASCADE, eliminará automáticamente:
-- 1. Préstamos (loans)
-- 2. Cuotas (loan_installments)
-- 3. Pagos (payments)
-- 4. Ganadores de lotería y boletas asociados a esos préstamos.

TRUNCATE TABLE clients CASCADE;
