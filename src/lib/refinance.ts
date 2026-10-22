/**
 * Refinanciación: el cliente debía 300.000 y le prestan 500.000 → se entregan 200.000 en efectivo,
 * el préstamo nuevo queda por 500.000 y los 300.000 cuentan como dinero recogido.
 *
 *   amount_delivered   = efectivo entregado (200.000)
 *   refinanced_balance = saldo anterior recogido (300.000)
 *   valor del préstamo = amount_delivered + refinanced_balance (500.000)
 *
 * Es como si el cliente pagara 300.000 en efectivo y pidiera 500.000 nuevos: el recaudo suma
 * lo recogido y "Préstamos nuevos" muestra el valor completo. El efectivo a entregar no cambia.
 */
type LoanLike = { amount_delivered?: number | null; refinanced_balance?: number | null };

/** Saldo recogido en la refinanciación (0 si el préstamo no es una refinanciación) */
export function refinancedBalanceOf(l: LoanLike): number {
  return Number(l.refinanced_balance || 0);
}

/** Valor del préstamo nuevo: efectivo entregado + saldo anterior recogido */
export function loanValueOf(l: LoanLike): number {
  return Number(l.amount_delivered || 0) + refinancedBalanceOf(l);
}

/** Total recogido por refinanciaciones en una lista de préstamos nuevos */
export function sumRefinancedBalance(loans: LoanLike[]): number {
  return loans.reduce((s, l) => s + refinancedBalanceOf(l), 0);
}
