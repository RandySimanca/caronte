-- ============================================================
-- MIGRATION 016: Fix process_lottery_draw loan_status
-- El enum loan_status no incluye 'PAGADO'. Al saldar un préstamo
-- por boleta ganadora debe usarse 'CANCELADO' (mismo criterio
-- que AdminService al liquidar saldo).
-- ============================================================

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

    -- 2. Crear un pago por el valor del current_balance (solo si hay saldo)
    IF v_loan.current_balance > 0 THEN
      INSERT INTO payments (
        operation_id, device_id, loan_id, collector_id, route_id, total_amount, 
        day_installment_amount, auto_observation, sync_status, collected_at, created_by
      )
      VALUES (
        gen_random_uuid()::varchar, 'SERVER_LOTTERY', v_loan.id, p_admin_id, v_loan.route_id, v_loan.current_balance,
        v_loan.current_balance, 'Premio Lotería (Boleta ganadora)', 'synced', NOW(), p_admin_id
      ) RETURNING id INTO v_payment_id;
    END IF;

    -- 3. Saldar préstamo: balance 0 y estado CANCELADO (valor válido del enum loan_status)
    UPDATE loans 
    SET current_balance = 0, status = 'CANCELADO'
    WHERE id = v_loan.id;

    -- 4. Mark pending installments as paid (balance debe quedar 0 por chk_balance)
    UPDATE loan_installments
    SET status = 'PAGADA',
        paid_amount = scheduled_amount,
        balance = 0,
        paid_date = CURRENT_DATE
    WHERE loan_id = v_loan.id AND status IN ('PENDIENTE', 'PARCIAL', 'ATRASADA');

  END LOOP;

  RETURN jsonb_build_object(
    'draw_id', v_draw_id,
    'winners_count', v_winner_count,
    'total_prize', v_total_prize
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
