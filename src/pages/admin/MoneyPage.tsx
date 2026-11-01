import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Ban, ArrowDownToLine, UserCheck, Wallet, ArrowUpFromLine } from 'lucide-react';
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

const inputCls =
  'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none';

/** Primer y último día de un mes YYYY-MM. */
function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from, to: addDays(nextMonth, -1) };
}

/** Vista "Dinero": ingresos a la ruta, pagos a cobradores y retiros, con su historial. */
export function MoneyPage() {
  const adminId = useAuthStore(state => state.user?.id);

  const [routes, setRoutes] = useState<{ id: string; ruta: string }[]>([]);
  const [routeFilter, setRouteFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<'all' | CapitalKind>('all');
  const [month, setMonth] = useState(() => colombiaToday().slice(0, 7));
  const [movements, setMovements] = useState<CapitalMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formKind, setFormKind] = useState<CapitalKind | null>(null);

  const totals = useMemo(() => summarize(movements), [movements]);
  const externalPaid = useMemo(
    () => summarize(movements.filter(m => m.source === 'EXTERNO')).retiros,
    [movements],
  );

  const load = useCallback(async (silent = false) => {
    if (!month) return;
    if (!silent) setIsLoading(true);
    try {
      const { from, to } = monthRange(month);
      setMovements(await CapitalMovementService.list({
        routeId: routeFilter,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        from,
        to,
        includeVoided: true,
      }));
    } catch (error: any) {
      if (!silent) toast.error(error.message || 'Error al cargar los movimientos');
    } finally {
      setIsLoading(false);
    }
  }, [month, routeFilter, kindFilter]);

  useEffect(() => {
    AdminService.getRouteStates()
      .then(list => setRoutes((list as any[]).map(r => ({ id: r.id, ruta: r.ruta }))))
      .catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load]);

  useRealtimeRefresh(() => load(true), { tables: ['route_capital_movements'] });

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Landmark className="w-7 h-7" />
            </div>
            Dinero
          </h1>
          <p className="text-slate-500 mt-2">
            Ingresos a la ruta, pagos a cobradores y retiros. Lo que sale de la ruta baja la base de la
            liquidación desde su fecha; lo que pagas con otro dinero no la toca.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFormKind('APORTE_CAPITAL')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl"
          >
            <ArrowDownToLine className="w-4 h-4" /> Ingreso a la ruta
          </button>
          <button
            onClick={() => setFormKind('SALARIO_COBRADOR')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl"
          >
            <UserCheck className="w-4 h-4" /> Pago a cobrador
          </button>
          <button
            onClick={() => setFormKind('SALARIO_ADMIN')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl"
          >
            <Wallet className="w-4 h-4" /> Mi salario
          </button>
          <button
            onClick={() => setFormKind('RETIRO_OTRO')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl"
          >
            <ArrowUpFromLine className="w-4 h-4" /> Otro retiro
          </button>
        </div>

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
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Tipo</label>
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value as 'all' | CapitalKind)} className={inputCls}>
              <option value="all">Todos</option>
              {(Object.keys(KIND_LABELS) as CapitalKind[]).map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-xs font-bold text-slate-500">Ingresos a la ruta</p>
            <p className="text-xl font-black text-emerald-600">{formatCurrency(totals.aportes)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500">Pagos a cobradores</p>
            <p className="text-xl font-black text-slate-700">{formatCurrency(totals.salarioCobrador)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500">Mi salario</p>
            <p className="text-xl font-black text-slate-700">{formatCurrency(totals.salarioAdmin)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-bold text-slate-500">Otros retiros</p>
            <p className="text-xl font-black text-slate-700">{formatCurrency(totals.otrosRetiros)}</p>
          </div>
        </div>
        {externalPaid > 0 && (
          <p className="text-xs text-slate-500 -mt-2">
            De los pagos de salario, {formatCurrency(externalPaid)} se pagaron con otro dinero y no tocan la ruta.
          </p>
        )}
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-3">
        <h2 className="text-sm font-black text-slate-700">Movimientos</h2>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : movements.length === 0 ? (
          <p className="text-sm text-slate-500">No hay movimientos con estos filtros.</p>
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
                      {m.source === 'EXTERNO' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">OTRO DINERO</span>
                      )}
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

      <CapitalMovementFormModal
        isOpen={formKind !== null}
        kind={formKind ?? 'APORTE_CAPITAL'}
        onClose={() => setFormKind(null)}
        onSaved={() => load(true)}
      />
    </div>
  );
}
