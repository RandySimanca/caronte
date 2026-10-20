import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, X, Wallet, UserRound, CalendarDays } from 'lucide-react';

interface CompletedLoansModalProps {
  isOpen: boolean;
  onClose: () => void;
  loans: any[];
  routes: { id: string; ruta: string }[];
  initialRouteId?: string;
  isLoading: boolean;
  formatCurrency: (amount: number) => string;
}

export function CompletedLoansModal({ isOpen, onClose, loans, routes, initialRouteId = 'all', isLoading, formatCurrency }: CompletedLoansModalProps) {
  const [routeFilter, setRouteFilter] = useState(initialRouteId);

  // Al abrir, arrancar con la ruta que está seleccionada en el dashboard
  useEffect(() => {
    if (isOpen) setRouteFilter(initialRouteId);
  }, [isOpen, initialRouteId]);

  if (!isOpen) return null;

  const routeName = (id?: string | null) => routes.find((r) => r.id === id)?.ruta || 'Sin ruta';
  const visibleLoans = routeFilter === 'all' ? loans : loans.filter((l: any) => l.route_id === routeFilter);

  const dateLabel = (value?: string | null) => value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO')
    : 'No registrada';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button aria-label="Cerrar" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <section className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <header className="px-6 py-5 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
            <div><h2 className="text-lg font-black text-slate-800">Préstamos terminados</h2><p className="text-sm text-slate-500">Clientes que finalizaron o refinanciaron su préstamo</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white text-slate-500" aria-label="Cerrar ventana"><X className="w-5 h-5" /></button>
        </header>
        <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            Ruta:
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="all">Todas las rutas</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.ruta}</option>)}
            </select>
          </label>
          <span className="text-sm font-bold text-emerald-700">{visibleLoans.length} préstamo{visibleLoans.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          {isLoading && <div className="py-10 text-center text-slate-500">Cargando historial…</div>}
          {!isLoading && visibleLoans.map((loan: any) => {
            const client = Array.isArray(loan.client) ? loan.client[0] : loan.client;
            const refinanced = loan.status === 'REFINANCIADO';
            const next = loan.newLoan;
            return <article key={loan.id} className="border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap gap-2 justify-between items-start">
                <div className="flex gap-2 items-start"><UserRound className="w-5 h-5 text-slate-400 mt-0.5" /><div><h3 className="font-extrabold text-slate-800">{client?.full_name || 'Cliente sin nombre'}</h3><span className="inline-block mt-0.5 mb-0.5 text-[11px] font-bold rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5">Ruta: {routeName(loan.route_id)}</span><p className="text-xs text-slate-500">Documento: {client?.document_id || 'No registrado'}{client?.phone ? ` · ${client.phone}` : ''}</p></div></div>
                <span className={`text-xs font-extrabold rounded-full px-3 py-1 ${refinanced ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{refinanced ? 'PRÉSTAMO REFINANCIADO' : 'PAGO COMPLETADO'}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Valor solicitado</p><p className="font-black text-slate-800">{formatCurrency(Number(loan.amount_requested || 0))}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Total pagado</p><p className="font-black text-emerald-700">{formatCurrency(Number(loan.initial_obligation ?? loan.amount_requested ?? 0) - Number(loan.current_balance ?? 0))}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">Fecha de cierre</p><p className="font-bold text-slate-800 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{dateLabel(loan.end_date || loan.created_at)}</p></div>
              </div>
              {next && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center gap-2 text-blue-800 font-extrabold text-sm"><RefreshCw className="w-4 h-4" /> Nuevo préstamo del cliente</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-sm"><div><p className="text-xs text-blue-600">Valor entregado</p><p className="font-black text-blue-900">{formatCurrency(Number(next.amount_delivered ?? next.amount_requested ?? 0))}</p></div><div><p className="text-xs text-blue-600">Estado actual</p><p className="font-bold text-blue-900">{next.status}</p></div><div><p className="text-xs text-blue-600">Fecha</p><p className="font-bold text-blue-900">{dateLabel(next.disbursement_date || next.created_at)}</p></div></div>
              </div>}
            </article>;
          })}
          {!isLoading && visibleLoans.length === 0 && <div className="py-12 text-center"><Wallet className="w-10 h-10 mx-auto text-slate-300 mb-3" /><p className="font-bold text-slate-600">Todavía no hay préstamos terminados</p><p className="text-sm text-slate-400 mt-1">Cuando un préstamo se marque como cancelado o refinanciado aparecerá aquí.</p></div>}
        </div>
      </section>
    </div>
  );
}
