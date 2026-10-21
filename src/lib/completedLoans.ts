import type { LocalLoan } from '@/db/schema';

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

/**
 * Arma la lista de préstamos terminados hoy: la que guardó la sincronización (servidor) más los
 * cerrados en este celular que todavía no se sincronizan (pagados o refinanciados).
 */
export function buildCompletedToday(args: {
  serverList?: CompletedLoanEntry[];
  allLoans: LocalLoan[];
  clients: { id: string; full_name?: string | null; phone?: string | null }[];
  today: string;
  /** Préstamos con algún cobro hoy → ISO del último cobro ('' si no se conoce la hora) */
  lastPaymentByLoan: Map<string, string>;
}): CompletedLoanEntry[] {
  const { serverList, allLoans, clients, today, lastPaymentByLoan } = args;
  const map = new Map<string, CompletedLoanEntry>();
  for (const e of serverList || []) map.set(e.loanId, e);

  // Pagados en este celular y aún sin sincronizar (CANCELADO local con cobro de hoy)
  for (const l of allLoans) {
    if (l.status !== 'CANCELADO' || map.has(l.id) || !lastPaymentByLoan.has(l.id)) continue;
    const c = clients.find(x => x.id === l.client_id);
    map.set(l.id, {
      loanId: l.id,
      clientId: l.client_id,
      clientName: c?.full_name || 'Cliente',
      clientPhone: c?.phone ?? null,
      totalPaid: Number(l.initial_obligation ?? l.amount_requested ?? 0),
      amountRequested: Number(l.amount_requested || 0),
      completedAt: lastPaymentByLoan.get(l.id) || '',
    });
  }

  // Refinanciados hoy (préstamo nuevo de hoy que apunta al anterior)
  for (const l of allLoans) {
    const origId = l.refinanced_from_loan_id;
    if (!origId || l.disbursement_date !== today || map.has(origId)) continue;
    const orig = allLoans.find(o => o.id === origId);
    const c = clients.find(x => x.id === l.client_id);
    map.set(origId, {
      loanId: origId,
      clientId: l.client_id,
      clientName: c?.full_name || 'Cliente',
      clientPhone: c?.phone ?? null,
      totalPaid: Number(orig?.initial_obligation ?? orig?.amount_requested ?? 0),
      amountRequested: Number(orig?.amount_requested || 0),
      completedAt: l.created_at || '',
      refinanced: true,
    });
  }

  return [...map.values()].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
}

/**
 * Los clientes que terminaron su préstamo hoy cuentan como visitados (el cobrador los visitó),
 * aunque ya no estén en la lista de la ruta:
 *  - salieron de la ruta (pagaron todo): suman a visitados y al total;
 *  - siguen en la ruta con un préstamo nuevo (refinanciaron): pasan de "nuevo"/pendiente a visitado;
 *  - si ya contaban como visitados (p. ej. pagaron una cuota del préstamo nuevo): no se duplican.
 */
export function countWithCompleted(
  base: { total: number; visited: number; newCount: number },
  completed: CompletedLoanEntry[],
  sets: { route: Set<string>; visited: Set<string>; fresh: Set<string> }
) {
  let { total, visited, newCount } = base;
  const seen = new Set<string>();
  for (const e of completed) {
    if (seen.has(e.clientId)) continue;
    seen.add(e.clientId);
    if (sets.visited.has(e.clientId)) continue;
    visited++;
    if (!sets.route.has(e.clientId)) total++;
    else if (sets.fresh.has(e.clientId)) newCount--;
  }
  return { total, visited, newCount };
}
