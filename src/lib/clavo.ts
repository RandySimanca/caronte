import { colombiaToday } from '@/lib/dailyCollection';

/** Días de gracia después del vencimiento (end_date) antes de que el préstamo sea clavo. */
export const CLAVO_GRACE_DAYS = 7;

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Regla de "clavo": un préstamo es clavo cuando ya pasó su fecha de vencimiento (end_date) más
 * 7 días de gracia (es decir, hoy > end_date + 7) y todavía tiene saldo pendiente.
 * El cliente es clavo mientras tenga al menos un préstamo así.
 *
 * Un cliente clavo NO puede recibir un préstamo nuevo normal hasta saldar su deuda, pero SÍ puede
 * refinanciar: la refinanciación descuenta el saldo pendiente del dinero a entregar, así el cliente
 * paga su deuda y adquiere una nueva obligación.
 *
 * No depende del campo `status` de la BD: el préstamo sigue ACTIVO hasta que se salda.
 * `today` se compara en hora de Colombia (formato YYYY-MM-DD).
 */
export function isLoanClavo(
  loan: { status?: string | null; end_date?: string | null; current_balance?: number | string | null } | null | undefined,
  today: string = colombiaToday(),
): boolean {
  if (!loan || loan.status !== 'ACTIVO' || !loan.end_date) return false;
  return addDays(loan.end_date, CLAVO_GRACE_DAYS) < today && Number(loan.current_balance || 0) > 0;
}
