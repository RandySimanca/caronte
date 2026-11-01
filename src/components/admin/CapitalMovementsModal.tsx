import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Landmark, Ban, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminService } from '@/services/AdminService';
import { CapitalMovementService } from '@/services/CapitalMovementService';
import { CapitalMovementFormModal } from '@/components/admin/CapitalMovementFormModal';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useAuthStore } from '@/stores/authStore';
import { colombiaToday } from '@/lib/dailyCollection';
import { Swal } from '@/lib/swal';
import { formatCurrency } from '@/lib/utils';
import {
  KIND_LABELS,
  addDays,
  isOutflow,
  periodLabel,
  summarize,
  type CapitalKind,
  type CapitalMovement,
} from '@/lib/capitalMovements';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const inputCls =
  'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none';

/** Primer y último día de un mes YYYY-MM. */
function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from, to: addDays(nextMonth, -1) };
}

export function CapitalMovementsModal({ isOpen, onClose }: Props) {
  const adminId = useAuthStore(state => state.user?.id);

  const [routes, setRoutes] = useState<{ id: string; ruta: string }[]>([]);
  const [routeFilter, setRouteFilter] = useState('all');
  const [month, setMonth] = useState(() => colombiaToday().slice(0, 7));
  const [movements, setMovements] = useState<CapitalMovement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formKind, setFormKind] = useState<CapitalKind | null>(null);

  const totals = useMemo(() => summarize(movements), [movements]);

  const load = useCallback(async (silent = false) => {
    if (!month) return;
    if (!silent) setIsLoading(true);
    try {
      const { from, to } = monthRange(month);
      setMovements(await CapitalMovementService.list({ routeId: routeFilter, from, to, includeVoided: true }));
    } catch (error: any) {
      if (!silent) toast.error(error.message || 'Error al cargar los movimientos');
    } finally {
      setIsLoading(false);
    }
  }, [month, routeFilter]);

  useEffect(() => {
    if (!isOpen) return;
    AdminService.getRouteStates()
      .then(list => setRoutes((list as any[]).map(r => ({ id: r.id, ruta: r.ruta }))))
      .catch(() => undefined);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  useRealtimeRefresh(() => load(true), { tables: ['route_capital_movements'], enabled: isOpen });

  const askVoid = async (m: CapitalMovement) => {
    if (!adminId) return;
    const result = await Swal.fire({
      title: 'Anular movimiento',
      html: `${KIND_LABELS[m.kind]} por <strong>${formatCurrency(m.amount)}</strong> del ${m.movement_date}`,
      input: 'text',
      inputLabel: 'Motivo de la anulación (obligatorio)',
      inputValidator: (value: string) =>
        !value || value.trim().length < 3 ? 'Escribe el motivo (mínimo 3 caracteres)' : undefined,
      showCancelButton: true,
      confirmButtonText: 'Anular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      customClass: { popup: 'swal-caronte-popup', title: 'swal-caronte-title' },
    });
    if (!result.isConfirmed) return;
    try {
      await CapitalMovementService.voidMovement({ id: m.id, reason: String(result.value), adminId });
      toast.success('Movimiento anulado');
      load(true);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo anular el movimiento');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4">
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-xl w-full max-w-3xl max-h-[min(92dvh,920px)] flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-800 truncate">Capital y pagos de salario</h3>
                <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">
                  Lo que pones o sacas de la plata de la ruta
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFormKind('APORTE_CAPITAL')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl"
              >
                <Plus className="w-4 h-4" /> Agregar capital
              </button>
              <button
                onClick={() => setFormKind('SALARIO_ADMIN')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl"
              >
                Retirar mi salario
              </button>
            </div>
            <p className="text-xs text-slate-500 -mt-2">
              El salario del cobrador se paga desde Usuarios, en su nómina. Todo lo que registres sube o baja la base
              de la liquidación desde su fecha.
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mes</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ruta</label>
                <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)} className={inputCls}>
                  <option value="all">Todas las rutas</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.ruta}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-xs font-bold text-slate-500">Capital agregado</p>
                <p className="text-xl font-black text-emerald-600">{formatCurrency(totals.aportes)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-bold text-slate-500">Salario cobrador</p>
                <p className="text-xl font-black text-slate-700">{formatCurrency(totals.salarioCobrador)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-xs font-bold text-slate-500">Salario administrador</p>
                <p className="text-xl font-black text-slate-700">{formatCurrency(totals.salarioAdmin)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-black text-slate-700">Movimientos</h4>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                </div>
              ) : movements.length === 0 ? (
                <p className="text-sm text-slate-500">No hay movimientos en este mes.</p>
              ) : (
                <ul className="border border-slate-100 rounded-xl divide-y divide-slate-100">
                  {movements.map(m => {
                    const out = isOutflow(m.kind);
                    return (
                      <li key={m.id} className={`p-3 flex items-start justify-between gap-3 ${m.voided_at ? 'opacity-50' : ''}`}>
                        <div className="min-w-0 text-sm">
                          <p className="font-bold text-slate-800">
                            {KIND_LABELS[m.kind]}
                            {m.beneficiary_name && <span className="font-semibold text-slate-600"> · {m.beneficiary_name}</span>}
                            {m.voided_at && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">ANULADO</span>}
                          </p>
                          <p className="text-xs text-slate-500">
                            {m.movement_date}
                            {m.route_name && ` · ${m.route_name}`}
                            {m.period_month && ` · mes de ${periodLabel(m.period_month)}`}
                            {m.method && ` · ${m.method === 'EFECTIVO' ? 'efectivo' : 'transferencia'}`}
                            {m.creator_name && ` · ${m.creator_name}`}
                          </p>
                          {m.note && <p className="text-xs text-slate-500 break-words">“{m.note}”</p>}
                          {m.voided_at && m.void_reason && <p className="text-xs text-slate-500 break-words">Anulado: {m.void_reason}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-black ${out ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {out ? '−' : '+'} {formatCurrency(m.amount)}
                          </p>
                          {!m.voided_at && (
                            <button onClick={() => askVoid(m)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600">
                              <Ban className="w-3 h-3" /> Anular
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <CapitalMovementFormModal
        isOpen={formKind !== null}
        kind={formKind ?? 'APORTE_CAPITAL'}
        onClose={() => setFormKind(null)}
        onSaved={() => load(true)}
      />
    </>
  );
}
