import { useEffect, useMemo, useState } from 'react';
import { X, Search, CheckCheck, Phone } from 'lucide-react';

/** Un préstamo terminado (pagado) que entra en el cálculo de ganancias reales. */
export interface CompletedProfitLoan {
  id: string;
  clientName: string;
  documentId: string;
  phone: string | null;
  routeId: string | null;
  amountRequested: number;   // lo prestado (capital)
  amountDelivered: number;   // lo que realmente se le entregó al cliente
  collected: number;         // lo recaudado (cobros + domingos prepagados)
  profit: number;            // recaudado − prestado
  disbursementDate: string | null; // YYYY-MM-DD
  completedOn: string | null;      // YYYY-MM-DD (día del último cobro)
  daysToFinish: number | null;
  isRefinanced: boolean;     // terminó por refinanciación (no por pago directo)
  refinancedBalance: number; // saldo recogido al refinanciar (incluido en "collected")
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  loans: CompletedProfitLoan[];
  routes: { id: string; ruta: string }[];
  periodLabel: string;
  formatCurrency: (amount: number) => string;
}

const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');

function RefinancedBadge({ amount, formatCurrency }: { amount: number; formatCurrency: (n: number) => string }) {
  return (
    <span
      className="inline-block ml-2 align-middle px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[10px] font-black uppercase tracking-wide"
      title={`Terminó por refinanciación. Saldo recogido: ${formatCurrency(amount)}`}
    >
      Refinanciado
    </span>
  );
}

export function CompletedLoansProfitModal({ isOpen, onClose, loans, routes, periodLabel, formatCurrency }: Props) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  const routeName = (id: string | null) => routes.find((r) => r.id === id)?.ruta || '—';

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return loans;
    return loans.filter(
      (l) =>
        l.clientName.toLowerCase().includes(term) ||
        (l.documentId || '').toLowerCase().includes(term) ||
        (l.phone || '').toLowerCase().includes(term)
    );
  }, [loans, search]);

  // Totales de lo que se está viendo (sin búsqueda = el total de la tarjeta)
  const totals = useMemo(() => {
    const capital = visible.reduce((s, l) => s + l.amountRequested, 0);
    const collected = visible.reduce((s, l) => s + l.collected, 0);
    return { capital, collected, profit: collected - capital };
  }, [visible]);

  if (!isOpen) return null;

  const profitClass = (n: number) => (n < 0 ? 'text-red-600' : 'text-emerald-700');

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[94dvh] md:max-h-[90vh]">
        {/* Encabezado */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-slate-800 leading-tight">Ganancias por cliente</h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium break-words">
                Préstamos terminados · {periodLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen: recaudado − prestado = ganado */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 grid grid-cols-3 gap-2 sm:gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-400">Prestado</p>
            <p className="text-sm sm:text-xl font-black text-slate-800 break-words">{formatCurrency(totals.capital)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-400">Recaudado</p>
            <p className="text-sm sm:text-xl font-black text-slate-800 break-words">{formatCurrency(totals.collected)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-400">Ganado</p>
            <p className={`text-sm sm:text-xl font-black break-words ${profitClass(totals.profit)}`}>{formatCurrency(totals.profit)}</p>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-100 flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, cédula o teléfono"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-brand-500"
            />
          </div>
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            {visible.length} de {loans.length}
          </span>
        </div>

        {/* Listado */}
        <div className="overflow-y-auto flex-1">
          {visible.length === 0 ? (
            <p className="py-16 px-4 text-center text-slate-400 font-medium">
              {loans.length === 0 ? 'No hay préstamos terminados en este período.' : 'No se encontraron clientes con esa búsqueda.'}
            </p>
          ) : (
            <>
              {/* Móvil: tarjetas */}
              <div className="md:hidden divide-y divide-slate-100">
                {visible.map((l) => (
                  <div key={l.id} className="px-4 py-3">
                    <p className="font-bold text-slate-800 break-words">
                      {l.clientName}
                      {l.isRefinanced && <RefinancedBadge amount={l.refinancedBalance} formatCurrency={formatCurrency} />}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 break-all">
                      <span className="font-mono">{l.documentId}</span>
                      {l.phone ? (
                        <>
                          {' · '}
                          <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-brand-600 font-semibold">
                            <Phone className="w-3 h-3" />
                            {l.phone}
                          </a>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {routeName(l.routeId)} · {fmtDate(l.disbursementDate)} → {fmtDate(l.completedOn)}
                      {l.daysToFinish !== null ? ` (${l.daysToFinish} días)` : ''}
                    </p>
                    {l.isRefinanced && (
                      <p className="text-xs text-violet-700 mt-1">
                        Incluye {formatCurrency(l.refinancedBalance)} de saldo recogido al refinanciar
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Prestado</p>
                        <p className="font-bold text-slate-700 break-words">{formatCurrency(l.amountRequested)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Recaudado</p>
                        <p className="font-bold text-slate-700 break-words">{formatCurrency(l.collected)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase text-slate-400">Ganado</p>
                        <p className={`font-black break-words ${profitClass(l.profit)}`}>{formatCurrency(l.profit)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Escritorio: tabla */}
              <table className="hidden md:table w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Teléfono</th>
                    <th className="py-3 px-4">Ruta</th>
                    <th className="py-3 px-4">Desembolso</th>
                    <th className="py-3 px-4">Terminó</th>
                    <th className="py-3 px-4 text-center">Días</th>
                    <th className="py-3 px-4 text-right">Prestado</th>
                    <th className="py-3 px-4 text-right">Recaudado</th>
                    <th className="py-3 px-4 text-right">Ganado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {visible.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-800">
                          {l.clientName}
                          {l.isRefinanced && <RefinancedBadge amount={l.refinancedBalance} formatCurrency={formatCurrency} />}
                        </p>
                        <p className="text-xs text-slate-500 font-mono">{l.documentId}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{l.phone || '—'}</td>
                      <td className="py-3 px-4 text-slate-600">{routeName(l.routeId)}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{fmtDate(l.disbursementDate)}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{fmtDate(l.completedOn)}</td>
                      <td className="py-3 px-4 text-center text-slate-600">{l.daysToFinish ?? '—'}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">{formatCurrency(l.amountRequested)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">{formatCurrency(l.collected)}</td>
                      <td className={`py-3 px-4 text-right font-black whitespace-nowrap ${profitClass(l.profit)}`}>{formatCurrency(l.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
