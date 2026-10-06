import { useState, useEffect } from 'react';
import { X, Banknote, User, Calendar } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { AdminService } from '@/services/AdminService';
import { colombiaDateFromIso } from '@/lib/dailyCollection';

export interface NewLoanTodayClient {
  loanId: string;
  clientId: string;
  clientName: string;
  amount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clients: NewLoanTodayClient[];
  routeId?: string;
  onClientClick?: (clientId: string) => void;
}

export function NewLoansTodayModal({ isOpen, onClose, clients, routeId = 'all', onClientClick }: Props) {
  const navigate = useNavigate();
  const todayStr = colombiaDateFromIso(new Date().toISOString());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [list, setList] = useState<NewLoanTodayClient[]>(clients);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(todayStr);
      setList(clients);
    }
  }, [isOpen, clients]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedDate === todayStr) {
      setList(clients);
      return;
    }

    const fetchLoans = async () => {
      setIsLoading(true);
      try {
        const data = await AdminService.getNewLoansByDate(selectedDate, routeId);
        setList(data);
      } catch (error) {
        console.error('Error al cargar préstamos nuevos por fecha:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLoans();
  }, [selectedDate, isOpen, routeId]);

  if (!isOpen) return null;

  const totalDelivered = list.reduce((s, c) => s + c.amount, 0);

  const openClient = (clientId: string) => {
    if (onClientClick) {
      onClose();
      onClientClick(clientId);
      return;
    }
    onClose();
    navigate(`/client/${clientId}`);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden z-10"
        >
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 pt-5 pb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">Préstamos nuevos</h2>
                  <p className="text-emerald-100 text-xs">
                    {selectedDate === todayStr ? 'Desembolsados el día de hoy' : `Desembolsados el ${selectedDate}`}
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

            {/* Date picker inside modal header */}
            <div className="mb-3 flex items-center justify-between bg-white/15 backdrop-blur-md rounded-xl px-3 py-1.5 text-white text-xs font-bold">
              <span className="flex items-center gap-1.5 text-emerald-100">
                <Calendar className="w-3.5 h-3.5" />
                Fecha:
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer border border-white/30 rounded-lg px-2 py-0.5"
              />
            </div>

            <div className="flex gap-2">
              <div className="bg-white/15 rounded-xl px-3 py-1.5 flex-1">
                <p className="text-emerald-100 text-[10px] uppercase font-bold tracking-wider">Cantidad</p>
                <p className="text-white text-xl font-black">{isLoading ? '...' : list.length}</p>
              </div>
              <div className="bg-white/15 rounded-xl px-3 py-1.5 flex-1">
                <p className="text-emerald-100 text-[10px] uppercase font-bold tracking-wider">Valor entregado</p>
                <p className="text-white text-xl font-black">{isLoading ? '...' : formatCurrency(totalDelivered)}</p>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-2.5">
            <p className="text-xs text-emerald-700 font-medium">
              Estos clientes recibieron un préstamo nuevo en la fecha seleccionada.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {isLoading ? (
              <div className="py-10 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs font-medium">Cargando préstamos...</p>
              </div>
            ) : list.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Banknote className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Sin préstamos nuevos para esta fecha</p>
              </div>
            ) : (
              list.map((client) => (
                <button
                  key={client.loanId}
                  type="button"
                  onClick={() => openClient(client.clientId)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{client.clientName}</p>
                    <p className="text-xs text-slate-400">Préstamo nuevo</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-emerald-600">{formatCurrency(client.amount)}</p>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                      Nuevo
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

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
  );
}

