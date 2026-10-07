-- ============================================================
-- PRUEBAS RLS MULTIEMPRESA - GUÍA DE PRUEBAS
-- Este archivo documenta las pruebas para verificar el aislamiento por empresa
-- ============================================================

-- NOTA: Este archivo NO contiene datos de prueba. Debes crear tus propios
-- datos de prueba en la base de datos para ejecutar estas pruebas.

-- ESTRUCTURA DE DATOS DE PRUEBA RECOMENDADA:
-- ============================================================
--
-- 1. Crear al menos 2 empresas en la tabla companies:
--    - Empresa A (id conocido)
--    - Empresa B (id conocido)
--
-- 2. Crear usuarios en auth.users (via panel de Supabase o edge function):
--    - Admin de Empresa A
--    - Cobrador de Empresa A
--    - Admin de Empresa B
--    - Cobrador de Empresa B
--    - SuperAdmin (company_id = NULL)
--
-- 3. Insertar esos usuarios en public.users con sus roles y company_id
--
-- 4. Crear rutas para cada empresa (con company_id correspondiente)
--
-- 5. Asignar rutas a cobradores via route_assignments
--
-- 6. Crear clientes en las rutas de cada empresa
--
-- 7. Crear configuración (system_settings) para cada empresa
--
-- ============================================================

-- PRUEBAS DE AISLAMIENTO
-- ============================================================

-- Para ejecutar estas pruebas, usa el cliente de Supabase con tokens JWT
-- de diferentes usuarios. Aquí están las consultas a ejecutar en cada contexto.

-- PRUEBA 1: Admin de A no ve clientes de B
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM clients;
-- Esperado: Solo clientes de Empresa A
-- NO debe ver: Clientes de Empresa B

-- PRUEBA 2: Admin de A no ve rutas de B
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM routes;
-- Esperado: Solo rutas de Empresa A
-- NO debe ver: Rutas de Empresa B

-- PRUEBA 3: Admin de A no ve usuarios de B
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM users;
-- Esperado: Solo usuarios de Empresa A
-- NO debe ver: Usuarios de Empresa B

-- PRUEBA 4: Cobrador de A solo ve su ruta asignada
-- ------------------------------------------------
-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- SELECT * FROM routes;
-- Esperado: Solo la ruta asignada a este cobrador
-- NO debe ver: Otras rutas de Empresa A ni rutas de Empresa B

-- PRUEBA 5: Cobrador de A solo ve clientes de su ruta
-- ------------------------------------------------
-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- SELECT * FROM clients;
-- Esperado: Solo clientes de su ruta asignada
-- NO debe ver: Clientes de otras rutas ni de otras empresas

-- PRUEBA 6: Admin de A no puede modificar clientes de B
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- UPDATE clients SET full_name = 'Hack' WHERE id = <id_cliente_empresa_B>;
-- Esperado: ERROR (fila no encontrada por RLS o 0 filas afectadas)

-- PRUEBA 7: Admin de A no puede crear rutas en empresa B
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- INSERT INTO routes (name, company_id) VALUES ('Ruta Hack', <id_empresa_B>);
-- Esperado: ERROR (trigger guard_routes_company fuerza company_id de su empresa)

-- PRUEBA 8: Admin de A no puede asignar rol SUPER_ADMIN
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'SUPER_ADMIN')
-- WHERE id = <id_cobrador_empresa_A>;
-- Esperado: ERROR 'No tienes permiso para asignar el rol SUPER_ADMIN'

-- PRUEBA 9: Admin de A no puede cambiar company_id de usuario
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- UPDATE users SET company_id = <id_empresa_B> WHERE id = <id_cobrador_empresa_A>;
-- Esperado: ERROR 'No se puede cambiar la empresa de un usuario'

-- PRUEBA 10: Admin de A no puede cambiar su propio rol
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'COBRADOR')
-- WHERE id = <id_admin_empresa_A>;
-- Esperado: ERROR 'No puedes cambiar tu propio rol'

-- PRUEBA 11: Configuración por empresa está aislada
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM system_settings;
-- Esperado: Solo settings con company_id = Empresa A
-- NO debe ver: Settings de Empresa B

-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- SELECT * FROM system_settings;
-- Esperado: Solo settings con company_id = Empresa A (lectura permitida)

-- PRUEBA 12: SuperAdmin ve todo (solo SELECT en tablas de negocio)
-- ------------------------------------------------
-- Contexto: JWT del SuperAdmin
-- Consulta:
-- SELECT * FROM users;
-- Esperado: Todos los usuarios de todas las empresas

-- Contexto: JWT del SuperAdmin
-- Consulta:
-- SELECT * FROM routes;
-- Esperado: Todas las rutas de todas las empresas

-- Contexto: JWT del SuperAdmin
-- Consulta:
-- SELECT * FROM clients;
-- Esperado: Todos los clientes de todas las empresas

-- Contexto: JWT del SuperAdmin
-- Consulta:
-- SELECT * FROM loans;
-- Esperado: Todos los préstamos de todas las empresas

-- NOTA: SuperAdmin tiene ALL en companies, users, roles
-- pero solo SELECT en tablas de negocio (clients, loans, payments, etc.)

