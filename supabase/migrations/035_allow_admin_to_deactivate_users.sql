-- ============================================================
-- MIGRATION 035: PERMITIR A ADMINISTRADORES DESACTIVAR USUARIOS
-- Corrige el error "Database error deleting user" al intentar eliminar usuarios
-- Modifica el trigger guard_users_privileges para permitir cambios en el campo active
-- ============================================================

-- Modificar el trigger guard_users_privileges para permitir actualizar el campo active
CREATE OR REPLACE FUNCTION guard_users_privileges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_super_role    uuid;
  v_cobrador_role uuid;
  v_max           int;
  v_count         int;
BEGIN
  -- service_role / SQL Editor / migraciones (sin usuario autenticado)
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_super_admin() THEN RETURN NEW; END IF;

  SELECT id INTO v_super_role FROM roles WHERE name = 'SUPER_ADMIN';
  IF NEW.role_id = v_super_role THEN
    RAISE EXCEPTION 'No tienes permiso para asignar el rol SUPER_ADMIN';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Permitir cambiar company_id de NULL a un valor (para admin_create_user)
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      IF OLD.company_id IS NOT NULL THEN
        RAISE EXCEPTION 'No se puede cambiar la empresa de un usuario';
      END IF;
    END IF;
    IF NEW.id = auth.uid() AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
      RAISE EXCEPTION 'No puedes cambiar tu propio rol';
    END IF;
    -- Permitir actualizar el campo active (para desactivar usuarios)
    -- Solo otros campos sensibles están restringidos
  ELSE
    -- INSERT: el admin solo crea usuarios en su propia empresa
    NEW.company_id := get_user_company_id();

    IF NOT company_is_active() THEN
      RAISE EXCEPTION 'La empresa está suspendida o vencida';
    END IF;

    SELECT id INTO v_cobrador_role FROM roles WHERE name = 'COBRADOR';
    IF NEW.role_id = v_cobrador_role THEN
      SELECT max_collectors INTO v_max FROM companies WHERE id = NEW.company_id;
      SELECT COUNT(*) INTO v_count
      FROM users
      WHERE company_id = NEW.company_id AND role_id = v_cobrador_role;

      IF v_count >= v_max THEN
        RAISE EXCEPTION 'Límite de cobradores del plan alcanzado (% de %)', v_count, v_max;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
