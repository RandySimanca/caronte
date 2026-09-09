-- ============================================================
-- MIGRATION 009: JUEGO DE BOLETAS (LOTERÍA)
-- ============================================================

-- 1. Modificar tabla loans
ALTER TABLE loans ADD COLUMN wants_raffle BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE loans ADD COLUMN raffle_number VARCHAR(3);

COMMENT ON COLUMN loans.wants_raffle IS 'Indica si el cliente quiso participar en la boleta (relevante si el modo es OPCIONAL)';
COMMENT ON COLUMN loans.raffle_number IS 'Número asignado para el sorteo de boletas (000 a 999)';

-- 2. Configuración del sistema
INSERT INTO system_settings (key, value, description)
VALUES ('lottery_mode', '"OPCIONAL"', 'Modo del juego de boletas: OBLIGATORIA o OPCIONAL')
ON CONFLICT (key) DO NOTHING;

-- 3. Trigger para asignar número automáticamente
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

CREATE TRIGGER trg_assign_raffle
BEFORE INSERT ON loans
FOR EACH ROW EXECUTE FUNCTION assign_raffle_number_trg();


-- 4. Tablas de Sorteos (Draws)
CREATE TABLE lottery_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winning_number VARCHAR(3) NOT NULL,
  draw_date DATE NOT NULL,
  processed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lottery_draws IS 'Historial de sorteos realizados por el administrador';

CREATE TABLE lottery_winners (
  draw_id UUID REFERENCES lottery_draws(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES loans(id),
  prize_amount NUMERIC(15,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (draw_id, loan_id)
);

COMMENT ON TABLE lottery_winners IS 'Clientes ganadores en cada sorteo';

-- 5. RPC para procesar sorteo
CREATE OR REPLACE FUNCTION process_lottery_draw(p_winning_number VARCHAR(3), p_admin_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_draw_id UUID;
  v_loan RECORD;
  v_winner_count INT := 0;
  v_total_prize NUMERIC := 0;
  v_payment_id UUID;
BEGIN
  -- Crear el sorteo
  INSERT INTO lottery_draws (winning_number, draw_date, processed_by)
  VALUES (p_winning_number, CURRENT_DATE, p_admin_id)
  RETURNING id INTO v_draw_id;

  -- Buscar ganadores (Préstamos activos con ese número)
  FOR v_loan IN 
    SELECT * FROM loans WHERE status = 'ACTIVO' AND raffle_number = p_winning_number
  LOOP
    v_winner_count := v_winner_count + 1;
    v_total_prize := v_total_prize + v_loan.current_balance;

    -- 1. Insertar el ganador
    INSERT INTO lottery_winners (draw_id, loan_id, prize_amount)
    VALUES (v_draw_id, v_loan.id, v_loan.current_balance);

    -- 2. Crear un pago por el valor del current_balance
    INSERT INTO payments (
      operation_id, device_id, loan_id, collector_id, route_id, total_amount, 
      day_installment_amount, auto_observation, sync_status, collected_at, created_by
    )
    VALUES (
      gen_random_uuid()::varchar, 'SERVER_LOTTERY', v_loan.id, p_admin_id, v_loan.route_id, v_loan.current_balance,
      v_loan.current_balance, 'Premio Lotería (Boleta ganadora)', 'synced', NOW(), p_admin_id
    ) RETURNING id INTO v_payment_id;

    -- 3. Edge Functions or Database trigger should update current_balance, but we will explicitly set it to 0
    -- and change status to PAGADO for safety in this RPC
    UPDATE loans 
    SET current_balance = 0, status = 'PAGADO'
    WHERE id = v_loan.id;

    -- 4. Mark pending installments as paid
    UPDATE loan_installments
    SET status = 'PAGADA', paid_amount = scheduled_amount, paid_date = CURRENT_DATE
    WHERE loan_id = v_loan.id AND status IN ('PENDIENTE', 'PARCIAL', 'ATRASADA');

  END LOOP;

  RETURN jsonb_build_object(
    'draw_id', v_draw_id,
    'winners_count', v_winner_count,
    'total_prize', v_total_prize
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
