-- ============================================================
-- MIGRATION 029: FUNCIÓN DE AGREGACIÓN PARA SUPER_ADMIN
-- Evita que SuperAdminService descargue colecciones completas truncadas
-- ============================================================

-- Función superadmin_company_stats: devuelve métricas por empresa y totales globales
DROP FUNCTION IF EXISTS superadmin_company_stats();

CREATE FUNCTION superadmin_company_stats()
RETURNS TABLE (
  company_id uuid,
  company_name varchar(150),
  collectors_count bigint,
  routes_count bigint,
  clients_count bigint,
  loans_count bigint,
  active_portfolio numeric,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validar que el usuario es SUPER_ADMIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo el SUPER_ADMIN puede ver estadísticas globales';
  END IF;

  RETURN QUERY
  SELECT
    c.id as company_id,
    c.name as company_name,
    (
      SELECT COUNT(*)
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.company_id = c.id AND r.name = 'COBRADOR'
    ) as collectors_count,
    (
      SELECT COUNT(*)
      FROM routes r
      WHERE r.company_id = c.id
    ) as routes_count,
    (
      SELECT COUNT(*)
      FROM clients cl
      JOIN routes r ON cl.route_id = r.id
      WHERE r.company_id = c.id
    ) as clients_count,
    (
      SELECT COUNT(*)
      FROM loans l
      JOIN routes r ON l.route_id = r.id
      WHERE r.company_id = c.id AND l.status = 'ACTIVO'
    ) as loans_count,
    COALESCE((
      SELECT SUM(l.current_balance)
      FROM loans l
      JOIN routes r ON l.route_id = r.id
      WHERE r.company_id = c.id AND l.status = 'ACTIVO'
    ), 0) as active_portfolio,
    c.status = 'ACTIVE' AND (c.subscription_expires_at IS NULL OR c.subscription_expires_at > NOW()) as is_active
  FROM companies c
  ORDER BY c.created_at DESC;
END;
$$;

-- Solo SUPER_ADMIN puede ejecutar esta función (validado dentro de la función)
REVOKE EXECUTE ON FUNCTION superadmin_company_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION superadmin_company_stats() TO authenticated;

-- Crear una vista para facilitar el acceso desde el cliente (solo SUPER_ADMIN)
-- La seguridad está garantizada por la validación is_super_admin() dentro de la función
CREATE OR REPLACE VIEW superadmin_metrics_view AS
SELECT * FROM superadmin_company_stats();

-- Función auxiliar para sumar pagos por rango de fechas (evita truncamiento)
DROP FUNCTION IF EXISTS sum_total_collected_today(timestamptz, timestamptz);

CREATE FUNCTION sum_total_collected_today(p_start_date timestamptz, p_end_date timestamptz)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validar que el usuario es SUPER_ADMIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo el SUPER_ADMIN puede ver estadísticas globales';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(total_amount), 0)
    FROM payments
    WHERE collected_at >= p_start_date AND collected_at <= p_end_date
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION sum_total_collected_today(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sum_total_collected_today(timestamptz, timestamptz) TO authenticated;
