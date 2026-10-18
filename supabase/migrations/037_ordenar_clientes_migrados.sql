-- ============================================================
-- 037: Ordenar clientes YA migrados que quedaron todos con route_order = 0
-- Los numera 0..N según el orden en que se importaron (created_at), que normalmente
-- coincide con el orden de las filas del Excel.
-- Solo actúa si NINGÚN cliente de la ruta tiene orden personalizado (para no pisar trabajo manual).
-- USO: reemplaza el UUID de la ruta y ejecútalo en el SQL Editor de Supabase.
-- ============================================================
DO $$
DECLARE
  v_route uuid := '00000000-0000-0000-0000-000000000000';  -- <-- ID de la ruta
BEGIN
  IF EXISTS (SELECT 1 FROM clients WHERE route_id = v_route AND route_order > 0) THEN
    RAISE NOTICE 'La ruta ya tiene orden personalizado; no se modificó nada.';
    RETURN;
  END IF;

  WITH ranked AS (
    SELECT id, (row_number() OVER (ORDER BY created_at, id) - 1)::int AS rn
    FROM clients
    WHERE route_id = v_route
  )
  UPDATE clients c
  SET route_order = r.rn
  FROM ranked r
  WHERE c.id = r.id;
END $$;
