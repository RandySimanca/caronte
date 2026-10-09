/** Colombia is UTC-5 year-round (no DST). All day-close totals use this window. */
export const BUSINESS_TZ_OFFSET = '-05:00';

export function dayRangeIso(dateStr: string): { start: string; end: string } {
  return {
    start: new Date(`${dateStr}T00:00:00${BUSINESS_TZ_OFFSET}`).toISOString(),
    end: new Date(`${dateStr}T23:59:59.999${BUSINESS_TZ_OFFSET}`).toISOString(),
  };
}

export function colombiaDateFromIso(iso: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const col = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const y = col.getUTCFullYear();
  const m = String(col.getUTCMonth() + 1).padStart(2, '0');
  const day = String(col.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type TodayPayment = {
  operation_id: string;
  loan_id?: string | null;
  total_amount: number;
  day_installment_amount?: number;
  arrears_amount?: number;
  advance_amount?: number;
  is_transfer?: boolean;
  device_id?: string | null;
  collected_at?: string | null;
};

function paymentFromSyncOp(op: { operation_type?: string; payload?: any; local_timestamp?: string }): TodayPayment | null {
  const type = op.operation_type;
  if (type !== 'PAYMENT' && type !== 'PAYMENT_BUNDLE') return null;
  const p = op.payload?.payment ?? op.payload;
  if (!p) return null;
  const operationId = p.operationId || p.operation_id;
  if (!operationId) return null;
  return {
    operation_id: String(operationId),
    loan_id: p.loanId || p.loan_id || null,
    total_amount: Number(p.totalAmount ?? p.total_amount ?? 0),
    day_installment_amount: Number(p.dayInstallmentAmount ?? p.day_installment_amount ?? 0),
    arrears_amount: Number(p.arrearsAmount ?? p.arrears_amount ?? 0),
    advance_amount: Number(p.advanceAmount ?? p.advance_amount ?? 0),
    is_transfer: !!(p.isTransfer ?? p.is_transfer),
    device_id: p.deviceId || p.device_id || null,
    collected_at: p.collectedAt || p.collected_at || op.local_timestamp || null,
  };
}

function isOpOnDate(op: { payload?: any; local_timestamp?: string }, dateStr: string): boolean {
  const p = op.payload?.payment ?? op.payload;
  const collectedAt = p?.collectedAt || p?.collected_at || op.local_timestamp;
  if (!collectedAt) return false;
  return colombiaDateFromIso(String(collectedAt)) === dateStr;
}

/**
 * Recaudo del día = cobros reales (tabla payments + cola local), no paid_amount de cuotas.
 * Sumar paid_amount cuando paid_date=hoy infla el recaudo si la cuota ya tenía un abono PARCIAL de días anteriores.
 */
export function mergeTodayPayments(
  serverPayments: TodayPayment[] | undefined,
  syncOps: { operation_type?: string; payload?: any; local_timestamp?: string }[],
  dateStr: string,
): TodayPayment[] {
  const map = new Map<string, TodayPayment>();
  for (const p of serverPayments || []) {
    const id = p.operation_id;
    if (!id) continue;
    map.set(id, {
      operation_id: id,
      loan_id: p.loan_id || null,
      total_amount: Number(p.total_amount || 0),
      day_installment_amount: Number(p.day_installment_amount ?? 0),
      arrears_amount: Number(p.arrears_amount ?? 0),
      advance_amount: Number(p.advance_amount ?? 0),
      is_transfer: !!p.is_transfer,
      device_id: p.device_id || null,
      collected_at: p.collected_at || (p as any).collectedAt || null,
    });
  }
  for (const op of syncOps) {
    if (!isOpOnDate(op, dateStr)) continue;
    const local = paymentFromSyncOp(op);
    if (!local) continue;
    map.set(local.operation_id, local);
  }
  return [...map.values()];
}

export function sumTodayPayments(payments: TodayPayment[]) {
  const isOffice = (p: TodayPayment) => p.device_id === 'admin_panel';
  const collector = payments.filter(p => !isOffice(p));
  const office = payments.filter(isOffice);
  return {
    /** Cobros del cobrador (efectivo + transferencias), sin oficina */
    collected: collector.reduce((s, p) => s + Number(p.total_amount || 0), 0),
    transfers: collector.filter(p => p.is_transfer).reduce((s, p) => s + Number(p.total_amount || 0), 0),
    officeCash: office.filter(p => !p.is_transfer).reduce((s, p) => s + Number(p.total_amount || 0), 0),
    officeTransfers: office.filter(p => p.is_transfer).reduce((s, p) => s + Number(p.total_amount || 0), 0),
  };
}

export function paymentsTodaySettingKey(dateStr: string) {
  return `payments_today_${dateStr}`;
}
