-- LIMPIEZA DE DATOS DE DESARROLLO
-- Este script elimina todos los clientes y, debido a CASCADE, eliminará automáticamente:
-- 1. Préstamos (loans)
-- 2. Cuotas (loan_installments)
-- 3. Pagos (payments)
-- 4. Ganadores de lotería y boletas asociados a esos préstamos.

-- Ejecutar en Supabase -> SQL Editor
TRUNCATE TABLE 
  payment_allocations,
  payments,
  loan_installments,
  loans,
  clients,
  expenses,
  daily_closings,
  route_assignments,
  sync_logs,
  lottery_draws,
  routes,
  expense_categories,
  holidays,
  system_settings
CASCADE;
