import { supabase } from '@/lib/supabase';
import { AdminService } from '@/services/AdminService';
import { colombiaToday } from '@/lib/dailyCollection';
import {
  addDays,
  earliestMovementDate,
  movementsInWindow,
  openingBase,
  summarize,
  type CapitalKind,
  type CapitalMovement,
  type CapitalSource,
  type CapitalTotals,
  type OpeningBase,
} from '@/lib/capitalMovements';

const MISSING_MIGRATION_MSG =
  'Falta aplicar la migración 045_route_capital_movements.sql en Supabase para usar los movimientos de capital.';

function isMissingTable(error: any): boolean {
  const msg = String(error?.message || '');
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (/route_capital_movements/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg))
  );
}

function mapRow(row: any): CapitalMovement {
  return {
    ...row,
    amount: Number(row.amount),
    movement_date: String(row.movement_date).slice(0, 10),
    period_month: row.period_month ? String(row.period_month).slice(0, 10) : null,
    route_name: row.route?.name ?? null,
    beneficiary_name: row.beneficiary?.full_name ?? null,
    creator_name: row.creator?.full_name ?? null,
  } as CapitalMovement;
}

export interface OpeningBaseResult extends OpeningBase {
  /** Último cierre aprobado anterior al día (null si la ruta aún no tiene cierres). */
  prev: { date: string; amount: number } | null;
  /** Movimientos vigentes que entran a la base de ese día. */
  movements: CapitalMovement[];
}

export interface RegisterBase {
  amount: number;
  method: 'EFECTIVO' | 'TRANSFERENCIA';
  note?: string;
  /** Día desde el que cuenta. En movimientos de la ruta, por defecto el primer día aún no liquidado. */
  date?: string;
  adminId: string;
}

/** Aportes de capital a la ruta y pagos de salario (cobrador y administrador). */
export class CapitalMovementService {
  // ─── CONSULTAS ──────────────────────────────────────────────────────────

