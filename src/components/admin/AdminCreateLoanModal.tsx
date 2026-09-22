import React, { useState, useEffect } from 'react';
import { X, Plus, Calendar, DollarSign, User, MapPin } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AdminCreateLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  routeStates: { id: string; ruta: string }[];
  onSuccess: () => void;
}

export function AdminCreateLoanModal({ isOpen, onClose, routeStates, onSuccess }: AdminCreateLoanModalProps) {
  const user = useAuthStore(state => state.user);
  
  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  
  // Form State
  const [selectedClientId, setSelectedClientId] = useState<string>('new');
  const [routeId, setRouteId] = useState<string>('');
  
  // New Client Data
  const [fullName, setFullName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  
  // Loan Data
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState<0.20 | 0.30>(0.20);
  const [termDays, setTermDays] = useState<number>(40);
  const [sundays, setSundays] = useState('');
  const [receiptFee, setReceiptFee] = useState('');
  const [wantsRaffle, setWantsRaffle] = useState(false);

  useEffect(() => {
    if (isOpen) {
      AdminService.getClients().then(setClients).catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const numAmount = Number(parseNumberInput(amount)) || 0;
  const numSundays = Number(parseNumberInput(sundays)) || 0;
  const numReceipt = Number(parseNumberInput(receiptFee)) || 0;

  const obligation = numAmount * (1 + interestRate);
  const dailyQuota = termDays > 0 ? obligation / termDays : 0;
  const totalSundaysDiscount = dailyQuota * numSundays;
  const delivered = numAmount - totalSundaysDiscount - numReceipt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!routeId) return toast.error('Debes seleccionar una ruta');
    if (numAmount <= 0) return toast.error('El monto debe ser mayor a 0');
    if (selectedClientId === 'new' && (!fullName || !documentId)) {
      return toast.error('Faltan datos del cliente nuevo');
    }

    setIsSubmitting(true);
    try {
      await AdminService.createAdminLoan({
        clientId: selectedClientId === 'new' ? null : selectedClientId,
        clientData: selectedClientId === 'new' ? {
          full_name: fullName,
          document_id: documentId,
          phone,
          address
        } : undefined,
        routeId,
        adminId: user.id,
        amountRequested: numAmount,
        interestRate,
        termDays,
        sundaysPrepaidCount: numSundays,
        receiptFee: numReceipt,
        wantsRaffle
      });

      toast.success('Préstamo creado exitosamente');
      onSuccess();
      onClose();
      // Reset state
      setSelectedClientId('new');
      setRouteId('');
      setFullName('');
      setDocumentId('');
      setPhone('');
      setAddress('');
      setAmount('');
      setInterestRate(0.20);
      setTermDays(40);
      setSundays('');
      setReceiptFee('');
      setWantsRaffle(false);
    } catch (error: any) {
      toast.error('Error al crear el préstamo: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Nuevo Préstamo (Oficina)</h3>
              <p className="text-xs font-medium text-slate-500">Asigna un préstamo a cualquier ruta</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Col: Client & Route */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><User className="w-4 h-4"/> Cliente</label>
                <select 
                  value={selectedClientId} 
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="new">+ Crear Nuevo Cliente</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} ({c.document_id})</option>
                  ))}
                </select>
              </div>

              {selectedClientId === 'new' && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div>
                    <input type="text" required placeholder="Nombre completo *" value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <input type="text" required placeholder="Cédula *" value={documentId} onChange={e=>setDocumentId(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <input type="tel" placeholder="Teléfono" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <input type="text" placeholder="Dirección" value={address} onChange={e=>setAddress(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><MapPin className="w-4 h-4"/> Ruta a la que pertenece</label>
                <select 
                  required
                  value={routeId} 
                  onChange={e => setRouteId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Seleccione una ruta</option>
                  {routeStates.map(r => (
                    <option key={r.id} value={r.id}>{r.ruta}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right Col: Loan Data */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Tasa de Interés</label>
                <div className="flex space-x-2 mb-4">
                  {([0.20, 0.30] as const).map(r => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setInterestRate(r)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border ${
                        interestRate === r
                          ? r === 0.20
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                            : 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {(r * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Monto Solicitado *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    required
                    value={formatNumberInput(amount)} 
                    onChange={e => setAmount(parseNumberInput(e.target.value))} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-lg font-black text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    placeholder="1000000" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Plazo (Días) *</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={termDays === 0 ? '' : termDays}
                    onChange={e => {
                      const val = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                      setTermDays(val);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Ej: 40"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">días</span>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Domingos desc.</label>
                  <input type="text" inputMode="numeric" value={formatNumberInput(sundays)} onChange={e => setSundays(parseNumberInput(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Valor Boleta</label>
                  <input type="text" inputMode="numeric" value={formatNumberInput(receiptFee)} onChange={e => setReceiptFee(parseNumberInput(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                </div>
              </div>

              <label className="flex items-start bg-slate-50 border border-slate-200 p-3 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <input type="checkbox" checked={wantsRaffle} onChange={e => setWantsRaffle(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                <span className="ml-2 text-sm text-slate-700 font-semibold">Participar en Sorteo (Asignar #)</span>
              </label>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Obligación total (+{(interestRate * 100).toFixed(0)}%)</span>
                  <span className="font-bold text-slate-800">{formatCurrency(obligation)}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                  <span className="text-slate-500 font-medium">Cuota diaria</span>
                  <span className="font-bold text-blue-600">{formatCurrency(dailyQuota)}</span>
                </div>
                <div className="flex justify-between text-base pt-2 border-t border-slate-200">
                  <span className="text-slate-700 font-bold">Dinero a entregar</span>
                  <span className="font-black text-emerald-600">{formatCurrency(delivered)}</span>
                </div>
              </div>

            </div>
          </div>

        </form>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || numAmount <= 0 || !routeId}
            className={`w-full py-3.5 rounded-xl text-white font-bold text-lg shadow-lg transition-all active:scale-[0.98] ${
              isSubmitting || numAmount <= 0 || !routeId
                ? 'bg-slate-300 shadow-none cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
            }`}
          >
            {isSubmitting ? 'Creando Préstamo...' : 'Crear Préstamo'}
          </button>
        </div>
      </div>
    </div>
  );
}
