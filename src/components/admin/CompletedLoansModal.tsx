import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, RefreshCw, X, Wallet, UserRound, CalendarDays, Search, History, CalendarRange } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { colombiaToday } from '@/lib/dailyCollection';

interface CompletedLoansModalProps {
  isOpen: boolean;
  onClose: () => void;
  loans: any[]; // préstamos de HOY (desde el dashboard)
  routes: { id: string; ruta: string }[];
  initialRouteId?: string;
  isLoading: boolean;
  formatCurrency: (amount: number) => string;
}

type Tab = 'today' | 'history';

export function CompletedLoansModal({
  isOpen,
  onClose,
  loans,
  routes,
  initialRouteId = 'all',
  isLoading,
  formatCurrency,
}: CompletedLoansModalProps) {
  const [tab, setTab] = useState<Tab>('today');
  const [routeFilter, setRouteFilter] = useState(initialRouteId);

  // Historial
  const [histSearch, setHistSearch] = useState('');
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histRouteFilter, setHistRouteFilter] = useState('all');
  const [histLoans, setHistLoans] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histSearched, setHistSearched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRouteFilter(initialRouteId);
      setTab('today');
      setHistSearch('');
      setHistFrom('');
      setHistTo('');
      setHistRouteFilter('all');
      setHistLoans([]);
      setHistSearched(false);
    }
  }, [isOpen, initialRouteId]);

  const routeName = (id?: string | null) =>
    routes.find((r) => r.id === id)?.ruta || 'Sin ruta';

  const visibleLoans =
    routeFilter === 'all' ? loans : loans.filter((l: any) => l.route_id === routeFilter);

  const dateLabel = (value?: string | null) =>
    value
      ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      : 'No registrada';

  const handleHistSearch = useCallback(async () => {
    setHistLoading(true);
    setHistSearched(true);
    try {
      const rows = await AdminService.getCompletedLoans(
        histRouteFilter,
        false,
        histSearch || undefined,
        histFrom || undefined,
        histTo || undefined
      );
      setHistLoans(rows);
    } catch {
      setHistLoans([]);
    } finally {
      setHistLoading(false);
    }
  }, [histSearch, histFrom, histTo, histRouteFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        aria-label="Cerrar"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <section className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <header className="px-6 py-5 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Préstamos Terminados</h2>
              <p className="text-sm text-slate-500">
                {tab === 'today'
                  ? `Salientes del día · ${colombiaToday()}`
                  : 'Buscar en el historial completo'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0 bg-white">
          <button
            onClick={() => setTab('today')}
            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${tab === 'today'
                ? 'border-emerald-500 text-emerald-700 bg-emerald-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
          >
            <CalendarDays className="w-4 h-4" />
            Terminados hoy
            {!isLoading && (
              <span className={`ml-1 text-xs font-black px-2 py-0.5 rounded-full ${tab === 'today' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}>
                {loans.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors border-b-2 ${tab === 'history'
                ? 'border-indigo-500 text-indigo-700 bg-indigo-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
          >
            <History className="w-4 h-4" />
            Buscar historial
          </button>
        </div>

        {/* TAB HOY */}
        {tab === 'today' && (
          <>
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap shrink-0 bg-white">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                Ruta:
                <select
                  value={routeFilter}
                  onChange={(e) => setRouteFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500 text-sm"
                >
                  <option value="all">Todas las rutas</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>{r.ruta}</option>
                  ))}
                </select>
              </label>
              <span className="text-sm font-bold text-emerald-700">
                {visibleLoans.length} préstamo{visibleLoans.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {isLoading && (
                <div className="py-10 text-center text-slate-500">Cargando…</div>
              )}
              {!isLoading && visibleLoans.map((loan: any) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  routeName={routeName}
                  dateLabel={dateLabel}
                  formatCurrency={formatCurrency}
                />
              ))}
              {!isLoading && visibleLoans.length === 0 && (
                <EmptyState message="No hubo préstamos terminados hoy" />
              )}
            </div>
          </>
        )}

        {/* TAB HISTORIAL */}
        {tab === 'history' && (
          <>
            <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nombre, cédula o teléfono del cliente…"
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHistSearch()}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  Ruta:
                  <select
                    value={histRouteFilter}
                    onChange={(e) => setHistRouteFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400 text-sm"
                  >
                    <option value="all">Todas</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>{r.ruta}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600 font-semibold">
                  <CalendarRange className="w-4 h-4 text-indigo-500" />
                  Desde:
                  <input
                    type="date"
                    value={histFrom}
                    onChange={(e) => setHistFrom(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 font-semibold">
                  Hasta:
                  <input
                    type="date"
                    value={histTo}
                    onChange={(e) => setHistTo(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50"
                  />
                </div>

                <button
                  onClick={handleHistSearch}
                  disabled={histLoading}
                  className="ml-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                >
                  <Search className="w-4 h-4" />
                  {histLoading ? 'Buscando…' : 'Buscar'}
                </button>
              </div>

              {histSearched && !histLoading && (
                <p className="text-xs text-slate-500">
                  {histLoans.length} resultado{histLoans.length !== 1 ? 's' : ''} encontrado{histLoans.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {histLoading && (
                <div className="py-10 text-center">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                </div>
              )}
              {!histLoading && histSearched && histLoans.map((loan: any) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  routeName={routeName}
                  dateLabel={dateLabel}
                  formatCurrency={formatCurrency}
                />
              ))}
              {!histLoading && histSearched && histLoans.length === 0 && (
                <EmptyState message="No se encontraron resultados con los filtros aplicados" />
              )}
              {!histSearched && !histLoading && (
                <div className="py-12 text-center">
                  <History className="w-10 h-10 mx-auto text-indigo-200 mb-3" />
                  <p className="font-bold text-slate-500">Busca en el historial</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Ingresa un nombre, cédula, rango de fechas o ruta y presiona <strong>Buscar</strong>.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// Tarjeta de préstamo
function LoanCard({
  loan,
  routeName,
  dateLabel,
  formatCurrency,
}: {
  loan: any;
  routeName: (id?: string | null) => string;
  dateLabel: (v?: string | null) => string;
  formatCurrency: (n: number) => string;
}) {
  const client = Array.isArray(loan.client) ? loan.client[0] : loan.client;
  const refinanced = loan.status === 'REFINANCIADO';
  const next = loan.newLoan;

  return (
    <article className="border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap gap-2 justify-between items-start">
        <div className="flex gap-2 items-start">
          <UserRound className="w-5 h-5 text-slate-400 mt-0.5" />
          <div>
            <h3 className="font-extrabold text-slate-800">{client?.full_name || 'Cliente sin nombre'}</h3>
            <span className="inline-block mt-0.5 mb-0.5 text-[11px] font-bold rounded-md bg-indigo-50 text-indigo-700 px-2 py-0.5">
              Ruta: {routeName(loan.route_id)}
            </span>
            <p className="text-xs text-slate-500">
              Doc: {client?.document_id || 'No registrado'}
              {client?.phone ? ` · ${client.phone}` : ''}
            </p>
          </div>
        </div>
        <span className={`text-xs font-extrabold rounded-full px-3 py-1 ${refinanced ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {refinanced ? 'PRÉSTAMO REFINANCIADO' : 'PAGO COMPLETADO'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-500">Valor solicitado</p>
          <p className="font-black text-slate-800">{formatCurrency(Number(loan.amount_requested || 0))}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-500">Total pagado</p>
          <p className="font-black text-emerald-700">
            {formatCurrency(
              Number(loan.initial_obligation ?? loan.amount_requested ?? 0) - Number(loan.current_balance ?? 0)
            )}
          </p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-500">Fecha de cierre</p>
          <p className="font-bold text-slate-800 flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            {dateLabel(loan.completed_on || loan.completed_at || loan.end_date || loan.created_at)}
          </p>
        </div>
      </div>

      {next && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-blue-800 font-extrabold text-sm">
            <RefreshCw className="w-4 h-4" /> Nuevo préstamo del cliente
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-sm">
            <div>
              <p className="text-xs text-blue-600">Valor entregado</p>
              <p className="font-black text-blue-900">{formatCurrency(Number(next.amount_delivered ?? next.amount_requested ?? 0))}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600">Estado actual</p>
              <p className="font-bold text-blue-900">{next.status}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600">Fecha</p>
              <p className="font-bold text-blue-900">{dateLabel(next.disbursement_date || next.created_at)}</p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <Wallet className="w-10 h-10 mx-auto text-slate-300 mb-3" />
      <p className="font-bold text-slate-600">{message}</p>
      <p className="text-sm text-slate-400 mt-1">Los registros se conservan en el historial.</p>
    </div>
  );
}
