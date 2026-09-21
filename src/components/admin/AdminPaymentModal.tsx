import React, { useState } from 'react';
import { X, DollarSign } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AdminPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: any;
  onSuccess: () => void;
}

export function AdminPaymentModal({ isOpen, onClose, loan, onSuccess }: AdminPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [observation, setObservation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = useAuthStore(state => state.user);

  if (!isOpen || !loan) return null;

  const suggestedAmount = (loan.daily_installment || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numericAmount = Number(parseNumberInput(amount));
    if (numericAmount <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }

    if (numericAmount > (loan.current_balance || 0)) {
      toast.error('El monto no puede ser mayor a la deuda actual');
      return;
    }

    setIsSubmitting(true);
    try {
      await AdminService.registerAdminPayment({
        loanId: loan.id,
        routeId: loan.route_id,
        adminId: user.id,
        totalAmount: numericAmount,
        observation: observation
      });
      toast.success('Cobro registrado exitosamente en oficina');
      onSuccess();
      onClose();
      setAmount('');
      setObservation('');
    } catch (error: any) {
      toast.error('Error al registrar el cobro: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Registrar Cobro (Oficina)</h3>
              <p className="text-xs font-medium text-slate-500">
                El dinero no se sumará a la entrega del cobrador
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Deuda Actual</span>
              <span className="font-bold text-red-600">{formatCurrency(loan.current_balance || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cuota Diaria</span>
              <span className="font-bold text-slate-800">{formatCurrency(loan.daily_installment || 0)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Monto a Recibir *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
              <input 
                type="text" 
                inputMode="numeric"
                required
                value={formatNumberInput(amount)} 
                onChange={e => setAmount(parseNumberInput(e.target.value))} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-3 text-xl font-black text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                placeholder={suggestedAmount.toString()} 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Observación (Opcional)</label>
            <input 
              type="text" 
              value={observation} 
              onChange={e => setObservation(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
              placeholder="Ej: Pago directo en oficina" 
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !amount || Number(parseNumberInput(amount)) <= 0}
              className={`w-full py-3.5 rounded-xl text-white font-bold text-lg shadow-lg transition-all active:scale-[0.98] ${
                isSubmitting || !amount || Number(parseNumberInput(amount)) <= 0
                  ? 'bg-slate-300 shadow-none cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30'
              }`}
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar Cobro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
