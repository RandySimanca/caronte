import { X, Calendar as CalendarIcon, CheckCircle, Clock } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';

interface CollectorPaymentCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  loanId: string;
}

export function CollectorPaymentCardModal({ isOpen, onClose, loanId }: CollectorPaymentCardModalProps) {
  const installments = useLiveQuery(
    () => loanId ? db.installments.where('loan_id').equals(loanId).sortBy('scheduled_date') : [],
    [loanId]
  ) || [];

  const paidCount = installments.filter(i => i.status === 'PAGADA' || i.status === 'PAGADA_ANTICIPADAMENTE').length;
  const lateCount = installments.filter(i => i.status === 'ATRASADA').length;
  const partialCount = installments.filter(i => i.status === 'PARCIAL').length;
  const pendingCount = installments.length - paidCount - lateCount - partialCount;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Tarjeta de Cobros</h3>
              <p className="text-xs font-medium text-slate-500">Historial de cuotas del préstamo</p>
            </div>
          </div>
          
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {installments.length === 0 ? (
            <div className="py-12 flex justify-center text-slate-500">
              Cargando o sin cuotas...
            </div>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
              {installments.map((inst, index) => {
                const isPaid = inst.status === 'PAGADA' || inst.status === 'PAGADA_ANTICIPADAMENTE';
                const isPartial = inst.status === 'PARCIAL';
                const isLate = inst.status === 'ATRASADA';

                let bgColor = 'bg-white';
                let borderColor = 'border-slate-200';
                let textColor = 'text-slate-600';
                
                if (isPaid) {
                  bgColor = 'bg-emerald-100';
                  borderColor = 'border-emerald-200';
                  textColor = 'text-emerald-700';
                } else if (isPartial) {
                  bgColor = 'bg-yellow-100';
                  borderColor = 'border-yellow-200';
                  textColor = 'text-yellow-700';
                } else if (isLate) {
                  bgColor = 'bg-red-100';
                  borderColor = 'border-red-200';
                  textColor = 'text-red-700';
                }

                return (
                  <div 
                    key={inst.id} 
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border ${bgColor} ${borderColor} ${textColor} text-center shadow-sm`}
                    title={`Día ${index + 1}: ${new Date(inst.scheduled_date + 'T00:00:00').toLocaleDateString('es-CO')} - Estado: ${inst.status}`}
                  >
                    <span className="text-xs font-bold opacity-70 mb-1">#{index + 1}</span>
                    {isPaid ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isLate ? (
                      <Clock className="w-5 h-5 text-red-500" />
                    ) : (
                      <span className="font-bold text-sm">
                         {new Date(inst.scheduled_date + 'T00:00:00').getDate()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Leyenda y Estadísticas */}
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex flex-wrap gap-4 md:gap-6 text-xs font-medium text-slate-600 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm"></div>
            Pagados: <span className="font-bold text-slate-800 text-sm bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">{paidCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-400 shadow-sm"></div>
            Parciales: <span className="font-bold text-slate-800 text-sm bg-yellow-50 border border-yellow-100 px-2 py-0.5 rounded-md">{partialCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400 shadow-sm"></div>
            Atrasados: <span className="font-bold text-slate-800 text-sm bg-red-50 border border-red-100 px-2 py-0.5 rounded-md">{lateCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-slate-300 shadow-sm"></div>
            Faltan: <span className="font-bold text-slate-800 text-sm bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">{pendingCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
