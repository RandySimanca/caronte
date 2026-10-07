-- ============================================================
-- MIGRATION 027: CREAR FUNCIÓN admin_create_user
-- Esta función permite que los administradores creen nuevos usuarios
-- en auth.users y en la tabla users de forma segura
-- NOTA: Para crear usuarios con contraseña, se debe usar Supabase Auth API
-- Esta función solo crea el registro en la tabla users, asumiendo que
-- el usuario ya existe en auth.users o será creado por otro medio
-- ============================================================

-- Crear la función admin_create_user
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
    RAISE EXCEPTION 'Solo administradores pueden crear usuarios';
  END IF;

  -- Verificar si el usuario ya existe en auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  -- Si el usuario no existe en auth.users y se proporcionó contraseña,
  -- intentamos crearlo usando el procedimiento auth.signup_email
  IF v_user_id IS NULL AND p_password IS NOT NULL THEN
    -- Crear usuario en auth.users sin contraseña encriptada directamente
    -- La contraseña se manejará por el sistema de auth de Supabase
    INSERT INTO auth.users (
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      p_email,
      crypt(p_password, gen_salt('bf')),
      NOW(),
      jsonb_build_object('full_name', p_full_name, 'phone', p_phone),
      NOW(),
      NOW()
    )
    RETURNING id INTO v_user_id;
  ELSIF v_user_id IS NULL THEN
    -- Si no hay contraseña, no podemos crear el usuario en auth.users
    RAISE EXCEPTION 'No se puede crear el usuario sin contraseña. Por favor use Supabase Auth API para crear el usuario primero.';
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

-- Dar permiso de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION admin_create_user(
  VARCHAR(150),
  VARCHAR(150),
  UUID,
  VARCHAR(255),
  VARCHAR(20)
) TO authenticated;