  /** Movimientos con filtros opcionales. Más recientes primero. */
  static async list(filters: {
    routeId?: string;
    from?: string;
    to?: string;
    kind?: CapitalKind;
    source?: CapitalSource;
    includeVoided?: boolean;
  } = {}): Promise<CapitalMovement[]> {
    let query = supabase
      .from('route_capital_movements')
      .select(`
        *,
        route:routes(name),
        beneficiary:users!route_capital_movements_beneficiary_id_fkey(full_name),
        creator:users!route_capital_movements_created_by_fkey(full_name)
      `)
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.routeId && filters.routeId !== 'all') query = query.eq('route_id', filters.routeId);
    if (filters.from) query = query.gte('movement_date', filters.from);
    if (filters.to) query = query.lte('movement_date', filters.to);
    if (filters.kind) query = query.eq('kind', filters.kind);
    if (filters.source) query = query.eq('source', filters.source);
    if (!filters.includeVoided) query = query.is('voided_at', null);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }
    return (data || []).map(mapRow);
  }

  /** Último día liquidado (aprobado) de la ruta, o null si no tiene cierres. */
  static async getLastClosedDate(routeId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('daily_closings')
      .select('closing_date')
      .eq('route_id', routeId)
      .eq('is_closed', true)
      .order('closing_date', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data as any[])?.[0];
    return row ? String(row.closing_date).slice(0, 10) : null;
  }

  /** Primera fecha en la que se puede registrar un movimiento de esa ruta. */
  static async getEarliestDate(routeId: string): Promise<string> {
    return earliestMovementDate(await this.getLastClosedDate(routeId), colombiaToday());
  }

  /**
   * Base sugerida de la liquidación del día `dateStr`: lo entregado en el último cierre aprobado más los
   * aportes y menos los retiros hechos desde entonces. Si la migración 045 aún no existe devuelve solo el
   * cierre anterior (no rompe la liquidación).
   */
  static async getOpeningBase(routeId: string, dateStr: string): Promise<OpeningBaseResult> {
    const prev = await AdminService.getPreviousClosing(routeId, dateStr);

    let movements: CapitalMovement[] = [];
    try {
      const all = await this.list({
        routeId,
        from: prev ? addDays(prev.date, 1) : undefined,
        to: dateStr,
      });
      movements = movementsInWindow(all, prev?.date ?? null, dateStr);
    } catch (error: any) {
      if (String(error?.message || '') !== MISSING_MIGRATION_MSG) throw error;
    }

    return { prev, movements, ...openingBase(prev?.amount ?? 0, movements) };
  }

  /** Totales de lo registrado en un período (por fecha del movimiento). Para los reportes. */
  static async getPeriodTotals(from: string, to: string, routeId?: string): Promise<CapitalTotals> {
    try {
      return summarize(await this.list({ from, to, routeId }));
    } catch (error: any) {
      if (String(error?.message || '') === MISSING_MIGRATION_MSG) return summarize([]);
      throw error;
    }
  }

  /** Lo ya pagado de un salario en un mes (suma de los pagos vigentes). */
  static async getSalaryPaid(beneficiaryId: string, kind: 'SALARIO_COBRADOR' | 'SALARIO_ADMIN', periodMonth: string): Promise<number> {
    const { data, error } = await supabase
      .from('route_capital_movements')
      .select('amount')
      .eq('beneficiary_id', beneficiaryId)
      .eq('kind', kind)
      .eq('period_month', periodMonth)
      .is('voided_at', null);
    if (error) {
      if (isMissingTable(error)) return 0;
      throw error;
    }
    return (data || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  }

  /** Cobradores activos, para elegir a quién se le paga (sin importar su asignación de ruta). */
  static async getCollectors(): Promise<{ id: string; name: string }[]> {
    const users = await AdminService.getUsers();
    return users
      .filter(u => u.roles?.name === 'COBRADOR')
      .map(u => ({ id: u.id, name: u.full_name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /** Ruta activa de un cobrador (para sugerirla al pagarle), o null si no tiene. */
  static async getCollectorRouteId(collectorId: string): Promise<string | null> {
    const { data } = await supabase
      .from('route_assignments')
      .select('route_id')
      .eq('collector_id', collectorId)
      .is('date_end', null)
      .limit(1);
    return (data as any[])?.[0]?.route_id ?? null;
  }

  // ─── VALIDACIONES ───────────────────────────────────────────────────────

  private static assertAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0.');
    if (Math.round(amount) !== amount) throw new Error('El monto debe ser en pesos enteros.');
  }

  /** Valida la fecha contra los días ya liquidados de la ruta y devuelve la fecha a usar. */
  private static async resolveDate(routeId: string, date?: string): Promise<string> {
    const lastClosed = await this.getLastClosedDate(routeId);
    const earliest = earliestMovementDate(lastClosed, colombiaToday());
    const chosen = (date || earliest).slice(0, 10);
    if (lastClosed && chosen <= lastClosed) {
      throw new Error(`La ruta ya está liquidada hasta el ${lastClosed}. Usa el ${earliest} o una fecha posterior.`);
    }
    return chosen;
  }

  private static async insert(row: Record<string, any>): Promise<CapitalMovement> {
    const { data, error } = await supabase.from('route_capital_movements').insert(row as any).select().single();
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }
    return mapRow(data);
  }

  // ─── REGISTRO ───────────────────────────────────────────────────────────

  /** Ingreso: el admin agrega dinero a la ruta. Sube la base desde la fecha indicada. */
  static async registerAporte(p: RegisterBase & { routeId: string }) {
    this.assertAmount(p.amount);
    const date = await this.resolveDate(p.routeId, p.date);
    return this.insert({
      route_id: p.routeId,
      kind: 'APORTE_CAPITAL',
      source: 'RUTA',
      amount: p.amount,
      movement_date: date,
      method: p.method,
      note: p.note?.trim() || null,
      created_by: p.adminId,
    });
  }

  /** Retiro de dinero de la ruta que no es salario. Baja la base desde la fecha indicada. La nota es obligatoria. */
  static async registerRetiro(p: RegisterBase & { routeId: string }) {
    this.assertAmount(p.amount);
    if ((p.note || '').trim().length < 3) throw new Error('Escribe en la nota para qué es el retiro.');
    const date = await this.resolveDate(p.routeId, p.date);
    return this.insert({
      route_id: p.routeId,
      kind: 'RETIRO_OTRO',
      source: 'RUTA',
      amount: p.amount,
      movement_date: date,
      method: p.method,
      note: p.note!.trim(),
      created_by: p.adminId,
    });
  }

  /**
   * Pago de salario (cobrador o administrador) de un mes. El monto lo digita el admin.
   *  - source RUTA: sale del dinero de la ruta; baja la base desde la fecha indicada. Pide ruta.
   *  - source EXTERNO: el admin paga con otro dinero; no toca la base ni las liquidaciones, pero cuenta como
   *    salario pagado en los reportes. La ruta es opcional (sirve para que cuente en los reportes de esa ruta).
   */
  static async registerSalary(p: RegisterBase & {
    kind: 'SALARIO_COBRADOR' | 'SALARIO_ADMIN';
    source: CapitalSource;
    routeId?: string | null;
    beneficiaryId: string;
    /** Mes que cubre el pago, siempre YYYY-MM-01. */
    periodMonth: string;
  }) {
    this.assertAmount(p.amount);
    if (!/^\d{4}-\d{2}-01$/.test(p.periodMonth)) throw new Error('El mes del pago no es válido.');

    let date: string;
    if (p.source === 'RUTA') {
      if (!p.routeId) throw new Error('Elige la ruta de la que sale el dinero.');
      date = await this.resolveDate(p.routeId, p.date);
    } else {
      date = (p.date || colombiaToday()).slice(0, 10);
    }

    return this.insert({
      route_id: p.routeId || null,
      kind: p.kind,
      source: p.source,
      amount: p.amount,
      movement_date: date,
      method: p.method,
      beneficiary_id: p.beneficiaryId,
      period_month: p.periodMonth,
      note: p.note?.trim() || null,
      created_by: p.adminId,
    });
  }

  // ─── ANULAR ─────────────────────────────────────────────────────────────

  /**
   * Anula un movimiento. La base de datos lo rechaza si el movimiento ya quedó dentro de una liquidación
   * aprobada: hay que reabrir ese día primero.
   */
  static async voidMovement(p: { id: string; reason: string; adminId: string }) {
    if ((p.reason || '').trim().length < 3) throw new Error('Escribe el motivo de la anulación (mínimo 3 caracteres).');
    const { error } = await supabase
      .from('route_capital_movements')
      .update({ voided_at: new Date().toISOString(), voided_by: p.adminId, void_reason: p.reason.trim() } as any)
      .eq('id', p.id)
      .is('voided_at', null);
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }
  }
}
