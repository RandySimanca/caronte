import { X, CheckCircle2, ArrowUpRight, Building2, Smartphone } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { PaymentCardModal } from './PaymentCardModal';

export interface PaidTodayEntry {
  loanId: string;
  clientName: string;
  amount: number;
  collectedAt: string; // ISO timestamp
  isTransfer?: boolean;
  isOffice?: boolean;     // cobrado desde panel admin
  collectorName?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entries: PaidTodayEntry[];
  /** Si se pasa, se muestra como título del modo admin con nombre de ruta */
  routeLabel?: string;
}

export function PaidTodayModal({ isOpen, onClose, entries, routeLabel }: Props) {
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatTime = (iso: string) => {
    try {
      return format(parseISO(iso), 'hh:mm a', { locale: es });
    } catch {
      return '—';
    }
  };

  const totalRecaudado = entries.reduce((s, e) => s + e.amount, 0);
  const totalTransferencias = entries.filter(e => e.isTransfer).reduce((s, e) => s + e.amount, 0);
  const totalEfectivo = totalRecaudado - totalTransferencias;

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90dvh]"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 pt-5 pb-6 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white leading-tight">Cobros del día</h2>
                    <p className="text-emerald-200 text-xs">
                      {routeLabel ? `Ruta: ${routeLabel}` : 'Pagos recibidos hoy'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary chips */}
              <div className="flex gap-2 flex-wrap mt-2">
                <div className="bg-white/15 rounded-xl px-3 py-1.5">
                  <p className="text-emerald-100 text-[10px] uppercase font-bold tracking-wider">Cobros</p>
                  <p className="text-white text-xl font-black">{entries.length}</p>
                </div>
                <div className="bg-white/15 rounded-xl px-3 py-1.5">
                  <p className="text-emerald-100 text-[10px] uppercase font-bold tracking-wider">Efectivo</p>
                  <p className="text-white text-lg font-black">{formatCurrency(totalEfectivo)}</p>
                </div>
                {totalTransferencias > 0 && (
                  <div className="bg-white/15 rounded-xl px-3 py-1.5">
                    <p className="text-emerald-100 text-[10px] uppercase font-bold tracking-wider">Transferencia</p>
                    <p className="text-white text-lg font-black">{formatCurrency(totalTransferencias)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Total banner */}
            <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-2.5 shrink-0 flex items-center justify-between">
              <p className="text-xs text-emerald-700 font-bold uppercase tracking-wide">Total recaudado</p>
              <p className="text-emerald-800 font-black text-base">{formatCurrency(totalRecaudado)}</p>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 overscroll-contain">
              {entries.length === 0 ? (
                <div className="py-14 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Aún no hay cobros registrados hoy</p>
                </div>
              ) : (
                [...entries]
                  .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())
                  .map((entry, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedLoanId(entry.loanId)}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer active:bg-emerald-50"
                    >
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        entry.isOffice
                          ? 'bg-blue-100'
                          : entry.isTransfer
                            ? 'bg-indigo-100'
                            : 'bg-emerald-100'
                      }`}>
                        {entry.isOffice ? (
                          <Building2 className="w-4 h-4 text-blue-600" />
                        ) : entry.isTransfer ? (
                          <ArrowUpRight className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Smartphone className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{entry.clientName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-400">{formatTime(entry.collectedAt)}</span>
                          {entry.isOffice && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">Oficina</span>
                          )}
                          {entry.isTransfer && !entry.isOffice && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">Transferencia</span>
                          )}
                          {entry.collectorName && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{entry.collectorName}</span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-black ${
                          entry.isOffice ? 'text-blue-600' : entry.isTransfer ? 'text-indigo-600' : 'text-emerald-600'
                        }`}>
                          {formatCurrency(entry.amount)}
                        </p>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 shrink-0">
              <button
                onClick={onClose}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl py-3 transition-colors text-sm"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {selectedLoanId && (
        <PaymentCardModal
          isOpen={!!selectedLoanId}
          onClose={() => setSelectedLoanId(null)}
          loanId={selectedLoanId}
        />
      )}
    </>
  );
}
