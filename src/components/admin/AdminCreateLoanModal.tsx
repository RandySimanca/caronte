import React, { useState, useEffect } from 'react';
import { X, Plus, Calendar, DollarSign, User, MapPin, History, Trash2, Sparkles, CheckCircle2, Clock } from 'lucide-react';
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
  
  // Mode: Standard vs Historical / Migration
  const [isHistorical, setIsHistorical] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const [disbursementDate, setDisbursementDate] = useState(todayStr);

  // Historical Payments State
  const [historicalPayments, setHistoricalPayments] = useState<{
    id: string;
    paymentDate: string;
    amount: string;
    observation: string;
  }[]>([]);
  const [quickQuotaCount, setQuickQuotaCount] = useState('');

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

  const totalHistoricalPaid = historicalPayments.reduce(
    (sum, p) => sum + (Number(parseNumberInput(p.amount)) || 0),
    0
  );
  const estimatedRemainingBalance = Math.max(0, obligation - totalSundaysDiscount - totalHistoricalPaid);

  const handleGenerateQuickPayments = () => {
    const count = parseInt(quickQuotaCount) || 0;
    if (count <= 0) return toast.error('Ingresa una cantidad de cuotas válida');
    if (!disbursementDate) return toast.error('Selecciona primero la fecha de desembolso');

    const parts = disbursementDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return toast.error('Fecha de desembolso no válida');

    const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);

    const addDays = (date: Date, days: number) => {
      const res = new Date(date);
      res.setDate(res.getDate() + days);
      return res;
    };

    const newPayments = [];
    let sundaysCount = 0;
    let dayOffset = 1;

    while (newPayments.length < count && dayOffset <= 365) {
      const current = addDays(baseDate, dayOffset);
      const isSun = current.getDay() === 0;

      if (isSun && sundaysCount < numSundays) {
        sundaysCount++;
        dayOffset++;
        continue;
      }

      const dateStr = current.toISOString().split('T')[0];
      newPayments.push({
        id: Math.random().toString(36).substring(2, 9),
        paymentDate: dateStr,
        amount: dailyQuota > 0 ? Math.round(dailyQuota).toString() : '',
        observation: `Cuota ${newPayments.length + 1} (Carga inicial)`
      });

      dayOffset++;
    }

    setHistoricalPayments(newPayments);
    toast.success(`Se generaron ${newPayments.length} cuotas automáticas`);
  };

  const handleAddManualPayment = () => {
    setHistoricalPayments(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        paymentDate: disbursementDate || todayStr,
        amount: dailyQuota > 0 ? Math.round(dailyQuota).toString() : '',
        observation: `Cuota ${prev.length + 1} (Histórico)`
      }
    ]);
  };

  const handleRemovePayment = (id: string) => {
    setHistoricalPayments(prev => prev.filter(p => p.id !== id));
  };

  const handleUpdatePayment = (id: string, field: 'paymentDate' | 'amount' | 'observation', val: string) => {
    setHistoricalPayments(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: val } : p))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!routeId) return toast.error('Debes seleccionar una ruta');
    if (numAmount <= 0) return toast.error('El monto debe ser mayor a 0');
    if (selectedClientId === 'new' && (!fullName || !documentId)) {
      return toast.error('Faltan datos del cliente nuevo');
    }

    if (isHistorical && !disbursementDate) {
      return toast.error('Ingresa la fecha real de préstamo/desembolso');
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
        wantsRaffle,
        disbursementDate: isHistorical ? disbursementDate : undefined,
        historicalPayments: isHistorical ? historicalPayments.map(p => ({
          amount: Number(parseNumberInput(p.amount)) || 0,
          paymentDate: p.paymentDate,
          observation: p.observation
        })) : undefined
      });

      toast.success(isHistorical ? 'Préstamo histórico migrado exitosamente' : 'Préstamo creado exitosamente');
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
      setIsHistorical(false);
      setDisbursementDate(todayStr);
      setHistoricalPayments([]);
      setQuickQuotaCount('');
    } catch (error: any) {
      toast.error('Error al registrar el préstamo: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isHistorical ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
            }`}>
              {isHistorical ? <History className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {isHistorical ? 'Migración de Préstamo Existente (Histórico)' : 'Nuevo Préstamo (Oficina)'}
              </h3>
              <p className="text-xs font-medium text-slate-500">
                {isHistorical ? 'Registra préstamos pasados con sus fechas y cuotas reales' : 'Crea un préstamo nuevo activo desde hoy'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Switch */}
        <div className="px-6 pt-4 pb-2 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tipo de Registro</span>
          <div className="inline-flex p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setIsHistorical(false)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isHistorical ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nuevo (Hoy)
            </button>
            <button
              type="button"
              onClick={() => setIsHistorical(true)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                isHistorical ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Carga Inicial / Histórico
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Main Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Col: Client & Route */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400"/> Cliente
                </label>
                <select 
                  value={selectedClientId} 
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    <input type="text" required placeholder="Nombre completo *" value={fullName} onChange={e=>setFullName(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <input type="text" required placeholder="Cédula *" value={documentId} onChange={e=>setDocumentId(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <input type="tel" placeholder="Teléfono" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <input type="text" placeholder="Dirección" value={address} onChange={e=>setAddress(e.target.value)} className="w-full border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400"/> Ruta a la que pertenece
                </label>
                <select 
                  required
                  value={routeId} 
                  onChange={e => setRouteId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Seleccione una ruta</option>
                  {routeStates.map(r => (
                    <option key={r.id} value={r.id}>{r.ruta}</option>
                  ))}
                </select>
              </div>

              {/* Historical Date Selector */}
              {isHistorical && (
                <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 space-y-2">
                  <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    Fecha Real de Desembolso / Préstamo *
                  </label>
                  <input
                    type="date"
                    required={isHistorical}
                    max={todayStr}
                    value={disbursementDate}
                    onChange={e => setDisbursementDate(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-sm font-bold text-amber-950 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-amber-700">
                    Las cuotas del préstamo se calcularán a partir de esta fecha.
                  </p>
                </div>
              )}
            </div>

            {/* Right Col: Loan Data */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Tasa de Interés</label>
                <div className="flex space-x-2">
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
                {isHistorical ? (
                  <>
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-200 text-emerald-600 font-bold">
                      <span>Total cobrado histórico</span>
                      <span>{formatCurrency(totalHistoricalPaid)}</span>
                    </div>
                    <div className="flex justify-between text-base pt-2 border-t border-slate-200 font-black text-amber-700">
                      <span>Saldo actual restante</span>
                      <span>{formatCurrency(estimatedRemainingBalance)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-base pt-2 border-t border-slate-200">
                    <span className="text-slate-700 font-bold">Dinero a entregar</span>
                    <span className="font-black text-emerald-600">{formatCurrency(delivered)}</span>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Historical Payments Section */}
          {isHistorical && (
            <div className="border-t border-amber-200/80 pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                <div>
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-600" />
                    Pagos / Cuotas Ya Realizadas
                  </h4>
                  <p className="text-xs text-amber-700">
                    Ingresa los pagos pasados recibidos de este cliente.
                  </p>
                </div>

                {/* Quick Generator Box */}
                <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-amber-200 shadow-sm">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Nº cuotas"
                    value={quickQuotaCount}
                    onChange={e => setQuickQuotaCount(e.target.value.replace(/\D/g, ''))}
                    className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateQuickPayments}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-Generar
                  </button>
                </div>
              </div>

              {/* Payments List */}
              <div className="space-y-2">
                {historicalPayments.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-amber-200/60 rounded-xl bg-amber-50/20">
                    <p className="text-xs font-semibold text-amber-800 mb-2">No se han añadido cuotas históricas aún</p>
                    <button
                      type="button"
                      onClick={handleAddManualPayment}
                      className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Pago Manual
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {historicalPayments.map((hp, idx) => (
                      <div key={hp.id} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm hover:border-amber-300 transition-colors">
                        <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        
                        {/* Date */}
                        <div className="flex-1 min-w-[130px]">
                          <input
                            type="date"
                            value={hp.paymentDate}
                            max={todayStr}
                            onChange={e => handleUpdatePayment(hp.id, 'paymentDate', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>

                        {/* Amount */}
                        <div className="flex-1 min-w-[120px] relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Monto"
                            value={formatNumberInput(hp.amount)}
                            onChange={e => handleUpdatePayment(hp.id, 'amount', parseNumberInput(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-5 pr-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>

                        {/* Observation */}
                        <div className="flex-[1.5] hidden sm:block">
                          <input
                            type="text"
                            placeholder="Obs. (ej: Pago en efectivo)"
                            value={hp.observation}
                            onChange={e => handleUpdatePayment(hp.id, 'observation', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(hp.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                          title="Eliminar cuota"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    <div className="flex justify-between items-center pt-2">
                      <button
                        type="button"
                        onClick={handleAddManualPayment}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Añadir otra cuota
                      </button>
                      <span className="text-xs font-bold text-amber-800">
                        Total {historicalPayments.length} cuotas: {formatCurrency(totalHistoricalPaid)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </form>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || numAmount <= 0 || !routeId}
            className={`w-full py-3.5 rounded-xl text-white font-bold text-lg shadow-lg transition-all active:scale-[0.98] ${
              isSubmitting || numAmount <= 0 || !routeId
                ? 'bg-slate-300 shadow-none cursor-not-allowed'
                : isHistorical
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/30'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
            }`}
          >
            {isSubmitting
              ? isHistorical ? 'Migrando Préstamo...' : 'Creando Préstamo...'
              : isHistorical ? 'Migrar Préstamo Histórico' : 'Crear Préstamo'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
