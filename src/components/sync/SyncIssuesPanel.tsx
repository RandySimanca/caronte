import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { db } from '@/db/schema';
import { SyncService } from '@/services/SyncService';
import { useSyncStore } from '@/stores/syncStore';
import { formatCurrency } from '@/lib/utils';
import { OP_LABELS, downloadUnsyncedBackup, opPaymentAmount } from '@/lib/syncBackup';

/**
 * Aviso visible cuando hay operaciones que NO se pudieron enviar al servidor.
 * Antes el cobrador solo veía un número en "Operaciones" y no sabía que ese préstamo
 * quedaba congelado (el celular no lo actualiza mientras tenga una operación fallida).
 */
export function SyncIssuesPanel({ collectorId }: { collectorId?: string }) {
  const isOnline = useSyncStore(s => s.isOnline);
  const isSyncing = useSyncStore(s => s.isSyncing);
  const [busy, setBusy] = useState(false);

  const failed = useLiveQuery(() => db.syncQueue.where('status').equals('failed').toArray()) || [];
  if (failed.length === 0) return null;

  const stuck = failed.filter(o => (o.retry_count || 0) >= 3).length;

  const retry = async () => {
    setBusy(true);
    try {
      if (collectorId) await SyncService.fullSync(collectorId);
      else await SyncService.pushPendingOperations();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-amber-900">
            {failed.length === 1 ? '1 operación no se pudo enviar' : `${failed.length} operaciones no se pudieron enviar`}
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            Mientras estén sin enviar, el administrador no las ve y los datos de ese cliente pueden quedar
            distintos entre el celular y el PC. {stuck > 0 ? 'Ya se reintentó varias veces: avisa al administrador.' : 'Toca Reintentar.'}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5 max-h-40 overflow-y-auto">
        {failed.map(op => {
          const amount = opPaymentAmount(op);
          return (
            <li key={op.id} className="text-xs bg-white/70 border border-amber-100 rounded-lg px-3 py-2">
              <div className="flex justify-between font-semibold text-slate-800">
                <span>{OP_LABELS[op.operation_type] ?? op.operation_type}{amount > 0 ? ` · ${formatCurrency(amount)}` : ''}</span>
                <span className="text-slate-400 font-medium">{new Date(op.local_timestamp).toLocaleString('es-CO')}</span>
              </div>
              <p className="text-rose-600 mt-0.5 break-words">
                {op.error_message || 'Error desconocido'} {op.retry_count ? `(${op.retry_count} intentos)` : ''}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <button
          onClick={retry}
          disabled={!isOnline || isSyncing || busy}
          className="flex-1 text-xs font-semibold flex items-center justify-center bg-amber-600 text-white px-3 py-2 rounded-xl disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 mr-1.5 ${isSyncing || busy ? 'animate-spin' : ''}`} />
          Reintentar
        </button>
        <button
          onClick={() => downloadUnsyncedBackup()}
          className="text-xs font-semibold flex items-center justify-center bg-white border border-amber-200 text-amber-800 px-3 py-2 rounded-xl"
        >
          <Download className="w-3 h-3 mr-1.5" />
          Respaldo
        </button>
      </div>
    </div>
  );
}
