import { addDays, format } from 'date-fns';

/**
 * Frecuencia y día de cobro.
 *
 * Las cuotas del préstamo SIEMPRE son diarias (no cambia el calendario ni los montos).
 * La frecuencia solo define cuándo se visita al cliente:
 *   - DIARIO  → se cobra todos los días; en la lista se pinta con el color del día de hoy.
 *   - SEMANAL → se cobra un solo día de la semana (loan.collection_weekday); ese día se cobra
 *               lo acumulado de la semana. Los demás días no se muestra como cuota de hoy
 *               ni cuenta como atraso lo que todavía no le toca pagar.
 *
 * Los días usan la convención de JS Date.getDay(): 0 = domingo … 6 = sábado.
 */

export const WEEKDAYS = [
  { value: 1, label: 'Lunes', short: 'LUN' },
  { value: 2, label: 'Martes', short: 'MAR' },
  { value: 3, label: 'Miércoles', short: 'MIÉ' },
  { value: 4, label: 'Jueves', short: 'JUE' },
  { value: 5, label: 'Viernes', short: 'VIE' },
  { value: 6, label: 'Sábado', short: 'SÁB' },
  { value: 0, label: 'Domingo', short: 'DOM' },
] as const;

/** Días en los que realmente se puede elegir cobrar (los domingos no hay cobro). */
export const COLLECTION_WEEKDAY_OPTIONS = WEEKDAYS.filter(d => d.value !== 0);

/**
 * Clases de Tailwind por día. Van escritas completas (no armadas con template strings)
 * para que Tailwind las detecte al compilar.
 * Se evitaron los colores que ya significan algo en la lista: verde = cobrado,
 * rojo = atrasado, azul = nuevo, índigo = adelantado, ámbar = ganador.
 */
