-- ============================================================
-- SCRIPT PARA RECREAR USUARIO SUPER_ADMIN
-- Ejecuta esto en el SQL Editor de Supabase
-- ============================================================

-- REEMPLAZA ESTOS VALORES CON LOS DEL USUARIO QUE QUIERES CREAR
DO $$
DECLARE
  v_email VARCHAR := 'randysimancamercado@gmail.com';  -- CAMBIAR ESTO
  v_password VARCHAR := 'Valeria13.';  -- CAMBIAR ESTO
  v_full_name VARCHAR := 'Randy Simanca';  -- CAMBIAR ESTO
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  -- 1. Verificar si el email ya existe
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'El email % ya existe en auth.users. Usa otro email.', v_email;
  END IF;

  -- 2. Crear usuario en auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    email_change_token_current,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', v_full_name),
    false,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_user_id;

  -- 3. Crear identidad en auth.identities
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    provider_id
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    NOW(),
    NOW(),
    NOW(),
    v_email
  );

  -- 4. Obtener rol SUPER_ADMIN
  SELECT id INTO v_role_id FROM roles WHERE name = 'SUPER_ADMIN';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Rol SUPER_ADMIN no encontrado. Verifica que las migraciones estén aplicadas.';
  END IF;

  -- 5. Crear perfil en public.users
  INSERT INTO users (
    id,
    full_name,
    role_id,
    company_id,
    active,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_full_name,
    v_role_id,
    NULL,  -- SuperAdmin no pertenece a ninguna empresa
    true,
    NOW(),
    NOW()
  );

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'SUPER_ADMIN creado exitosamente!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Email: %', v_email;
  RAISE NOTICE 'Nombre: %', v_full_name;
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE 'Rol: SUPER_ADMIN';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Ahora puedes iniciar sesión con estas credenciales.';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creando SUPER_ADMIN: %', SQLERRM;
END $$;
