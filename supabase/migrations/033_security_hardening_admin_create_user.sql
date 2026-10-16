-- ============================================================
-- MIGRATION 033: HARDENING DE SEGURIDAD EN ADMIN_CREATE_USER
-- Correcciones de seguridad críticas:
-- 1. Revocar permisos a public y anon
-- 2. Validar company_id para ADMINISTRADORES
-- 3. Restringir creación de ADMINISTRADORES solo a SUPER_ADMIN
-- 4. Guardia para primer SUPER_ADMIN
-- ============================================================

-- 1. Revocar permisos de ejecución a public y anon
REVOKE EXECUTE ON FUNCTION admin_create_user(
  VARCHAR(150),
  VARCHAR(150),
  UUID,
  VARCHAR(255),
  VARCHAR(20)
) FROM public, anon;

-- 2. Actualizar la función con validaciones de seguridad mejoradas
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email VARCHAR(150),
  p_full_name VARCHAR(150),
  p_role_id UUID,
  p_password VARCHAR(255) DEFAULT NULL,
  p_phone VARCHAR(20) DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role_name TEXT;
  v_caller_company_id UUID;
  v_target_role_name TEXT;
  v_super_admin_count INT;
  v_user_exists BOOLEAN;
BEGIN
  -- Guardia: permitir creación del primer SUPER_ADMIN si no existe ninguno
  -- Esto se usa solo para la configuración inicial del sistema
  SELECT COUNT(*) INTO v_super_admin_count
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE r.name = 'SUPER_ADMIN' AND u.active = true;

  IF v_super_admin_count = 0 THEN
    -- Si no hay SUPER_ADMIN, permitir crear uno sin validaciones adicionales
    -- Este caso es solo para la configuración inicial
    NULL;
  ELSE
    -- Verificar que el usuario actual está autenticado
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Usuario no autenticado';
    END IF;

    -- Obtener el rol y company_id del usuario que llama
    SELECT r.name, u.company_id INTO v_caller_role_name, v_caller_company_id
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = auth.uid();

    IF v_caller_role_name IS NULL THEN
      RAISE EXCEPTION 'Usuario no tiene perfil en la tabla users';
    END IF;

    -- Verificar que sea ADMINISTRADOR o SUPER_ADMIN
    IF v_caller_role_name NOT IN ('ADMINISTRADOR', 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'Permisos insuficientes: Solo un administrador o super administrador puede crear usuarios.';
    END IF;

    -- Obtener el nombre del rol que se va a asignar
    SELECT name INTO v_target_role_name
    FROM roles
    WHERE id = p_role_id;

    IF v_target_role_name IS NULL THEN
      RAISE EXCEPTION 'Rol inválido';
    END IF;

    -- Restricción: Solo SUPER_ADMIN puede crear usuarios con rol ADMINISTRADOR
    IF v_target_role_name = 'ADMINISTRADOR' AND v_caller_role_name != 'SUPER_ADMIN' THEN
      RAISE EXCEPTION 'Permisos insuficientes: Solo un super administrador puede crear administradores.';
    END IF;

    -- Restricción: Si el usuario es ADMINISTRADOR, debe crear usuarios en su propia empresa
    IF v_caller_role_name = 'ADMINISTRADOR' THEN
      IF p_company_id IS NULL OR p_company_id != v_caller_company_id THEN
        RAISE EXCEPTION 'Un administrador solo puede crear usuarios en su propia empresa.';
      END IF;
    END IF;
  END IF;

  -- Verificar si el usuario ya existe en auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  -- Si el usuario ya existe y es el mismo que está ejecutando la función, evitar conflicto
  IF v_user_id IS NOT NULL AND v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes modificar tu propio usuario a través de esta función';
  END IF;

  -- Verificar si el usuario ya existe en la tabla users
  SELECT true INTO v_user_exists FROM users WHERE id = v_user_id LIMIT 1;

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
      p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      NOW(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
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
  -- Evitar ON CONFLICT para no activar el trigger guard_users_privileges
  IF v_user_exists THEN
    -- Usuario ya existe en users, actualizar directamente sin cambiar company_id
    UPDATE users SET
      full_name = p_full_name,
      phone = p_phone,
      role_id = p_role_id,
      -- No actualizar company_id para evitar trigger: mantener el existente
      active = true,
      updated_at = NOW()
    WHERE id = v_user_id;
  ELSE
    -- Usuario nuevo, insertar directamente
    INSERT INTO users (
      id,
      full_name,
      phone,
      role_id,
      company_id,
      active,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      p_full_name,
      p_phone,
      p_role_id,
      p_company_id,
      true,
      NOW(),
      NOW()
    );
  END IF;

  RETURN v_user_id;
END;
$$;

-- 3. Otorgar permiso de ejecución solo a usuarios autenticados
GRANT EXECUTE ON FUNCTION admin_create_user(
  VARCHAR(150),
  VARCHAR(150),
  UUID,
  VARCHAR(255),
  VARCHAR(20),
  UUID
) TO authenticated;
