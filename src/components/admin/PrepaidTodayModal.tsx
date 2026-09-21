import { X, CalendarCheck, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import { PaymentCardModal } from './PaymentCardModal';

export interface PrepaidClient {
  loanId: string;
  clientName: string;
  amount: number;
  paidDate: string; // YYYY-MM-DD
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clients: PrepaidClient[];
}

export function PrepaidTodayModal({ isOpen, onClose, clients }: Props) {
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE dd 'de' MMMM", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const totalPrepaid = clients.reduce((s, c) => s + c.amount, 0);

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
          className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden z-10"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 pt-5 pb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">Cuotas adelantadas hoy</h2>
                  <p className="text-indigo-200 text-xs">Pagadas en días anteriores</p>
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
            <div className="flex gap-2 mt-2">
              <div className="bg-white/15 rounded-xl px-3 py-1.5">
                <p className="text-indigo-100 text-[10px] uppercase font-bold tracking-wider">Clientes</p>
                <p className="text-white text-xl font-black">{clients.length}</p>
              </div>
              <div className="bg-white/15 rounded-xl px-3 py-1.5">
                <p className="text-indigo-100 text-[10px] uppercase font-bold tracking-wider">Monto liberado</p>
                <p className="text-white text-xl font-black">{formatCurrency(totalPrepaid)}</p>
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-2.5">
            <p className="text-xs text-indigo-700 font-medium">
              Estos clientes <strong>no deben pagar hoy</strong> — su cuota ya fue cubierta en días anteriores.
              El monto liberado ya fue descontado del total por recoger.
            </p>
          </div>

          {/* Client list */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {clients.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Sin cuotas adelantadas para hoy</p>
              </div>
            ) : (
              clients.map((client, idx) => (
                <div 
                  key={idx} 
                  onClick={() => setSelectedLoanId(client.loanId)}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate hover:text-indigo-600 transition-colors">{client.clientName}</p>
                    <p className="text-xs text-slate-400 capitalize">
                      Pagó el {formatDate(client.paidDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-indigo-600">{formatCurrency(client.amount)}</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                      Adelantado
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100">
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
