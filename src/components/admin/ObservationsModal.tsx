import { X, Bell, TrendingUp, AlertCircle, Clock, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { PaymentCardModal } from './PaymentCardModal';

interface ObservationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: any[];
}

export function ObservationsModal({ isOpen, onClose, alerts = [] }: ObservationsModalProps) {
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  if (!isOpen) return null;

  const withObs = alerts.filter((a: any) => a.observation);
  const withoutObs = alerts.filter((a: any) => !a.observation);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-8 pb-4 px-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Observaciones y Adicionales hoy</h3>
              <div className="flex gap-2 mt-1">
                {withoutObs.length > 0 && (
                  <span className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-semibold">
                    {withoutObs.length} sin justificar
                  </span>
                )}
                {withObs.length > 0 && (
                  <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                    {withObs.length} con observación
                  </span>
                )}
                {alerts.length === 0 && (
                  <span className="text-xs text-slate-500 font-semibold">Sin observaciones</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 bg-slate-50/50 flex-1">
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-medium">
              No hay cobros adicionales registrados hoy.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alerts.map((alert: any) => (
                <div
                  key={alert.id}
                  onClick={() => setSelectedLoanId(alert.loanId)}
                  className={`cursor-pointer bg-white rounded-2xl border-2 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-all relative overflow-hidden ${
                    alert.observation ? 'border-emerald-200 hover:border-emerald-400' : 'border-rose-200 hover:border-rose-400'
                  }`}
                >
                  {/* Accent strip */}
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl ${alert.observation ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  <div className="pl-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800 leading-tight hover:text-emerald-600 transition-colors">{alert.clientName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Cobrador: <span className="font-semibold text-slate-700">{alert.collectorName}</span></p>
                      </div>
                      {alert.is_excess ? (
                        <div className="flex items-center gap-1 text-amber-600 bg-amber-50 rounded-lg px-2 py-1 shrink-0">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">Exceso</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-blue-600 bg-blue-50 rounded-lg px-2 py-1 shrink-0">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">Nota</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Total cobrado</p>
                        <p className="font-black text-slate-800">{formatCurrency(alert.amount)}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase font-semibold text-amber-400 mb-0.5">Adelanto</p>
                        <p className="font-black text-amber-700">{formatCurrency(alert.advance)}</p>
                      </div>
                    </div>

                    {/* Observation box */}
                    {alert.observation ? (
                      <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase font-semibold text-emerald-600 mb-1">Observación del cobrador</p>
                        <p className="text-xs text-emerald-800 font-medium leading-relaxed">"{alert.observation}"</p>
                      </div>
                    ) : (
                      <div className="mt-3 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <p className="text-xs text-rose-600 font-semibold">Sin observación — preguntar al cobrador</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-xs">
                          {new Date(alert.time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      {alert.is_transfer ? (
                        <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-0.5 shrink-0">
                          <span className="text-[10px] font-bold uppercase">Transferencia</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-0.5 shrink-0">
                          <span className="text-[10px] font-bold uppercase">Efectivo</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
