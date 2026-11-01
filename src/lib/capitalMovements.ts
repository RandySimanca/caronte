/**
 * Movimientos de capital de la ruta (aportes del admin y pagos de salario).
 *
 * El monto de cada movimiento es SIEMPRE positivo; el tipo (kind) define si suma o resta a la plata
 * que circula en la ruta (la "base" de la liquidación):
 *   - APORTE_CAPITAL   suma   (el admin agrega dinero a la ruta)
 *   - SALARIO_COBRADOR resta  (pago al cobrador)
 *   - SALARIO_ADMIN    resta  (retiro del administrador)
 *   - RETIRO_OTRO      resta  (retiro de dinero de la ruta que no es salario)
 *
 * Los pagos de salario pueden salir de la ruta (source RUTA, descuentan la base) o de otro dinero del
 * admin (source EXTERNO, no tocan la base pero cuentan como salario pagado en los reportes).
 *
 * Este archivo es puro (sin dependencias) para poder probarlo aislado. Las mismas reglas de ventana de
 * fechas están en la función SQL get_route_pending_capital() de la migración 045.
 */

export type CapitalKind = 'APORTE_CAPITAL' | 'SALARIO_COBRADOR' | 'SALARIO_ADMIN' | 'RETIRO_OTRO';

/** De dónde sale el dinero: de la ruta (baja la base) o de otro dinero del admin (no toca la base). */
export type CapitalSource = 'RUTA' | 'EXTERNO';

export interface CapitalMovement {
  id: string;
  /** null solo en pagos EXTERNO sin ruta asignada. */
  route_id: string | null;
  kind: CapitalKind;
  source: CapitalSource;
  amount: number;
  movement_date: string; // YYYY-MM-DD
  method: 'EFECTIVO' | 'TRANSFERENCIA' | null;
  beneficiary_id: string | null;
  period_month: string | null; // YYYY-MM-01
  note: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  // Datos enlazados que trae el servicio (opcionales)
  route_name?: string | null;
  beneficiary_name?: string | null;
  creator_name?: string | null;
}

export const KIND_LABELS: Record<CapitalKind, string> = {
  APORTE_CAPITAL: 'Aporte de capital',
  SALARIO_COBRADOR: 'Salario del cobrador',
  SALARIO_ADMIN: 'Salario del administrador',
  RETIRO_OTRO: 'Otro retiro',
};

export const SOURCE_LABELS: Record<CapitalSource, string> = {
  RUTA: 'Dinero de la ruta',
  EXTERNO: 'Otro dinero (no toca la ruta)',
};

export const SALARY_KINDS: CapitalKind[] = ['SALARIO_COBRADOR', 'SALARIO_ADMIN'];

/** ¿El movimiento saca dinero de la ruta? */
export function isOutflow(kind: CapitalKind): boolean {
  return kind !== 'APORTE_CAPITAL';
}

function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const isActive = (m: Pick<CapitalMovement, 'voided_at'>) => !m.voided_at;

export interface CapitalTotals {
  /** Dinero que el admin agregó a la ruta. */
  aportes: number;
  /** Dinero que salió (salarios y otros retiros), sea de la ruta o de otro dinero. */
  retiros: number;
  /** aportes - retiros. */
  net: number;
  salarioCobrador: number;
  salarioAdmin: number;
  otrosRetiros: number;
}

/** Totales de los movimientos vigentes (ignora los anulados). */
export function summarize(movements: CapitalMovement[]): CapitalTotals {
  let aportes = 0;
  let salarioCobrador = 0;
  let salarioAdmin = 0;
  let otrosRetiros = 0;
  for (const m of movements) {
    if (!isActive(m)) continue;
    const amount = Number(m.amount) || 0;
    if (m.kind === 'APORTE_CAPITAL') aportes += amount;
    else if (m.kind === 'SALARIO_COBRADOR') salarioCobrador += amount;
    else if (m.kind === 'SALARIO_ADMIN') salarioAdmin += amount;
    else if (m.kind === 'RETIRO_OTRO') otrosRetiros += amount;
  }
  const retiros = salarioCobrador + salarioAdmin + otrosRetiros;
  return {
    aportes: r2(aportes),
    retiros: r2(retiros),
    net: r2(aportes - retiros),
    salarioCobrador: r2(salarioCobrador),
    salarioAdmin: r2(salarioAdmin),
    otrosRetiros: r2(otrosRetiros),
  };
}

/**
 * Movimientos vigentes que entran a la base de la liquidación del día `untilDate`:
 * solo los de la ruta (source RUTA; los pagos EXTERNO no tocan la base), con fecha posterior al último cierre aprobado (`prevDate`) y hasta `untilDate` inclusive.
 * Sin cierre anterior (`prevDate` = null) entran todos los que lleguen hasta `untilDate`.
 */
export function movementsInWindow(
  movements: CapitalMovement[],
  prevDate: string | null,
  untilDate: string,
): CapitalMovement[] {
  return movements.filter(m => {
    if (!isActive(m) || m.source !== 'RUTA') return false;
    const d = m.movement_date.slice(0, 10);
    return d <= untilDate && (prevDate === null || d > prevDate);
  });
}

export interface OpeningBase {
  aportes: number;
  retiros: number;
  net: number;
  /** Base sugerida: cierre anterior + aportes - retiros, nunca menor a 0. */
  base: number;
  /** Cuánto se pasaron los retiros de lo disponible (0 si alcanzó). */
  shortfall: number;
}

/**
 * Base sugerida para el día: lo que entregó el cobrador en el último cierre aprobado más lo que el admin
 * puso y menos lo que sacó desde entonces. Si los retiros superan lo disponible la base queda en 0 y
 * `shortfall` dice cuánto faltó.
 */
export function openingBase(prevAmount: number, movements: CapitalMovement[]): OpeningBase {
  const t = summarize(movements);
  const raw = r2(Number(prevAmount || 0) + t.net);
  return {
    aportes: t.aportes,
    retiros: t.retiros,
    net: t.net,
    base: raw > 0 ? raw : 0,
    shortfall: raw < 0 ? r2(-raw) : 0,
  };
}

/** Suma `days` días a una fecha YYYY-MM-DD (sin zonas horarias). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Primera fecha en la que se puede registrar un movimiento de la ruta: hoy, o el día siguiente al último
 * día liquidado si hoy ya quedó liquidado.
 */
export function earliestMovementDate(lastClosedDate: string | null, today: string): string {
  if (!lastClosedDate) return today;
  const next = addDays(lastClosedDate, 1);
  return next > today ? next : today;
}

/** Primer día del mes (YYYY-MM-01) a partir de año y mes (1-12). */
export function periodMonthOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Nombre del mes en español, p. ej. "noviembre de 2026" (recibe YYYY-MM-01). */
export function periodLabel(periodMonth: string): string {
  const [y, m] = periodMonth.slice(0, 10).split('-').map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('es-CO', { month: 'long', timeZone: 'UTC' });
  return `${name} de ${y}`;
}
