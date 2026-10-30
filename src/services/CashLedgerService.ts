import { supabase } from '@/lib/supabase';
import { AdminService } from '@/services/AdminService';
import { colombiaToday } from '@/lib/dailyCollection';
import {
  computeBalances,
  sobrantePending,
  isLateClarification,
  parseLateDays,
  MANUAL_KINDS,
  type LedgerEntry,
  type CashBalances,
} from '@/lib/cashLedger';

export interface CollectorAccountSummary extends CashBalances {
  collectorId: string;
  collectorName: string;
  /** Fecha del sobrante pendiente más antiguo (para mostrar su antigüedad). */
  oldestSurplusDate: string | null;
}

const MISSING_MIGRATION_MSG =
  'Falta aplicar la migración 044_collector_cash_ledger.sql en Supabase para usar la cuenta de efectivo.';

function isMissingTable(error: any): boolean {
  const msg = String(error?.message || '');
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (/collector_cash_ledger/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg))
  );
}

function mapEntry(row: any): LedgerEntry {
  return {
    ...row,
    amount: Number(row.amount),
    creator_name: row.creator?.full_name ?? null,
    client_name: row.payment?.loan?.client?.full_name ?? null,
  } as LedgerEntry;
}

/** Cuenta de efectivo del cobrador: faltantes, sobrantes y sus movimientos. */
export class CashLedgerService {
  // ─── CONSULTAS ──────────────────────────────────────────────────────────

