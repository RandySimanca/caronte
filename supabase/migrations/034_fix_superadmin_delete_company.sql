-- ============================================================
-- MIGRATION 034: CORREGIR ORDEN DE ELIMINACIÓN EN SUPERADMIN_DELETE_COMPANY
-- Soluciona el error de foreign key constraint al eliminar empresas
-- ============================================================

CREATE OR REPLACE FUNCTION superadmin_delete_company(p_company_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_name VARCHAR(200);
  v_user_count INTEGER;
  v_loan_count INTEGER;
  v_loan_active_count INTEGER;
BEGIN
  -- Verificar que el invocador es SUPER_ADMIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo el SUPER_ADMIN puede eliminar empresas';
  END IF;

  -- Obtener información de la empresa
  SELECT name INTO v_company_name
  FROM companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  -- Contar usuarios y préstamos para advertencia
  SELECT COUNT(*) INTO v_user_count
  FROM users
  WHERE company_id = p_company_id;

  SELECT COUNT(*) INTO v_loan_count
  FROM loans l
  JOIN routes r ON l.route_id = r.id
  WHERE r.company_id = p_company_id;

  SELECT COUNT(*) INTO v_loan_active_count
  FROM loans l
  JOIN routes r ON l.route_id = r.id
  WHERE r.company_id = p_company_id AND l.status = 'ACTIVO';

  -- Advertencia si hay préstamos activos
  IF v_loan_active_count > 0 THEN
    RAISE NOTICE 'ADVERTENCIA: La empresa tiene % préstamos activos. Se eliminarán todos los datos permanentemente.', v_loan_active_count;
  END IF;

  -- Eliminar en orden de dependencia (cascada inversa)
  -- 1. Primero eliminar datos operativos
  DELETE FROM payment_allocations pa
  WHERE EXISTS (
    SELECT 1 FROM payments p
    JOIN loans l ON p.loan_id = l.id
    JOIN routes r ON l.route_id = r.id
    WHERE r.company_id = p_company_id AND p.id = pa.payment_id
  );

  DELETE FROM payments p
  WHERE EXISTS (
    SELECT 1 FROM loans l
    JOIN routes r ON l.route_id = r.id
    WHERE r.company_id = p_company_id AND l.id = p.loan_id
  );

  DELETE FROM loan_installments li
  WHERE EXISTS (
    SELECT 1 FROM loans l
    JOIN routes r ON l.route_id = r.id
    WHERE r.company_id = p_company_id AND l.id = li.loan_id
  );

  DELETE FROM loans l
  WHERE EXISTS (
    SELECT 1 FROM routes r
    WHERE r.company_id = p_company_id AND l.route_id = r.id
  );

  DELETE FROM refinancing ref
  WHERE EXISTS (
    SELECT 1 FROM loans l
    JOIN routes r ON l.route_id = r.id
    WHERE r.company_id = p_company_id AND (l.id = ref.original_loan_id OR l.id = ref.new_loan_id)
  );

  -- 2. Eliminar clientes
  DELETE FROM clients c
  WHERE EXISTS (
    SELECT 1 FROM routes r
    WHERE r.company_id = p_company_id AND r.id = c.route_id
  );

  -- 3. Eliminar gastos y cierres diarios
  DELETE FROM daily_closings dc
  WHERE EXISTS (
    SELECT 1 FROM routes r
    WHERE r.company_id = p_company_id AND r.id = dc.route_id
  );

  DELETE FROM expenses e
  WHERE EXISTS (
    SELECT 1 FROM routes r
    WHERE r.company_id = p_company_id AND r.id = e.route_id
  );

  -- 4. Eliminar asignaciones de rutas
  -- Primero eliminar asignaciones donde assigned_by es un usuario de la empresa
  DELETE FROM route_assignments ra
  WHERE EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = p_company_id AND u.id = ra.assigned_by
  );

  -- Luego eliminar asignaciones por ruta
  DELETE FROM route_assignments ra
  WHERE EXISTS (
    SELECT 1 FROM routes r
    WHERE r.company_id = p_company_id AND r.id = ra.route_id
  );

  -- 5. Eliminar rutas
  DELETE FROM routes WHERE company_id = p_company_id;

  -- 6. Eliminar configuraciones de la empresa
  DELETE FROM system_settings WHERE company_id = p_company_id;
  DELETE FROM expense_categories WHERE company_id = p_company_id;
  DELETE FROM holidays WHERE company_id = p_company_id;

  -- 7. Eliminar usuarios (con sus registros en auth.users)
  -- Primero eliminamos de tablas relacionadas
  DELETE FROM audit_logs al
  WHERE EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = p_company_id AND u.id = al.user_id
  );

  DELETE FROM sync_operations so
  WHERE EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = p_company_id AND u.id = so.user_id
  );

  DELETE FROM devices d
  WHERE EXISTS (
    SELECT 1 FROM users u
    WHERE u.company_id = p_company_id AND u.id = d.user_id
  );

  -- Obtener IDs de usuarios para eliminar de auth.users
  DECLARE
    user_ids UUID[];
  BEGIN
    SELECT ARRAY_AGG(id) INTO user_ids
    FROM users
    WHERE company_id = p_company_id;

    -- Eliminar de public.users
    DELETE FROM users WHERE company_id = p_company_id;

    -- Eliminar de auth.users para cada usuario
    IF user_ids IS NOT NULL THEN
      FOR i IN 1..array_length(user_ids, 1) LOOP
        PERFORM auth.admin.delete_user(user_ids[i]);
      END LOOP;
    END IF;
  END;

  -- 8. Finalmente eliminar la empresa
  DELETE FROM companies WHERE id = p_company_id;

  RETURN format('Empresa "%s" eliminada exitosamente. %s usuarios, %s préstamos eliminados.',
    v_company_name, v_user_count, v_loan_count);
END;
$$;
