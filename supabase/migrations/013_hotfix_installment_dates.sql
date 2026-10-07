-- ─── HOTFIX: Corregir cuotas que iniciaron el mismo día del desembolso ──────
-- Problema: las cuotas se generaban con new Date(dateString) que interpreta
-- la fecha ISO como UTC, causando que en UTC-5 la primera cuota caiga el
-- mismo día del desembolso en vez del día siguiente.
--
-- Este script desplaza +1 día TODAS las cuotas de préstamos donde la primera
-- cuota coincide con el disbursement_date, sin importar si ya fueron pagadas.

UPDATE loan_installments AS li
SET scheduled_date = li.scheduled_date + INTERVAL '1 day'
WHERE li.loan_id IN (
  -- Préstamos donde la cuota #1 cae el mismo día del desembolso
  SELECT DISTINCT l.id
  FROM loans l
  JOIN loan_installments inst
    ON inst.loan_id = l.id
    AND inst.installment_number = 1
    AND inst.scheduled_date = l.disbursement_date
)
AND li.status IN ('PENDIENTE', 'ATRASADA', 'PARCIAL');
-- Solo mover cuotas no cobradas. Las PAGADA / PAGADA_ANTICIPADAMENTE
-- ya tienen su fecha de cobro registrada y no deben moverse.

-- Verificación: muestra cuántas filas se actualizaron (ejecutar antes para ver)
-- SELECT COUNT(*) FROM loan_installments li
-- JOIN loans l ON l.id = li.loan_id
-- JOIN loan_installments first_inst ON first_inst.loan_id = l.id AND first_inst.installment_number = 1
-- WHERE first_inst.scheduled_date = l.disbursement_date
-- AND li.status IN ('PENDIENTE', 'ATRASADA', 'PARCIAL');
