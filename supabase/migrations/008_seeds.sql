-- ============================================================
-- MIGRATION 008: SEEDS INICIALES
-- Datos mínimos para arrancar el sistema
-- ============================================================

-- ─── ROLES ────────────────────────────────────────────────
INSERT INTO roles (id, name, permissions, description) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'ADMINISTRADOR',
  '{
    "can_create_users": true,
    "can_delete_users": true,
    "can_create_loans": true,
    "can_delete_loans": false,
    "can_correct_payments": true,
    "can_annul_payments": true,
    "can_close_day": true,
    "can_view_reports": true,
    "can_view_audit": true,
    "can_configure_system": true,
    "can_manage_routes": true,
    "can_manage_clients": true,
    "can_authorize_refinancing": true,
    "can_override_active_loan_rule": true
  }',
  'Control total del sistema'
),
(
  'a0000000-0000-0000-0000-000000000002',
  'COBRADOR',
  '{
    "can_create_clients": true,
    "can_create_loans": true,
    "can_register_payments": true,
    "can_register_expenses": true,
    "can_view_own_route": true,
    "can_work_offline": true,
    "can_correct_payments": false,
    "can_annul_payments": false,
    "can_delete_clients": false,
    "can_modify_historical_payments": false,
    "can_view_reports": false,
    "can_view_audit": false
  }',
  'Cobrador en campo. Solo puede operar sobre sus rutas asignadas.'
),
(
  'a0000000-0000-0000-0000-000000000003',
  'SUPERVISOR',
  '{
    "permissions_pending": true,
    "note": "Permisos pendientes de definición por el administrador"
  }',
  'Supervisor. Permisos pendientes de definición.'
);

-- ─── CATEGORÍAS DE GASTOS (sistema) ───────────────────────
INSERT INTO expense_categories (name, description, active, is_system) VALUES
('Combustible',  'Combustible para el vehículo de la ruta',      true, true),
('Aceite',       'Aceite del vehículo',                           true, true),
('Reparación',   'Reparaciones del vehículo',                     true, true),
('Llantas',      'Cambio o reparación de llantas',               true, true),
('Cadena',       'Cadena del vehículo',                           true, true),
('Repuestos',    'Repuestos varios del vehículo',                true, true),
('Otros',        'Otros gastos relacionados con el vehículo',    true, true);

-- ─── CONFIGURACIONES DEL SISTEMA ─────────────────────────
INSERT INTO system_settings (key, value, description) VALUES

-- Plazos permitidos (solo estos — regla de negocio)
('allowed_terms', '[30, 40, 45, 60]', 'Plazos de préstamo permitidos en días calendario'),

-- Interés fijo del 20%
('interest_rate', '0.2', 'Porcentaje de interés fijo aplicado a todos los préstamos'),

-- Días de gracia post-vencimiento
('grace_days', '7', 'Días de gracia después de vencimiento antes de pasar a CLAVO'),

-- Valores comerciales para refinanciación (configurables)
('commercial_refinancing_values',
 '[100000, 150000, 200000, 300000, 400000, 500000, 600000, 800000, 1000000]',
 'Valores comerciales disponibles para refinanciación. Pendiente definir regla de selección.'),

-- Frecuencias de cobro disponibles
('allowed_frequencies', '["DIARIO", "SEMANAL", "QUINCENAL"]', 'Frecuencias de cobro permitidas'),

-- Boleta (configurable: 0 = sin boleta)
('default_receipt_fee', '0', 'Valor por defecto de boleta al crear préstamo'),

-- Control de foto en clientes
('require_client_photo', 'false', 'Si true, requiere foto al crear cliente'),

-- Días de trabajo (para referencia — el calendario siempre usa días calendario)
('working_days', '["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"]',
 'Días en que normalmente trabajan los cobradores. Los domingos y festivos siguen siendo días de calendario.'),

