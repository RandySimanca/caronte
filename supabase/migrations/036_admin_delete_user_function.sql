-- ============================================================
-- MIGRATION 036: FUNCIÓN PARA ADMINISTRADORES ELIMINAR USUARIOS
-- Permite a los ADMINISTRADORES eliminar usuarios físicamente
-- de su propia empresa (no solo desactivarlos)
-- ============================================================

-- ─── FUNCIÓN PARA ELIMINAR UN USUARIO (ADMINISTRADOR) ───────
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role VARCHAR(50);
  v_caller_company_id UUID;
  v_user_role VARCHAR(50);
  v_user_company_id UUID;
  v_loan_count INTEGER;
BEGIN
  -- Verificar que el usuario actual está autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  -- Obtener información del usuario que llama
  SELECT
    r.name,
    u.company_id
  INTO v_caller_role, v_caller_company_id
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no tiene perfil en la tabla users';
  END IF;

  -- Verificar que sea ADMINISTRADOR
  IF v_caller_role != 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar usuarios';
  END IF;

  -- Obtener información del usuario a eliminar
  SELECT
    r.name,
    u.company_id
  INTO v_user_role, v_user_company_id
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  -- Protección: no eliminar usuarios de otra empresa
  IF v_user_company_id != v_caller_company_id THEN
    RAISE EXCEPTION 'No puedes eliminar usuarios de otra empresa';
  END IF;

  -- Protección: no eliminar ADMINISTRADOR (solo SUPER_ADMIN puede hacerlo)
  IF v_user_role = 'ADMINISTRADOR' THEN
    RAISE EXCEPTION 'No puedes eliminar administradores. Solo el SUPER_ADMIN puede hacerlo.';
  END IF;

  -- Protección: no eliminar al propio usuario
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminar tu propio usuario';
  END IF;

  -- Verificar si el usuario tiene préstamos activos como cobrador
  SELECT COUNT(*) INTO v_loan_count
  FROM loans
  WHERE collector_id = p_user_id AND status = 'ACTIVO';

  IF v_loan_count > 0 THEN
    RAISE EXCEPTION 'El usuario tiene % préstamos activos asignados. Reasigne los préstamos antes de eliminar.', v_loan_count;
  END IF;

  -- Eliminar en una transacción
  -- Las FK se encargan de la cascada, pero eliminamos explícitamente para orden y control
  DELETE FROM route_assignments WHERE collector_id = p_user_id;
  DELETE FROM expenses WHERE collector_id = p_user_id;
  DELETE FROM payments WHERE collector_id = p_user_id;
  DELETE FROM daily_closings WHERE collector_id = p_user_id;
  DELETE FROM audit_logs WHERE user_id = p_user_id;
  DELETE FROM sync_operations WHERE user_id = p_user_id;
  DELETE FROM devices WHERE user_id = p_user_id;

  -- Eliminar de public.users (esto NO elimina de auth.users automáticamente)
  DELETE FROM users WHERE id = p_user_id;

  -- Eliminar de auth.users (requiere acceso a auth schema)
  -- Usamos auth.admin.delete_user si está disponible
  PERFORM auth.admin.delete_user(p_user_id);

  RETURN 'Usuario eliminado exitosamente';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al eliminar usuario: %', SQLERRM;
END;
$$;

-- ─── PERMISOS ───────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION admin_delete_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;
