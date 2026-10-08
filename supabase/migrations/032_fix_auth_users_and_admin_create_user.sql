-- ============================================================
-- MIGRATION 032: CORREGIR AUTH.USERS Y ADMIN_CREATE_USER
-- Soluciona el error 500 "Database error querying schema" al iniciar
-- sesión con cuentas creadas desde el panel SaaS.
-- ============================================================

-- 1. Actualizar registros incompletos en auth.users
UPDATE auth.users
SET 
  instance_id = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
  aud = COALESCE(NULLIF(aud, ''), 'authenticated'),
  role = COALESCE(NULLIF(role, ''), 'authenticated'),
  raw_app_meta_data = CASE 
    WHEN raw_app_meta_data IS NULL OR raw_app_meta_data = '{}'::jsonb 
    THEN '{"provider": "email", "providers": ["email"]}'::jsonb 
    ELSE raw_app_meta_data 
  END,
  is_super_admin = COALESCE(is_super_admin, false)
WHERE aud IS NULL OR aud = '' OR role IS NULL OR role = '' OR raw_app_meta_data IS NULL OR raw_app_meta_data = '{}'::jsonb OR instance_id IS NULL;

-- 2. Crear las identidades faltantes en auth.identities requeridas por Supabase GoTrue Auth
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
SELECT 
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  NOW(),
  NOW(),
  NOW(),
  u.email
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
);

-- 3. Actualizar la función admin_create_user para incluir todos los campos obligatorios de auth.users y auth.identities
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email VARCHAR(150),
  p_full_name VARCHAR(150),
  p_role_id UUID,
  p_password VARCHAR(255) DEFAULT NULL,
  p_phone VARCHAR(20) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role_name TEXT;
BEGIN
  -- Verificar que el usuario actual es ADMINISTRADOR o SUPER_ADMIN
  SELECT r.name INTO v_role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = auth.uid();

  IF v_role_name NOT IN ('ADMINISTRADOR', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'Permisos insuficientes: Solo un administrador o super administrador puede crear usuarios.';
  END IF;

  -- Verificar si el usuario ya existe en auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  -- Si el usuario no existe y se proporcionó contraseña, crearlo con la estructura completa de Supabase Auth
  IF v_user_id IS NULL AND p_password IS NOT NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
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
      p_email,
      crypt(p_password, gen_salt('bf')),
      NOW(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'phone', p_phone),
      false,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_user_id;

    -- Crear el registro en auth.identities requerido por Supabase GoTrue Auth
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
      jsonb_build_object('sub', v_user_id::text, 'email', p_email),
      'email',
      NOW(),
      NOW(),
      NOW(),
      p_email
    );
  ELSIF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No se puede crear el usuario sin contraseña. Por favor proporcione una contraseña.';
  END IF;

  -- Crear o actualizar el registro en la tabla users
  INSERT INTO users (
    id,
    full_name,
    phone,
    role_id,
    active,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_full_name,
    p_phone,
    p_role_id,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = p_full_name,
    phone = p_phone,
    role_id = p_role_id,
    active = true,
    updated_at = NOW();

  RETURN v_user_id;
END;
$$;

-- Otorgar permiso de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION admin_create_user(
  VARCHAR(150),
  VARCHAR(150),
  UUID,
  VARCHAR(255),
  VARCHAR(20)
) TO authenticated;
