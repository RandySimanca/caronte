import { useMemo, useState } from 'react';
import { AlertTriangle, Phone, Search, X } from 'lucide-react';
import { expiredLabel } from '@/lib/expiredLoan';

export interface ExpiredLoanRow {
  loanId: string;
  clientId: string;
  clientName: string;
  phone: string | null;
  routeId: string;
  endDate: string; // YYYY-MM-DD
  daysExpired: number;
  balance: number;
  dailyInstallment: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  loans: ExpiredLoanRow[];
  routes: { id: string; ruta: string }[];
  routeLabel?: string;
  isLoading: boolean;
  formatCurrency: (amount: number) => string;
}

const formatDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export function ExpiredLoansModal({ isOpen, onClose, loans, routes, routeLabel, isLoading, formatCurrency }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? loans.filter(l => l.clientName.toLowerCase().includes(term)) : loans;
  }, [loans, search]);

  if (!isOpen) return null;

  const routeName = (id: string) => routes.find(r => r.id === id)?.ruta || '—';
  const totalBalance = filtered.reduce((s, l) => s + l.balance, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button aria-label="Cerrar" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <section className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <header className="px-6 py-5 border-b border-rose-100 bg-rose-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Préstamos Vencidos</h2>
              <p className="text-sm text-slate-500">
                Ya pasó su fecha final y siguen activos · {routeLabel || 'Todas las rutas'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors" aria-label="Cerrar ventana">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-6 py-4 border-b border-slate-100 shrink-0 space-y-3">
          <div className="flex gap-3">
            <div className="bg-rose-50 rounded-xl px-4 py-2 flex-1">
              <p className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Clientes</p>
              <p className="text-xl font-black text-rose-700">{filtered.length}</p>
            </div>
            <div className="bg-rose-50 rounded-xl px-4 py-2 flex-1">
              <p className="text-[10px] uppercase font-bold tracking-wider text-rose-500">Saldo pendiente</p>
              <p className="text-xl font-black text-rose-700">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-50">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">{search ? 'Sin resultados' : 'No hay préstamos vencidos'}</p>
            </div>
          ) : (
            filtered.map(l => (
              <div key={l.loanId} className="px-6 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{l.clientName}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {routeName(l.routeId)} · Venció el {formatDate(l.endDate)}
                  </p>
                  {l.phone && (
                    <a href={`tel:${l.phone}`} className="text-xs text-slate-500 inline-flex items-center gap-1 mt-0.5 hover:text-rose-600">
                      <Phone className="w-3 h-3" /> {l.phone}
                    </a>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block text-[11px] font-bold text-white bg-rose-600 px-2 py-0.5 rounded-md">
                    {expiredLabel(l.daysExpired)}
                  </span>
                  <p className="text-sm font-black text-slate-800 mt-1">{formatCurrency(l.balance)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
