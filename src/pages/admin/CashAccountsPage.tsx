import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HandCoins, ArrowLeft, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { CashLedgerService, type CollectorAccountSummary } from '@/services/CashLedgerService';
import { CollectorCashAccountModal } from '@/components/admin/CollectorCashAccountModal';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { colombiaToday } from '@/lib/dailyCollection';
import { daysBetween } from '@/lib/cashLedger';
import { formatCurrency } from '@/lib/utils';

/** Cobradores con faltante por reponer o sobrante por aclarar. */
export function CashAccountsPage() {
  const [accounts, setAccounts] = useState<CollectorAccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<CollectorAccountSummary | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      setAccounts(await CashLedgerService.getAccountsWithBalance());
    } catch (error: any) {
      if (!silent) toast.error(error.message || 'Error al cargar las cuentas de efectivo');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(() => load(true), { tables: ['collector_cash_ledger'] });

  const today = colombiaToday();
  const totalDebt = accounts.reduce((sum, a) => sum + a.debt, 0);
  const totalSurplus = accounts.reduce((sum, a) => sum + a.surplus, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <Link to="/admin/liquidations" className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Liquidaciones
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <HandCoins className="w-7 h-7" />
            </div>
            Cuentas de efectivo
          </h1>
          <p className="text-slate-500 mt-2">Faltantes que los cobradores deben reponer y sobrantes que aún no tienen dueño.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4">
            <p className="text-xs font-bold text-slate-500">Total por reponer</p>
            <p className="text-2xl font-black text-rose-600">{formatCurrency(totalDebt)}</p>
          </div>
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs font-bold text-slate-500">Total sobrante por aclarar</p>
            <p className="text-2xl font-black text-amber-600">{formatCurrency(totalSurplus)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-500 font-medium flex flex-col items-center gap-2">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
            Todas las cajas están al día: no hay faltantes ni sobrantes pendientes.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map(a => {
              const age = a.oldestSurplusDate ? daysBetween(a.oldestSurplusDate, today) : null;
              return (
                <li key={a.collectorId}>
                  <button
                    type="button"
                    onClick={() => setSelected(a)}
                    className="w-full text-left p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 hover:bg-brand-50/50 transition-colors"
                  >
                    <span className="font-bold text-slate-800">{a.collectorName}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      {a.debt > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-sm font-bold">
                          Debe {formatCurrency(a.debt)}
                        </span>
                      )}
                      {a.surplus > 0 && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-sm font-bold">
                          Sobrante {formatCurrency(a.surplus)}
                          {age !== null && ` · hace ${age} ${age === 1 ? 'día' : 'días'}`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CollectorCashAccountModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        collectorId={selected?.collectorId ?? null}
        collectorName={selected?.collectorName ?? ''}
        onChanged={() => load(true)}
      />
    </div>
  );
}