-- PRUEBA 13: SuperAdmin puede crear usuario SUPER_ADMIN
-- ------------------------------------------------
-- Contexto: JWT del SuperAdmin
-- Consulta:
-- (Se probará en Fase 2 con la edge function admin-create-user)
-- Esperado: SuperAdmin puede crear usuarios con rol SUPER_ADMIN

-- PRUEBA 14: Límite de rutas del plan
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Requisito: Empresa A debe tener max_routes = N y ya tener N rutas creadas
-- Consulta:
-- INSERT INTO routes (name, company_id) VALUES ('Ruta Extra', <id_empresa_A>);
-- Esperado: ERROR 'Límite de rutas del plan alcanzado'

-- PRUEBA 15: Límite de cobradores del plan
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Requisito: Empresa A debe tener max_collectors = N y ya tener N cobradores
-- Consulta:
-- INSERT INTO users (id, full_name, role_id, company_id, active, created_at, updated_at)
-- VALUES (
--   <nuevo_uuid>,
--   'Cobrador Extra',
--   (SELECT id FROM roles WHERE name = 'COBRADOR'),
--   <id_empresa_A>,
--   true,
--   NOW(),
--   NOW()
-- );
-- Esperado: ERROR 'Límite de cobradores del plan alcanzado'

-- PRUEBA 16: update_client_orders respeta empresa
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT update_client_orders(
--   '[{"id": "<id_cliente_empresa_A>", "route_order": 10}]'::jsonb
-- );
-- Esperado: 1 (actualizado exitosamente)

-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT update_client_orders(
--   '[{"id": "<id_cliente_empresa_B>", "route_order": 10}]'::jsonb
-- );
-- Esperado: 0 (no actualizado, cliente de otra empresa)

-- PRUEBA 17: sync_new_loan_bundle respeta empresa
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta: Intentar crear préstamo con route_id de Empresa B
-- Esperado: ERROR 'La ruta no está asignada a este usuario o empresa'

-- PRUEBA 18: process_lottery_draw respeta empresa
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta: Ejecutar sorteo
-- Esperado: Solo procesa préstamos de Empresa A, no de Empresa B

-- PRUEBA 19: Cobrador no puede escribir si empresa está suspendida
-- ------------------------------------------------
-- Contexto: Suspender Empresa A (status = 'SUSPENDED' o subscription_expires_at vencida)
-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- INSERT INTO clients (id, full_name, document_id, route_id, status, created_at, updated_at)
-- VALUES (<nuevo_uuid>, 'Test', 'DOC', <id_ruta>, 'ACTIVO', NOW(), NOW());
-- Esperado: ERROR (por trigger con company_is_active())

-- PRUEBA 20: Admin puede ver configuración de su empresa
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM system_settings WHERE company_id = <id_empresa_A>;
-- Esperado: Puede ver y modificar settings de su empresa

-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM expense_categories WHERE company_id = <id_empresa_A>;
-- Esperado: Puede ver y modificar categorías de su empresa

-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT * FROM holidays WHERE company_id = <id_empresa_A>;
-- Esperado: Puede ver y modificar festivos de su empresa

-- PRUEBA 21: Cobrador puede leer configuración de su empresa
-- ------------------------------------------------
-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- SELECT * FROM system_settings WHERE company_id = <id_empresa_A>;
-- Esperado: Puede leer (SELECT) pero no modificar (sin INSERT/UPDATE)

-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- SELECT * FROM expense_categories WHERE company_id = <id_empresa_A>;
-- Esperado: Puede leer (SELECT) pero no modificar

-- Contexto: JWT del Cobrador de Empresa A
-- Consulta:
-- SELECT * FROM holidays WHERE company_id = <id_empresa_A>;
-- Esperado: Puede leer (SELECT) pero no modificar

-- PRUEBA 22: Función seed_company_defaults solo ejecutable por service_role
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- SELECT seed_company_defaults(<id_nueva_empresa>);
-- Esperado: ERROR (permiso denegado)

-- PRUEBA 23: Trigger de actualización de updated_at en routes no rompe RLS
-- ------------------------------------------------
-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- UPDATE routes SET name = 'Nuevo Nombre' WHERE id = <id_ruta_empresa_A>;
-- Esperado: Actualización exitosa

-- Contexto: JWT del Admin de Empresa A
-- Consulta:
-- UPDATE routes SET name = 'Hack' WHERE id = <id_ruta_empresa_B>;
-- Esperado: 0 filas afectadas (RLS bloquea)

-- ============================================================
-- RESUMEN DE VALIDACIONES
-- ============================================================

-- Después de ejecutar estas pruebas, deberías verificar:
--
-- 1. Aislamiento por empresa funciona correctamente
-- 2. SuperAdmin tiene acceso SELECT a todo pero no puede modificar datos de negocio
-- 3. Cobradores solo ven y operan sobre sus rutas asignadas
-- 4. Admins solo ven y operan sobre datos de su empresa
-- 5. Triggers de protección funcionan (no se puede asignar SUPER_ADMIN, cambiar company_id, etc.)
-- 6. Límites de planes (max_routes, max_collectors) se respetan
-- 7. Funciones RPC respetan el aislamiento por empresa
-- 8. Configuración por empresa está aislada correctamente
-- 9. Empresas suspendidas/vencidas bloquean escrituras de cobradores
--
-- ============================================================
