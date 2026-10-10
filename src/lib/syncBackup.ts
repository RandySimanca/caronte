import { db, type SyncOperation } from '@/db/schema';

/** Monto de un cobro encolado (PAYMENT o PAYMENT_BUNDLE); 0 para otros tipos. */
export function opPaymentAmount(op: Pick<SyncOperation, 'operation_type' | 'payload'>): number {
  if (op.operation_type !== 'PAYMENT' && (op.operation_type as string) !== 'PAYMENT_BUNDLE') return 0;
  const p = op.payload?.payment ?? op.payload;
  return Number(p?.totalAmount ?? p?.total_amount ?? 0) || 0;
}

export const OP_LABELS: Record<string, string> = {
  PAYMENT: 'Cobro',
  PAYMENT_BUNDLE: 'Cobro',
  NEW_LOAN_BUNDLE: 'Préstamo nuevo',
  LOAN: 'Préstamo nuevo',
  CLIENT: 'Cliente',
  UPDATE_CLIENT: 'Edición de cliente',
  UPDATE_CLIENT_ORDERS: 'Orden de ruta',
  EXPENSE: 'Gasto',
};

/** Operaciones que todavía NO están en el servidor (se perderían si se limpia la cola). */
export async function getUnsyncedOps(): Promise<SyncOperation[]> {
  return db.syncQueue.where('status').anyOf(['pending', 'failed', 'syncing']).toArray();
}

export async function summarizeUnsynced() {
  const ops = await getUnsyncedOps();
  const payments = ops.filter(o => opPaymentAmount(o) > 0);
  return {
    ops,
    total: ops.length,
    paymentsCount: payments.length,
    paymentsAmount: payments.reduce((s, o) => s + opPaymentAmount(o), 0),
  };
}

/** Descarga un JSON con todo lo que no se ha enviado, para poder recuperarlo manualmente. */
export async function downloadUnsyncedBackup(): Promise<number> {
  const ops = await getUnsyncedOps();
  if (ops.length === 0) return 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ops }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `caronte-respaldo-pendientes-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return ops.length;
}
