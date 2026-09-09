-- ============================================================
-- MIGRATION 001: ENUMS
-- Sistema PWA de Préstamos, Cobros y Rutas
-- ============================================================

-- Estado del préstamo
CREATE TYPE loan_status AS ENUM (
  'ACTIVO',
  'VENCIDO',
  'EN_GRACIA',
  'CLAVO',
  'REFINANCIADO',
  'CANCELADO'
);

-- Estado de cuota individual
CREATE TYPE installment_status AS ENUM (
  'PENDIENTE',
  'PAGADA',
  'PAGADA_ANTICIPADAMENTE',  -- domingos prepagados al desembolso
  'PARCIAL',
  'ATRASADA'
);

-- Tipo de día en el calendario
CREATE TYPE day_type AS ENUM (
  'NORMAL',
  'DOMINGO',
  'FESTIVO',
  'DOMINGO_FESTIVO'
);

-- Tipo de asignación de pago a cuota
CREATE TYPE allocation_type AS ENUM (
  'DIA_ACTUAL',    -- cuota correspondiente al día de cobro
  'ATRASO',        -- cuota atrasada de días anteriores
  'ADELANTO',      -- cuota futura pagada adelantada
  'PARCIAL'        -- abono parcial a una cuota
);

-- Estado de sincronización (offline → online)
CREATE TYPE sync_status AS ENUM (
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict'
);

-- Frecuencia de cobro (no cambia el calendario, solo el monto por visita)
CREATE TYPE payment_frequency AS ENUM (
  'DIARIO',
  'SEMANAL',
  'QUINCENAL'
);

-- Estado del cliente
CREATE TYPE client_status AS ENUM (
  'ACTIVO',
  'INACTIVO',
  'BLOQUEADO'
);

-- Estado del gasto
CREATE TYPE expense_status AS ENUM (
  'PENDIENTE',
  'REVISADO',
  'RECHAZADO'
);

-- Rol de usuario en el sistema
CREATE TYPE user_role AS ENUM (
  'ADMINISTRADOR',
  'COBRADOR',
  'SUPERVISOR'
);
