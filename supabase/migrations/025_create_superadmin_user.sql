-- ============================================================
-- MIGRATION 025: CREAR USUARIO SUPER ADMIN
-- Crea el usuario SuperAdmin si no existe y le asigna el rol SUPER_ADMIN
-- NOTA: Esta migración requiere que el usuario se cree manualmente via la UI de Supabase
-- o usando la función admin_create_user después de la migración 027
-- ============================================================

DO $$
DECLARE
  v_role_id UUID;
  v_user_id UUID;
BEGIN
  -- Obtener el ID del rol SUPER_ADMIN
  SELECT id INTO v_role_id FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Rol SUPER_ADMIN no encontrado. Ejecuta primero la migración 024.';
  END IF;

  -- Obtener el ID del usuario de auth.users, si existe
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'randysimancamercado@gmail.com' LIMIT 1;

  -- Si el usuario existe en auth.users, crear el registro en users
  IF v_user_id IS NOT NULL THEN
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
  ELSE
    RAISE NOTICE 'Usuario randysimancamercado@gmail.com no existe en auth.users. Por favor cree el usuario manualmente en la UI de Supabase o use la función admin_create_user después de la migración 027.';
  END IF;
END $$;
