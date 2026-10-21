/**
 * Préstamos que el cliente terminó HOY: pagó todo el saldo (CANCELADO) o lo refinanció
 * (el préstamo anterior queda REFINANCIADO y el cliente abre uno nuevo).
 *
 * Cuando un cobro deja el saldo en 0 el préstamo pasa a CANCELADO y el cliente sale de la ruta.
 * En la siguiente sincronización el celular borra los préstamos que no están ACTIVO en el
 * servidor, por eso la lista del día se guarda aparte (db.settings) para que la tarjeta
 * "Préstamos terminados" del dashboard siga mostrándola, con o sin conexión.
 */
export interface CompletedLoanEntry {
  loanId: string;
  clientId: string;
  clientName: string;
  clientPhone?: string | null;
  /** Valor del préstamo cerrado (obligación inicial). En los pagados es lo que el cliente pagó. */
  totalPaid: number;
  amountRequested: number;
  /** ISO del último cobro de hoy (o de la creación del préstamo nuevo si fue refinanciado) */
  completedAt: string;
  /** true si el cliente refinanció: el préstamo anterior se cerró y abrió otro nuevo */
  refinanced?: boolean;
}

export function completedLoansSettingKey(dateStr: string) {
  return `completed_loans_${dateStr}`;
}
