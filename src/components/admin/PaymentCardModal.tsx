import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, CheckCircle, Clock, List, Trash2, Edit2, AlertTriangle, ChevronRight, Save } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';

interface PaymentCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  loanId: string;
}

export function PaymentCardModal({ isOpen, onClose, loanId }: PaymentCardModalProps) {
  const user = useAuthStore(state => state.user);
  
  const [viewMode, setViewMode] = useState<'CARD' | 'HISTORY'>('CARD');
  const [installments, setInstallments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [instData, payData] = await Promise.all([
        AdminService.getLoanInstallments(loanId),
        AdminService.getLoanPayments(loanId)
      ]);
      setInstallments(instData);
      setPayments(payData);
    } catch (error: any) {
      toast.error('Error cargando datos: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !loanId) return;
    loadData();
    // Reset edit state when reopening or switching loans
    setEditingPaymentId(null);
    setEditAmount('');
    setEditReason('');
  }, [isOpen, loanId]);

  const handleDelete = async (paymentId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este cobro por completo? El saldo del préstamo y las cuotas volverán a su estado anterior. Esta acción NO se puede deshacer.')) return;
    
    setIsSubmitting(true);
    try {
      await AdminService.deletePayment(paymentId);
      toast.success('Cobro eliminado exitosamente');
      loadData();
    } catch (e: any) {
      toast.error('Error al eliminar: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (paymentId: string, oldAmount: number, isTransfer: boolean) => {
    if (!user) return;
    const numeric = Number(parseNumberInput(editAmount));
    if (numeric <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (numeric === oldAmount) { toast.error('El monto es igual al original'); return; }
    if (!editReason.trim()) { toast.error('Debes ingresar el motivo de la corrección'); return; }

    setIsSubmitting(true);
    try {
      await AdminService.correctPayment(paymentId, numeric, editReason, user.id, isTransfer);
      toast.success('Cobro corregido exitosamente');
      setEditingPaymentId(null);
      loadData();
    } catch (e: any) {
      toast.error('Error al corregir: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
              {viewMode === 'CARD' ? <CalendarIcon className="w-5 h-5" /> : <List className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {viewMode === 'CARD' ? 'Tarjeta de Cobros' : 'Historial de Pagos'}
              </h3>
              <p className="text-xs font-medium text-slate-500">
                {viewMode === 'CARD' ? 'Historial de cuotas del préstamo' : 'Listado de cobros registrados'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-200/60 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('CARD')}
                className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                  viewMode === 'CARD' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Tarjeta
              </button>
              <button
                onClick={() => setViewMode('HISTORY')}
                className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                  viewMode === 'HISTORY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Cobros
              </button>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : viewMode === 'CARD' ? (
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
          ) : (
            <div className="space-y-3">
              {payments.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No hay cobros registrados para este préstamo.
                </div>
              ) : (
                payments.map((p) => (
                  <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    {editingPaymentId === p.id ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <span className="font-bold text-slate-800 flex items-center gap-2">
                            <Edit2 className="w-4 h-4 text-amber-500" />
                            Editando Cobro
                          </span>
                          <span className="text-sm font-black text-slate-400 line-through">
                            {formatCurrency(p.total_amount)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Nuevo Monto</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                              <input
                                type="text"
                                value={formatNumberInput(editAmount)}
                                onChange={e => setEditAmount(parseNumberInput(e.target.value))}
                                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 text-sm font-bold"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Motivo *</label>
                            <input
                              type="text"
                              value={editReason}
                              onChange={e => setEditReason(e.target.value)}
                              placeholder="Ej: Error de digitación"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            disabled={isSubmitting}
                            onClick={() => setEditingPaymentId(null)}
                            className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            disabled={isSubmitting || !editAmount || !editReason.trim()}
                            onClick={() => handleEdit(p.id, Number(p.total_amount), p.is_transfer)}
                            className="px-4 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                            <Save className="w-4 h-4" />
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-black text-slate-800">
                              {formatCurrency(p.total_amount)}
                            </span>
                            {p.is_transfer && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                                Transferencia
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-500">
                            {new Date(p.collected_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Cobrador: <span className="font-semibold text-slate-600">{p.collector?.full_name || 'Desconocido'}</span>
                          </p>
                          {p.collector_observation && (
                            <p className="text-xs text-amber-600 italic mt-1 bg-amber-50 inline-block px-2 py-1 rounded-md">
                              "{p.collector_observation}"
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setEditingPaymentId(p.id);
                              setEditAmount(String(p.total_amount));
                              setEditReason('');
                            }}
                            className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Editar cobro"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            disabled={isSubmitting}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Eliminar cobro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        
        {/* Leyenda y Estadísticas (Only in CARD mode) */}
        {viewMode === 'CARD' && (
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
        )}
      </div>
    </div>
  );
}
