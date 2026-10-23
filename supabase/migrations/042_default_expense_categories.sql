-- ============================================================
-- MIGRATION 042: CATEGORÍAS DE GASTO POR DEFECTO + RPC register_expense
-- Problema: una empresa sin categorías hacía fallar el envío de gastos del cobrador
-- (invalid input syntax for type uuid: "combustible").
-- 1) Toda empresa (existente y nueva) tiene categorías base, incluida "Otros".
-- 2) register_expense: el servidor resuelve la categoría y nunca rechaza un gasto por eso.
-- ============================================================

-- ─── 1. Categorías base ──────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_default_expense_categories(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO expense_categories (company_id, name, description, active, is_system) VALUES
    (p_company_id, 'Combustible', 'Combustible para el vehículo de la ruta',   true, true),
    (p_company_id, 'Aceite',      'Aceite del vehículo',                        true, true),
    (p_company_id, 'Reparación',  'Reparaciones del vehículo',                  true, true),
    (p_company_id, 'Llantas',     'Cambio o reparación de llantas',             true, true),
    (p_company_id, 'Cadena',      'Cadena del vehículo',                        true, true),
    (p_company_id, 'Repuestos',   'Repuestos varios del vehículo',              true, true),
    (p_company_id, 'Viáticos',    'Alimentación y gastos de desplazamiento',    true, true),
    (p_company_id, 'Otros',       'Otros gastos (el cobrador escribe cuál es)', true, true)
  ON CONFLICT (company_id, name) DO NOTHING;

  -- "Otros" siempre debe existir y estar activa (es el comodín)
  UPDATE expense_categories SET active = true
  WHERE company_id = p_company_id AND name = 'Otros';
END;
$$;

REVOKE EXECUTE ON FUNCTION seed_default_expense_categories(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION seed_default_expense_categories(uuid) TO service_role;

-- Las empresas nuevas reciben las categorías base (sin depender de la empresa plantilla)
CREATE OR REPLACE FUNCTION trg_company_seed_expense_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM seed_default_expense_categories(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_seed_expense_categories ON companies;
CREATE TRIGGER trg_companies_seed_expense_categories
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_company_seed_expense_categories();

-- Empresas que ya existen y no tienen categorías (o les falta "Otros")
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    PERFORM seed_default_expense_categories(c.id);
  END LOOP;
END $$;

-- ─── 2. RPC: registrar gasto del cobrador (idempotente por operation_id) ─────
CREATE OR REPLACE FUNCTION register_expense(
  p_operation_id  text,
  p_route_id      uuid,
  p_expense_date  date,
  p_category_id   text,
  p_category_name text,
  p_amount        numeric,
  p_description   text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company  uuid;
  v_route    uuid;
  v_cat      uuid;
  v_id       uuid;
  v_desc     text := COALESCE(NULLIF(btrim(p_description), ''), 'Gasto');
  v_name     text := NULLIF(btrim(COALESCE(p_category_name, '')), '');
BEGIN
  IF get_user_role() IS DISTINCT FROM 'COBRADOR' THEN
    RAISE EXCEPTION 'Solo un cobrador puede registrar gastos';
  END IF;
  IF NOT company_is_active() THEN
    RAISE EXCEPTION 'La empresa no está activa';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El valor del gasto debe ser mayor a cero';
  END IF;

  v_company := get_user_company_id();

  -- Idempotencia: si el gasto ya llegó, devolver el existente
  SELECT id INTO v_id FROM expenses WHERE operation_id = p_operation_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Ruta: la enviada si es del cobrador; si no, su primera ruta activa
  IF p_route_id IS NOT NULL AND p_route_id = ANY(get_collector_route_ids()) THEN
    v_route := p_route_id;
  ELSE
    v_route := (get_collector_route_ids())[1];
  END IF;
  IF v_route IS NULL THEN
    RAISE EXCEPTION 'El cobrador no tiene una ruta asignada';
  END IF;

  -- Categoría: 1) id válido de la empresa, 2) por nombre, 3) "Otros"
  IF p_category_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_cat FROM expense_categories
    WHERE id = p_category_id::uuid AND company_id = v_company;
  END IF;

  IF v_cat IS NULL AND v_name IS NOT NULL THEN
    SELECT id INTO v_cat FROM expense_categories
    WHERE company_id = v_company AND lower(name) = lower(v_name)
    LIMIT 1;
  END IF;

  IF v_cat IS NULL THEN
    PERFORM seed_default_expense_categories(v_company);
    SELECT id INTO v_cat FROM expense_categories
    WHERE company_id = v_company AND name = 'Otros';
    -- Conservar el nombre original que eligió el cobrador
    IF v_name IS NOT NULL AND lower(v_name) NOT LIKE 'otr%' THEN
      v_desc := v_name || ': ' || v_desc;
    END IF;
  END IF;

  INSERT INTO expenses (
    operation_id, collector_id, route_id, expense_date,
    category_id, amount, description, sync_status
  ) VALUES (
    p_operation_id, auth.uid(), v_route, p_expense_date,
    v_cat, p_amount, v_desc, 'synced'
  )
  ON CONFLICT (operation_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM expenses WHERE operation_id = p_operation_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION register_expense(text, uuid, date, text, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION register_expense(text, uuid, date, text, text, numeric, text) TO authenticated;

-- La copia de configuración de una empresa nueva (create-company) también garantiza las categorías base
CREATE OR REPLACE FUNCTION seed_company_defaults(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO system_settings (company_id, key, value, description, updated_at)
  SELECT p_company_id, key, value, description, NOW()
  FROM system_settings
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, key) DO NOTHING;

  INSERT INTO expense_categories (company_id, name, description, active, is_system)
  SELECT p_company_id, name, description, active, is_system
  FROM expense_categories
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, name) DO NOTHING;

  PERFORM seed_default_expense_categories(p_company_id);

  INSERT INTO holidays (company_id, holiday_date, name, country_code, active)
  SELECT p_company_id, holiday_date, name, country_code, active
  FROM holidays
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
  ON CONFLICT (company_id, holiday_date) DO NOTHING;
END;
$$;