-- Viáticos por defecto (0 = sin viático por defecto, se configura por cobrador)
('default_viaticum', '0', 'Viático diario por defecto. Se puede sobreescribir por cobrador en route_assignments.');

-- ─── FESTIVOS COLOMBIA 2024-2025 ──────────────────────────
INSERT INTO holidays (holiday_date, name, country_code) VALUES
-- 2024
('2024-01-01', 'Año Nuevo', 'CO'),
('2024-01-08', 'Día de los Reyes Magos', 'CO'),
('2024-03-25', 'Día de San José', 'CO'),
('2024-03-28', 'Jueves Santo', 'CO'),
('2024-03-29', 'Viernes Santo', 'CO'),
('2024-05-01', 'Día del Trabajo', 'CO'),
('2024-05-13', 'Ascensión de Cristo', 'CO'),
('2024-06-03', 'Corpus Christi', 'CO'),
('2024-06-10', 'Sagrado Corazón', 'CO'),
('2024-06-24', 'San Pedro y San Pablo', 'CO'),
('2024-07-04', 'San Pedro y San Pablo', 'CO'),
('2024-07-20', 'Día de la Independencia', 'CO'),
('2024-08-07', 'Batalla de Boyacá', 'CO'),
('2024-08-19', 'Asunción de la Virgen', 'CO'),
('2024-10-14', 'Día de la Raza', 'CO'),
('2024-11-04', 'Todos los Santos', 'CO'),
('2024-11-11', 'Independencia de Cartagena', 'CO'),
('2024-12-08', 'Inmaculada Concepción', 'CO'),
('2024-12-25', 'Navidad', 'CO'),
-- 2025
('2025-01-01', 'Año Nuevo', 'CO'),
('2025-01-06', 'Día de los Reyes Magos', 'CO'),
('2025-03-24', 'Día de San José', 'CO'),
('2025-04-17', 'Jueves Santo', 'CO'),
('2025-04-18', 'Viernes Santo', 'CO'),
('2025-05-01', 'Día del Trabajo', 'CO'),
('2025-06-02', 'Ascensión de Cristo', 'CO'),
('2025-06-23', 'Corpus Christi', 'CO'),
('2025-06-30', 'Sagrado Corazón', 'CO'),
('2025-07-07', 'San Pedro y San Pablo', 'CO'),
('2025-07-20', 'Día de la Independencia', 'CO'),
('2025-08-07', 'Batalla de Boyacá', 'CO'),
('2025-08-18', 'Asunción de la Virgen', 'CO'),
('2025-10-13', 'Día de la Raza', 'CO'),
('2025-11-03', 'Todos los Santos', 'CO'),
('2025-11-17', 'Independencia de Cartagena', 'CO'),
('2025-12-08', 'Inmaculada Concepción', 'CO'),
('2025-12-25', 'Navidad', 'CO'),
-- 2026
('2026-01-01', 'Año Nuevo', 'CO'),
('2026-01-12', 'Día de los Reyes Magos', 'CO'),
('2026-03-23', 'Día de San José', 'CO'),
('2026-04-02', 'Jueves Santo', 'CO'),
('2026-04-03', 'Viernes Santo', 'CO'),
('2026-05-01', 'Día del Trabajo', 'CO'),
('2026-05-18', 'Ascensión de Cristo', 'CO'),
('2026-06-08', 'Corpus Christi', 'CO'),
('2026-06-15', 'Sagrado Corazón', 'CO'),
('2026-07-06', 'San Pedro y San Pablo', 'CO'),
('2026-07-20', 'Día de la Independencia', 'CO'),
('2026-08-07', 'Batalla de Boyacá', 'CO'),
('2026-08-17', 'Asunción de la Virgen', 'CO'),
('2026-10-12', 'Día de la Raza', 'CO'),
('2026-11-02', 'Todos los Santos', 'CO'),
('2026-11-16', 'Independencia de Cartagena', 'CO'),
('2026-12-08', 'Inmaculada Concepción', 'CO'),
('2026-12-25', 'Navidad', 'CO');