  /** Todos los movimientos de un cobrador (incluye los anulados, para el historial). Más recientes primero. */
  static async getEntries(collectorId: string): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
      .from('collector_cash_ledger')
      .select(`
        *,
        creator:users!collector_cash_ledger_created_by_fkey(full_name),
        payment:payments(id, loan:loans(client:clients(full_name)))
      `)
      .eq('collector_id', collectorId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }
    return (data || []).map(mapEntry);
  }

  /** Saldos de un cobrador. Si la migración aún no existe devuelve ceros (no rompe la liquidación). */
  static async getBalances(collectorId: string): Promise<CashBalances> {
    const { data, error } = await supabase
      .from('collector_cash_ledger')
      .select('kind, amount, voided_at')
      .eq('collector_id', collectorId)
      .is('voided_at', null);
    if (error) {
      if (isMissingTable(error)) return { debt: 0, surplus: 0 };
      throw error;
    }
    return computeBalances((data || []) as unknown as LedgerEntry[]);
  }

  /** Cobradores con saldo pendiente (faltante o sobrante), del que más debe al que menos. */
  static async getAccountsWithBalance(): Promise<CollectorAccountSummary[]> {
    const { data, error } = await supabase
      .from('collector_cash_ledger')
      .select('*, collector:users!collector_cash_ledger_collector_id_fkey(id, full_name)')
      .is('voided_at', null);
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }

    const byCollector = new Map<string, { name: string; entries: LedgerEntry[] }>();
    for (const row of (data || []) as any[]) {
      const bucket: { name: string; entries: LedgerEntry[] } =
        byCollector.get(row.collector_id) ?? { name: row.collector?.full_name || 'Cobrador', entries: [] };
      bucket.entries.push(mapEntry(row));
      byCollector.set(row.collector_id, bucket);
    }

    const result: CollectorAccountSummary[] = [];
    for (const [collectorId, { name, entries }] of byCollector) {
      const balances = computeBalances(entries);
      if (balances.debt <= 0 && balances.surplus <= 0) continue;
      const pendingDates = entries
        .filter(e => e.kind === 'SOBRANTE' && sobrantePending(e, entries) > 0)
        .map(e => e.movement_date)
        .sort();
      result.push({ collectorId, collectorName: name, ...balances, oldestSurplusDate: pendingDates[0] ?? null });
    }
    return result.sort((a, b) => b.debt - a.debt || b.surplus - a.surplus);
  }

  /** Plazo (días) para aclarar un sobrante sin que quede marcado como tardío. */
  static async getLateClarificationDays(): Promise<number> {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'late_clarification_days')
      .maybeSingle();
    return parseLateDays((data as any)?.value);
  }

  // ─── VALIDACIONES COMPARTIDAS ───────────────────────────────────────────

  private static assertAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0.');
    if (Math.round(amount) !== amount) throw new Error('El monto debe ser en pesos enteros.');
  }

  private static assertNote(note: string | undefined, min: number, what: string) {
    if ((note || '').trim().length < min) throw new Error(`Escribe ${what} (mínimo ${min} caracteres).`);
  }

  /** Movimientos vigentes del cobrador (para validar montos antes de insertar). */
  private static async activeEntries(collectorId: string): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
      .from('collector_cash_ledger')
      .select('*')
      .eq('collector_id', collectorId)
      .is('voided_at', null);
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }
    return (data || []).map(mapEntry);
  }

  private static async insert(row: Record<string, any>): Promise<LedgerEntry> {
    const { data, error } = await supabase.from('collector_cash_ledger').insert(row as any).select().single();
    if (error) {
      if (isMissingTable(error)) throw new Error(MISSING_MIGRATION_MSG);
      throw error;
    }
    return mapEntry(data);
  }

  // ─── MOVIMIENTOS SOBRE EL FALTANTE ──────────────────────────────────────

  /** El cobrador repone (parte de) un faltante. No entra al recaudo ni a la liquidación del día. */
  static async registerRepayment(p: {
    collectorId: string; amount: number; method: 'EFECTIVO' | 'TRANSFERENCIA'; note?: string; adminId: string;
  }) {
    this.assertAmount(p.amount);
    const { debt } = computeBalances(await this.activeEntries(p.collectorId));
    if (p.amount > debt) throw new Error('La reposición supera el faltante pendiente del cobrador.');
    return this.insert({
      collector_id: p.collectorId,
      kind: 'REPOSICION',
      amount: p.amount,
      movement_date: colombiaToday(),
      method: p.method,
      note: p.note?.trim() || null,
      created_by: p.adminId,
    });
  }

  /** El admin perdona parte del faltante. Es una pérdida real para la empresa: exige motivo. */
  static async condoneDebt(p: { collectorId: string; amount: number; note: string; adminId: string }) {
    this.assertAmount(p.amount);
    this.assertNote(p.note, 5, 'el motivo de la condonación');
    const { debt } = computeBalances(await this.activeEntries(p.collectorId));
    if (p.amount > debt) throw new Error('La condonación supera el faltante pendiente del cobrador.');
    return this.insert({
      collector_id: p.collectorId,
      kind: 'CONDONACION',
      amount: p.amount,
      movement_date: colombiaToday(),
      note: p.note.trim(),
      created_by: p.adminId,
    });
  }

  // ─── MOVIMIENTOS SOBRE UN SOBRANTE ──────────────────────────────────────

  private static async getPendingSobrante(sobranteId: string): Promise<{ sobrante: LedgerEntry; pending: number; entries: LedgerEntry[] }> {
    const { data, error } = await supabase.from('collector_cash_ledger').select('*').eq('id', sobranteId).single();
    if (error) throw error;
    const sobrante = mapEntry(data);
    if (sobrante.kind !== 'SOBRANTE' || sobrante.voided_at) throw new Error('Ese sobrante ya no está vigente.');
    const entries = await this.activeEntries(sobrante.collector_id);
    return { sobrante, pending: sobrantePending(sobrante, entries), entries };
  }

  /** Se le devuelve al cobrador (parte de) un sobrante que resultó ser suyo. */
  static async returnSobrante(p: { sobranteId: string; amount: number; note: string; adminId: string }) {
    this.assertAmount(p.amount);
    this.assertNote(p.note, 3, 'una nota');
    const { sobrante, pending } = await this.getPendingSobrante(p.sobranteId);
    if (p.amount > pending) throw new Error('El monto supera lo que queda por aclarar de ese sobrante.');
    return this.insert({
      collector_id: sobrante.collector_id,
      route_id: sobrante.route_id,
      kind: 'DEVOLUCION_SOBRANTE',
      amount: p.amount,
      movement_date: colombiaToday(),
      related_id: sobrante.id,
      note: p.note.trim(),
      created_by: p.adminId,
    });
  }

  /** Un sobrante cubre (parte de) un faltante del mismo cobrador. Decisión explícita del admin. */
  static async compensate(p: { sobranteId: string; amount: number; note: string; adminId: string }) {
    this.assertAmount(p.amount);
    this.assertNote(p.note, 3, 'una nota');
    const { sobrante, pending, entries } = await this.getPendingSobrante(p.sobranteId);
    const { debt } = computeBalances(entries);
    if (debt <= 0) throw new Error('El cobrador no tiene faltante pendiente que compensar.');
    if (p.amount > pending) throw new Error('El monto supera lo que queda por aclarar de ese sobrante.');
    if (p.amount > debt) throw new Error('El monto supera el faltante pendiente del cobrador.');
    return this.insert({
      collector_id: sobrante.collector_id,
      route_id: sobrante.route_id,
      kind: 'COMPENSACION',
      amount: p.amount,
      movement_date: colombiaToday(),
      related_id: sobrante.id,
      note: p.note.trim(),
      created_by: p.adminId,
    });
  }

  /**
   * Aclara un sobrante con un cobro de cliente que el cobrador recibió pero no digitó en la app.
   *
   * El cobro se registra por la vía de oficina (collector_id = admin), así NO entra a la liquidación del
   * cobrador y el cierre ya aprobado no cambia. Lleva la fecha real del pago (`paymentDate`, por defecto el
   * día del sobrante) para que la cuenta del cliente quede correcta. Si pasó el plazo configurado queda
   * marcado como tardío y exige una nota.
   */
  static async clarifySobrante(p: {
    sobranteId: string; loanId: string; amount: number; paymentDate: string; note?: string; adminId: string;
  }) {
    this.assertAmount(p.amount);

    const { sobrante, pending } = await this.getPendingSobrante(p.sobranteId);
    if (p.amount > pending) throw new Error('El monto supera lo que queda por aclarar de ese sobrante.');

    const today = colombiaToday();
    const sobranteDate = sobrante.movement_date.slice(0, 10);
    if (p.paymentDate > today) throw new Error('La fecha del cobro no puede ser futura.');
    if (p.paymentDate > sobranteDate) {
      throw new Error('El cobro tiene que ser del día del sobrante o anterior: ese dinero ya estaba en la entrega del cobrador.');
    }

    const { data: loan, error: loanErr } = await supabase
      .from('loans')
      .select('id, route_id, status, current_balance, disbursement_date')
      .eq('id', p.loanId)
      .single();
    if (loanErr) throw loanErr;
    if (sobrante.route_id && loan.route_id !== sobrante.route_id) {
      throw new Error('El préstamo es de otra ruta distinta a la del sobrante.');
    }
    if (p.amount > Number(loan.current_balance || 0)) {
      throw new Error('El monto no puede ser mayor a la deuda actual del préstamo.');
    }
    if (loan.disbursement_date && p.paymentDate < String(loan.disbursement_date).slice(0, 10)) {
      throw new Error('La fecha del cobro es anterior al desembolso del préstamo.');
    }

    const lateDays = await this.getLateClarificationDays();
    const isLate = isLateClarification(sobranteDate, today, lateDays);
    if (isLate) this.assertNote(p.note, 10, `una nota que explique por qué se aclara pasados ${lateDays} días`);

    // 1) El cobro, con su fecha real (mediodía de Colombia de ese día)
    const reg = await AdminService.registerAdminPayment({
      loanId: p.loanId,
      routeId: loan.route_id,
      adminId: p.adminId,
      totalAmount: p.amount,
      observation: `Cobro tardío: sobrante del ${sobranteDate}${p.note?.trim() ? ` — ${p.note.trim()}` : ''}`,
      collectedAt: new Date(`${p.paymentDate}T12:00:00-05:00`).toISOString(),
    });

    let paymentId = reg.payment_id;
    if (!paymentId) {
      const { data: found } = await supabase.from('payments').select('id').eq('operation_id', reg.operation_id).maybeSingle();
      paymentId = (found as any)?.id ?? null;
    }
    if (!paymentId) throw new Error('El cobro se registró pero no se pudo enlazar al sobrante. Revisa el historial de pagos del préstamo.');

    // 2) El movimiento que descuenta el sobrante. Si falla, se deshace el cobro para no duplicar dinero.
    try {
      return await this.insert({
        collector_id: sobrante.collector_id,
        route_id: sobrante.route_id,
        kind: 'APLICACION_SOBRANTE',
        amount: p.amount,
        movement_date: today,
        related_id: sobrante.id,
        payment_id: paymentId,
        note: p.note?.trim() || null,
        is_late: isLate,
        created_by: p.adminId,
      });
    } catch (err) {
      await AdminService.deletePayment(paymentId, { skipLedgerChecks: true }).catch(() => undefined);
      throw err;
    }
  }

  // ─── ANULAR ─────────────────────────────────────────────────────────────

  /**
   * Anula un movimiento manual. Si era la aclaración de un sobrante, también borra el cobro tardío que
   * había creado y el sobrante vuelve a quedar pendiente. Los faltantes y sobrantes de un cierre no se
   * anulan aquí: se anulan al reabrir el día en Liquidaciones.
   */
  static async voidMovement(p: { entryId: string; reason: string; adminId: string }) {
    this.assertNote(p.reason, 5, 'el motivo de la anulación');

    const { data, error } = await supabase.from('collector_cash_ledger').select('*').eq('id', p.entryId).single();
    if (error) throw error;
    const entry = mapEntry(data);
    if (entry.voided_at) throw new Error('Ese movimiento ya está anulado.');
    if (!MANUAL_KINDS.includes(entry.kind)) {
      throw new Error('Los faltantes y sobrantes de un cierre se anulan reabriendo el día en Liquidaciones.');
    }

    const voidedAt = new Date().toISOString();
    const { error: voidErr } = await supabase
      .from('collector_cash_ledger')
      .update({ voided_at: voidedAt, voided_by: p.adminId, void_reason: p.reason.trim() } as any)
      .eq('id', entry.id);
    if (voidErr) throw voidErr;

    if (entry.kind === 'APLICACION_SOBRANTE' && entry.payment_id) {
      try {
        await AdminService.deletePayment(entry.payment_id, { skipLedgerChecks: true });
      } catch (err) {
        // No se pudo borrar el cobro: se restaura el movimiento para que todo siga consistente
        await supabase
          .from('collector_cash_ledger')
          .update({ voided_at: null, voided_by: null, void_reason: null } as any)
          .eq('id', entry.id);
        throw err;
      }
    }
  }
}
