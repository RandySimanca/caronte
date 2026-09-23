/** Redondeo a 6 decimales, igual que NUMERIC(15,6) en PostgreSQL. */
export function round6(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6;
}

export function loanFinancials(amountRequested: number, interestRate: number, termDays: number, sundays: number, receiptFee: number) {
  const amount = round6(amountRequested);
  const rate = round6(interestRate);
  const interest_amount = round6(amount * rate);
  const initial_obligation = round6(amount + interest_amount);
  const daily_installment = termDays > 0 ? round6(initial_obligation / termDays) : 0;
  const sundays_prepaid_amount = round6(sundays * daily_installment);
  const amount_delivered = round6(amount - sundays_prepaid_amount - receiptFee);
  const current_balance = round6(initial_obligation - sundays_prepaid_amount);
  return {
    amount_requested: amount,
    interest_rate: rate,
    interest_amount,
    initial_obligation,
    daily_installment,
    sundays_prepaid_amount,
    amount_delivered,
    current_balance,
  };
}
