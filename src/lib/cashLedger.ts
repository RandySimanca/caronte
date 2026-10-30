/**
 * Cuenta de efectivo del cobrador (faltantes y sobrantes).
 *
 * El monto de cada movimiento es SIEMPRE positivo; el tipo (kind) define si suma o resta en cada
 * "cubeta":
 *   - Faltante pendiente (lo que el cobrador debe)
 *   - Sobrante por aclarar (plata que sobró en la caja y aún no tiene dueño)
 *
 * Este archivo es puro (sin dependencias) para poder probarlo aislado. Las mismas reglas están en el
 * trigger cash_ledger_guard() de la migración 044, que es la red de seguridad en la base de datos.
 */

export type LedgerKind =
  | 'FALTANTE'
  | 'SOBRANTE'
  | 'REPOSICION'
  | 'CONDONACION'
  | 'COMPENSACION'
  | 'APLICACION_SOBRANTE'
  | 'DEVOLUCION_SOBRANTE';

export interface LedgerEntry {
  id: string;
  collector_id: string;
  route_id: string | null;
  closing_id: string | null;
  kind: LedgerKind;
  amount: number;
  movement_date: string; // YYYY-MM-DD
  method: 'EFECTIVO' | 'TRANSFERENCIA' | null;
  related_id: string | null;
  payment_id: string | null;
  note: string | null;
  is_late: boolean;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  // Datos enlazados que trae el servicio (opcionales)
  creator_name?: string | null;
  client_name?: string | null;
}

export const DEFAULT_LATE_CLARIFICATION_DAYS = 7;

export const KIND_LABELS: Record<LedgerKind, string> = {
  FALTANTE: 'Faltante',
  SOBRANTE: 'Sobrante',
  REPOSICION: 'Reposición',
  CONDONACION: 'Condonación',
  COMPENSACION: 'Compensación',
  APLICACION_SOBRANTE: 'Sobrante aclarado con cobro',
  DEVOLUCION_SOBRANTE: 'Sobrante devuelto',
};

/** Movimientos que el admin registra a mano y por tanto puede anular desde la cuenta del cobrador. */
export const MANUAL_KINDS: LedgerKind[] = [
  'REPOSICION',
  'CONDONACION',
  'COMPENSACION',
  'APLICACION_SOBRANTE',
  'DEVOLUCION_SOBRANTE',
];

/** Efecto del movimiento sobre el faltante pendiente (+ aumenta la deuda, - la reduce). */
export function debtEffect(kind: LedgerKind): 1 | -1 | 0 {
  switch (kind) {
    case 'FALTANTE': return 1;
    case 'REPOSICION':
    case 'CONDONACION':
    case 'COMPENSACION': return -1;
    default: return 0;
  }
}

/** Efecto del movimiento sobre el sobrante por aclarar. */
export function surplusEffect(kind: LedgerKind): 1 | -1 | 0 {
  switch (kind) {
    case 'SOBRANTE': return 1;
    case 'APLICACION_SOBRANTE':
    case 'DEVOLUCION_SOBRANTE':
    case 'COMPENSACION': return -1;
    default: return 0;
  }
}

function r6(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6;
}

const isActive = (e: LedgerEntry) => !e.voided_at;

export interface CashBalances {
  /** Lo que el cobrador debe (faltantes - reposiciones - condonaciones - compensaciones). */
  debt: number;
  /** Plata sobrante sin aclarar (sobrantes - aplicados - devueltos - compensados). */
  surplus: number;
}

/** Saldos vigentes. Ignora los movimientos anulados. */
export function computeBalances(entries: LedgerEntry[]): CashBalances {
  let debt = 0;
  let surplus = 0;
  for (const e of entries) {
    if (!isActive(e)) continue;
    const amount = Number(e.amount) || 0;
    debt += debtEffect(e.kind) * amount;
    surplus += surplusEffect(e.kind) * amount;
  }
  return { debt: r6(debt), surplus: r6(surplus) };
}

/** Lo que aún queda por aclarar de un sobrante concreto. */
export function sobrantePending(sobrante: LedgerEntry, entries: LedgerEntry[]): number {
  if (sobrante.kind !== 'SOBRANTE' || !isActive(sobrante)) return 0;
  const used = entries
    .filter(e => isActive(e) && e.related_id === sobrante.id && surplusEffect(e.kind) === -1)
    .reduce((sum, e) => sum + Number(e.amount), 0);
  return Math.max(0, r6(Number(sobrante.amount) - used));
}

/** Sobrantes vigentes con saldo por aclarar, del más antiguo al más reciente. */
export function pendingSobrantes(entries: LedgerEntry[]): { entry: LedgerEntry; pending: number }[] {
  return entries
    .filter(e => e.kind === 'SOBRANTE' && isActive(e))
    .map(entry => ({ entry, pending: sobrantePending(entry, entries) }))
    .filter(x => x.pending > 0)
    .sort((a, b) => a.entry.movement_date.localeCompare(b.entry.movement_date) || a.entry.created_at.localeCompare(b.entry.created_at));
}

/** Movimientos vigentes que dependen de `entry` (aclaraciones, devoluciones o compensaciones de un sobrante). */
export function dependentsOf(entry: LedgerEntry, entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(e => isActive(e) && e.related_id === entry.id);
}

/**
 * ¿Anular estos movimientos dejaría algún saldo en negativo? (Pasa, por ejemplo, al reabrir un día cuyo
 * faltante ya fue repuesto: la reposición quedaría sin faltante que cubrir.)
 */
export function wouldGoNegative(entries: LedgerEntry[], removeIds: string[]): boolean {
  const remove = new Set(removeIds);
  const b = computeBalances(entries.filter(e => !remove.has(e.id)));
  return b.debt < -0.005 || b.surplus < -0.005;
}

/**
 * Diferencia de caja = efectivo recibido - efectivo esperado, en pesos enteros.
 * Negativo = faltante, positivo = sobrante. Se redondea a pesos porque el esperado puede traer
 * decimales (cuotas divididas) y el efectivo real siempre es un número entero.
 */
export function computeDifference(expected: number, actual: number): number {
  const d = Math.round(Number(actual)) - Math.round(Number(expected));
  return d === 0 ? 0 : d; // evita -0
}

/** Días entre dos fechas YYYY-MM-DD (to - from). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** ¿La aclaración de un sobrante ya pasó el plazo configurado? */
export function isLateClarification(sobranteDate: string, today: string, lateDays: number): boolean {
  return daysBetween(sobranteDate, today) > lateDays;
}

/** Parsea el parámetro late_clarification_days (puede llegar como número o texto). */
export function parseLateDays(value: unknown): number {
  const raw = typeof value === 'string' ? value.replace(/"/g, '').trim() : value;
  // Sin valor (null, undefined o texto vacío) se usa el plazo por defecto; 0 sí es un plazo válido.
  if (raw === null || raw === undefined || raw === '') return DEFAULT_LATE_CLARIFICATION_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_LATE_CLARIFICATION_DAYS;
}
