import { useState, useEffect, FormEvent } from 'react';
import { X, Search, PencilLine, AlertTriangle, CheckCircle, ChevronLeft } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface EditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'SEARCH' | 'CONFIRM';

export function EditPaymentModal({ isOpen, onClose, onSuccess }: EditPaymentModalProps) {
  const user = useAuthStore(state => state.user);

  const [step, setStep] = useState<Step>('SEARCH');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [clientSearch, setClientSearch] = useState('');
  const [payments, setPayments] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [newAmount, setNewAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep('SEARCH');
      setPayments([]);
      setSelectedPayment(null);
      setNewAmount('');
      setReason('');
      setClientSearch('');
    }
  }, [isOpen]);

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const results = await AdminService.getPaymentsByDate(date, clientSearch);
      setPayments(results);
      if (results.length === 0) toast('No se encontraron cobros para esa fecha/cliente.', { icon: '🔍' });
    } catch (e: any) {
      toast.error('Error buscando cobros: ' + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPayment = (p: any) => {
    setSelectedPayment(p);
    setNewAmount(String(p.total_amount));
    setStep('CONFIRM');
  };

  const handleCorrect = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPayment) return;

    const numeric = Number(parseNumberInput(newAmount));
    if (numeric <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (!reason.trim()) { toast.error('Debes ingresar el motivo de la corrección'); return; }

    setIsSubmitting(true);
    try {
      await AdminService.correctPayment(selectedPayment.id, numeric, reason, user.id);
      toast.success('Cobro corregido exitosamente');
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast.error('Error al corregir: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const oldAmount = selectedPayment ? Number(selectedPayment.total_amount) : 0;
  const numericNew = Number(parseNumberInput(newAmount));
  const diff = numericNew - oldAmount;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            {step === 'CONFIRM' && (
              <button
                type="button"
                onClick={() => setStep('SEARCH')}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <PencilLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Corregir Cobro</h3>
              <p className="text-xs font-medium text-slate-500">
                {step === 'SEARCH' ? 'Busca el cobro a corregir' : 'Ingresa el monto correcto'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1 — Buscar */}
        {step === 'SEARCH' && (
          <div className="flex flex-col overflow-hidden">
            <div className="p-6 space-y-4 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Fecha del cobro</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Cliente (opcional)</label>
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Nombre o cédula..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <Search className="w-4 h-4" />
                {isSearching ? 'Buscando...' : 'Buscar cobros'}
              </button>
            </div>

            {/* Results */}
            {payments.length > 0 && (
              <div className="overflow-y-auto border-t border-slate-100 divide-y divide-slate-100">
                {payments.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPayment(p)}
                    className="w-full text-left px-6 py-4 hover:bg-amber-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">
                          {p.loan?.client?.full_name || 'Desconocido'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Cobrador: {p.collector?.full_name || '—'} · {format(new Date(p.collected_at), 'HH:mm')}
                        </p>
                        {p.collector_observation && (
                          <p className="text-xs text-slate-400 italic truncate mt-0.5">"{p.collector_observation}"</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-lg font-black text-slate-800">{formatCurrency(p.total_amount)}</p>
                        <p className="text-xs text-amber-600 font-semibold group-hover:underline mt-0.5">Corregir →</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Confirmar corrección */}
        {step === 'CONFIRM' && selectedPayment && (
          <form onSubmit={handleCorrect} className="p-6 space-y-5 overflow-y-auto">
            {/* Info del cobro */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente</span>
                <span className="font-bold text-slate-800">{selectedPayment.loan?.client?.full_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cobrador</span>
                <span className="font-semibold text-slate-700">{selectedPayment.collector?.full_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hora del cobro</span>
                <span className="font-semibold text-slate-700">{format(new Date(selectedPayment.collected_at), 'dd/MM/yyyy HH:mm')}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                <span className="text-slate-500">Monto registrado (incorrecto)</span>
                <span className="font-black text-red-500 text-base">{formatCurrency(oldAmount)}</span>
              </div>
            </div>

            {/* Alerta */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Esta acción recalculará las cuotas y el saldo del préstamo. No se puede deshacer.</span>
            </div>

            {/* Monto correcto */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Monto Correcto *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formatNumberInput(newAmount)}
                  onChange={e => setNewAmount(parseNumberInput(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-3 text-xl font-black text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  placeholder="0"
                />
              </div>
              {newAmount && numericNew !== oldAmount && (
                <p className={`text-xs font-semibold mt-1.5 ${diff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {diff > 0
                    ? `↑ Aumenta ${formatCurrency(diff)} → el saldo del préstamo bajará`
                    : `↓ Reduce ${formatCurrency(Math.abs(diff))} → el saldo del préstamo subirá`}
                </p>
              )}
            </div>

            {/* Motivo */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Motivo de la corrección *</label>
              <input
                type="text"
                required
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ej: Error de digitación, debía ser 5.000"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newAmount || numericNew <= 0 || !reason.trim() || numericNew === oldAmount}
              className={`w-full py-3.5 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                isSubmitting || !newAmount || numericNew <= 0 || !reason.trim() || numericNew === oldAmount
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30'
              }`}
            >
              <CheckCircle className="w-5 h-5" />
              {isSubmitting ? 'Aplicando corrección...' : 'Confirmar Corrección'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
