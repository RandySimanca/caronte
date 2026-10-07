-- ============================================================
-- DIAGNÓSTICO PRE-028: ANÁLISIS DEL ESTADO ACTUAL DE LA BASE DE DATOS
-- Ejecutar estas consultas en el SQL Editor de Supabase y pegar los resultados
-- ============================================================

-- 1. Políticas RLS actuales
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, policyname;

-- 2. Migraciones aplicadas
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;

-- 3. Funciones SECURITY DEFINER y permisos de ejecución
SELECT
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition,
  array_agg(
    CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon' END
  ) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_execute,
  array_agg(
    CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated' END
  ) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) as authenticated_execute,
  array_agg(
    CASE WHEN has_function_privilege('public', p.oid, 'EXECUTE') THEN 'public' END
  ) FILTER (WHERE has_function_privilege('public', p.oid, 'EXECUTE')) as public_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
GROUP BY p.proname, p.oid
ORDER BY p.proname;

-- 4. Filas con company_id IS NULL en users y routes
SELECT 'users' as tabla, id, full_name, role_id, company_id
FROM users
WHERE company_id IS NULL;

SELECT 'routes' as tabla, id, name, company_id
FROM routes
WHERE company_id IS NULL;

-- 5. Usuarios con rol SUPER_ADMIN
SELECT u.id, u.full_name, u.company_id, r.name as role_name
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.name = 'SUPER_ADMIN';

-- 6. Estado de las tablas de configuración (system_settings, expense_categories, holidays)
-- Para verificar si tienen company_id o no
SELECT
  'system_settings' as tabla,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'system_settings' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT
  'expense_categories' as tabla,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'expense_categories' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT
  'holidays' as tabla,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'holidays' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 7. Constraints UNIQUE en tablas de configuración
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('system_settings', 'expense_categories', 'holidays')
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name;

-- 8. Funciones RPC existentes
SELECT p.proname as function_name,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;
