-- ============================================================
-- MIGRATION 023: ASIGNAR ROL SUPER ADMIN A USUARIO EXISTENTE
-- Asigna el rol SUPER_ADMIN al usuario creado manualmente
-- ============================================================

DO $$
DECLARE
  v_role_id UUID;
  v_user_id UUID;
BEGIN
  -- Obtener el ID del rol SUPER_ADMIN
  SELECT id INTO v_role_id FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Rol SUPER_ADMIN no encontrado. Ejecuta primero la migración 022.';
  END IF;

  -- Obtener el ID del usuario de auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'randysimancamercado@gmail.com' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario randysimancamercado@gmail.com no encontrado en auth.users.';
  END IF;

  -- Crear o actualizar el usuario en la tabla users con rol SUPER_ADMIN
  INSERT INTO users (
    id,
    role_id,
    company_id,
    full_name,
    phone,
    active,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_role_id,
    NULL, -- SuperAdmin no pertenece a ninguna empresa específica
    'Randy Siman Mercado',
    NULL,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    role_id = v_role_id,
    company_id = NULL,
    full_name = 'Randy Siman Mercado',
    active = true,
    updated_at = NOW();

  RAISE NOTICE 'Usuario SuperAdmin asignado correctamente: randysimancamercado@gmail.com';
END $$;
