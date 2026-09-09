-- ============================================================
-- MIGRATION 010: SOPORTE OFFLINE PARA ASIGNACION DE BOLETAS
-- ============================================================

-- Modificamos el trigger para que NO sobreescriba el número
-- de boleta si el cliente (desde la app offline) ya le asignó uno.

CREATE OR REPLACE FUNCTION assign_raffle_number_trg()
RETURNS TRIGGER AS $$
DECLARE
  v_mode VARCHAR;
  v_num VARCHAR(3);
BEGIN
  -- Get system mode
  SELECT value#>>'{}' INTO v_mode FROM system_settings WHERE key = 'lottery_mode';
  IF v_mode IS NULL THEN
     v_mode := 'OPCIONAL';
  END IF;

  IF v_mode = 'OBLIGATORIA' OR NEW.wants_raffle = true THEN
    
    -- ¡NUEVO! Soporte Offline-first:
    -- Si la PWA ya generó y asignó un número localmente para mostrárselo al cliente de inmediato,
    -- lo conservamos en lugar de generar uno nuevo en el servidor.
    IF NEW.raffle_number IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- Try to find an available number from 000 to 999 that is not currently active
    SELECT TO_CHAR(num, 'FM000') INTO v_num
    FROM generate_series(0, 999) AS num
    WHERE TO_CHAR(num, 'FM000') NOT IN (
      SELECT raffle_number FROM loans WHERE status = 'ACTIVO' AND raffle_number IS NOT NULL
    )
    ORDER BY random()
    LIMIT 1;

    -- If all 1000 numbers are taken, fallback to completely random
    IF v_num IS NULL THEN
      v_num := TO_CHAR(floor(random() * 1000)::int, 'FM000');
    END IF;

    NEW.raffle_number := v_num;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