export const WEEKDAY_STYLES: Record<number, { row: string; stripe: string; chip: string; solid: string; selected: string }> = {
  1: { row: 'bg-cyan-50', stripe: 'border-l-cyan-500', chip: 'bg-cyan-100 text-cyan-800 border-cyan-300', solid: 'bg-cyan-500', selected: 'bg-cyan-500 text-white border-cyan-500' },
  2: { row: 'bg-violet-50', stripe: 'border-l-violet-500', chip: 'bg-violet-100 text-violet-800 border-violet-300', solid: 'bg-violet-500', selected: 'bg-violet-500 text-white border-violet-500' },
  3: { row: 'bg-orange-50', stripe: 'border-l-orange-500', chip: 'bg-orange-100 text-orange-800 border-orange-300', solid: 'bg-orange-500', selected: 'bg-orange-500 text-white border-orange-500' },
  4: { row: 'bg-fuchsia-50', stripe: 'border-l-fuchsia-500', chip: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300', solid: 'bg-fuchsia-500', selected: 'bg-fuchsia-500 text-white border-fuchsia-500' },
  5: { row: 'bg-lime-50', stripe: 'border-l-lime-500', chip: 'bg-lime-100 text-lime-800 border-lime-300', solid: 'bg-lime-500', selected: 'bg-lime-500 text-white border-lime-500' },
  6: { row: 'bg-yellow-50', stripe: 'border-l-yellow-500', chip: 'bg-yellow-100 text-yellow-800 border-yellow-300', solid: 'bg-yellow-500', selected: 'bg-yellow-500 text-white border-yellow-500' },
  0: { row: 'bg-slate-100', stripe: 'border-l-slate-400', chip: 'bg-slate-200 text-slate-700 border-slate-300', solid: 'bg-slate-400', selected: 'bg-slate-500 text-white border-slate-500' },
};

export function weekdayStyle(weekday: number) {
  return WEEKDAY_STYLES[weekday] ?? WEEKDAY_STYLES[0];
}

export function weekdayLabel(weekday: number): string {
  return WEEKDAYS.find(d => d.value === weekday)?.label ?? '';
}

export function weekdayShort(weekday: number): string {
  return WEEKDAYS.find(d => d.value === weekday)?.short ?? '';
}

/** Día de la semana (0-6) de una fecha 'yyyy-MM-dd'. Se usa el mediodía para evitar desfases de zona horaria. */
export function weekdayOfDate(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

type LoanScheduleFields = {
  frequency?: string | null;
  collection_weekday?: number | string | null;
  start_date?: string | null;
};

export function isWeeklyLoan(loan: LoanScheduleFields | null | undefined): boolean {
  return loan?.frequency === 'SEMANAL';
}

/**
 * Día de la semana en que se cobra este préstamo HOY.
 * - Semanal: el día elegido al crear el préstamo (si falta, el día de su primera cuota).
 * - Diario: el día de hoy (se cobra todos los días, así que toma el color del día).
 */
export function loanCollectionWeekday(loan: LoanScheduleFields | null | undefined, today: string): number {
  if (loan && isWeeklyLoan(loan)) {
    const n = Number(loan.collection_weekday);
    if (loan.collection_weekday !== null && loan.collection_weekday !== undefined && Number.isInteger(n) && n >= 0 && n <= 6) return n;
    return weekdayOfDate(loan.start_date || today);
  }
  return weekdayOfDate(today);
}

/** Último día de cobro ESTRICTAMENTE anterior a hoy (hace 1 a 7 días). */
export function previousCollectionDate(weekday: number, today: string): string {
  const t = new Date(today + 'T12:00:00');
  let diff = (t.getDay() - weekday + 7) % 7;
  if (diff === 0) diff = 7;
  return format(addDays(t, -diff), 'yyyy-MM-dd');
}

/** Próximo día de cobro: hoy si hoy es el día, si no el siguiente que caiga en ese día. */
export function nextCollectionDate(weekday: number, today: string): string {
  const t = new Date(today + 'T12:00:00');
  const diff = (weekday - t.getDay() + 7) % 7;
  return format(addDays(t, diff), 'yyyy-MM-dd');
}

/** Ej: "Martes 18". */
export function formatCollectionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${weekdayLabel(d.getDay())} ${d.getDate()}`;
}

const PENDING_STATUSES = ['PENDIENTE', 'PARCIAL', 'ATRASADA'];

type InstLike = { scheduled_date: string; status: string; balance: number | string; scheduled_amount?: number | string; paid_date?: string | null };

export interface ScheduleSnapshot {
  weekly: boolean;
  /** Día en que se cobra (semanal: el elegido; diario: hoy). */
  weekday: number;
  /** Diario: siempre true. Semanal: true solo si hoy es su día de cobro. */
  isCollectionDay: boolean;
  /** Semanal: fecha del próximo cobro (hoy si le toca hoy). */
  nextDate: string | null;
  /** Lo que se debe cobrar en esta visita (semanal en su día: lo acumulado de la semana; otros días: 0). */
  dueQuota: number;
  /** Meta de la visita de hoy (semanal en su día), sin descontar lo pagado hoy. */
  dueTarget: number;
  /** Atraso real: cuotas que ya debieron cobrarse en una visita anterior y siguen sin pagar. */
  arrears: number;
  /** Semanal en su día: la semana ya está saldada (con cuotas en la ventana y ninguna pendiente). */
  windowPaid: boolean;
}

/**
 * Calcula lo que toca cobrar según la frecuencia. Para préstamos DIARIOS devuelve weekly=false
 * y quien llama conserva su lógica diaria de siempre.
 *
 * Semanal, definiendo "ventana" = cuotas posteriores al último día de cobro y hasta hoy:
 *   - En su día de cobro:  dueQuota = pendiente de la ventana (la semana acumulada);
 *                           arrears = pendiente de ANTES de la ventana (semanas que no pagó).
 *   - Otro día:            dueQuota = 0; arrears = pendiente hasta el último día de cobro.
 * El total esperado en su día (dueQuota + arrears) es el mismo que con la lógica diaria.
 */
export function scheduleSnapshot(loan: LoanScheduleFields, installments: InstLike[], today: string): ScheduleSnapshot {
  const weekly = isWeeklyLoan(loan);
  const weekday = loanCollectionWeekday(loan, today);
  if (!weekly) {
    return { weekly: false, weekday, isCollectionDay: true, nextDate: null, dueQuota: 0, dueTarget: 0, arrears: 0, windowPaid: false };
  }

  const sum = (arr: InstLike[]) => arr.reduce((s, i) => s + Number(i.balance || 0), 0);
  const prev = previousCollectionDate(weekday, today);
  const isCollectionDay = weekdayOfDate(today) === weekday;
  const pending = installments.filter(i => PENDING_STATUSES.includes(i.status));

  const arrears = sum(pending.filter(i => i.scheduled_date <= prev));
  const nextDate = nextCollectionDate(weekday, today);

  if (!isCollectionDay) {
    return { weekly, weekday, isCollectionDay, nextDate, dueQuota: 0, dueTarget: 0, arrears, windowPaid: false };
  }

  const inWindow = (i: InstLike) => i.scheduled_date > prev && i.scheduled_date <= today;
  const windowAll = installments.filter(inWindow);
  const windowPending = pending.filter(inWindow);
  const dueQuota = sum(windowPending);
  // Meta del día: las cuotas de la semana, sin contar las que ya venían pagadas de antes de hoy
  const dueTarget = windowAll
    .filter(i => !(Number(i.balance || 0) <= 0 && i.paid_date && i.paid_date < today))
    .reduce((s, i) => s + Number(i.scheduled_amount || 0), 0);

  return {
    weekly,
    weekday,
    isCollectionDay,
    nextDate,
    dueQuota,
    dueTarget,
    arrears,
    windowPaid: windowAll.length > 0 && windowPending.length === 0,
  };
}
