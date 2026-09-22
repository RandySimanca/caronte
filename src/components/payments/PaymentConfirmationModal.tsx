import { useState, useEffect, useMemo, useRef } from 'react';
import { X, CheckSquare, Square, Info, AlertTriangle, Trophy, Ticket, Smartphone, Image, Trash2, MessageCircle } from 'lucide-react';
import { formatCurrency, cn, formatNumberInput, parseNumberInput } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { db, type LocalLoan } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useSyncStore } from '@/stores/syncStore';
import { buildCreditStatusMessage, openWhatsAppWithMessage } from '@/lib/whatsapp';

interface FinancialState {
  todayQuota: number;
  arrears: number;
  advances: number;
  expectedTotal: number;
  pendingInstallments: any[];
  todayInstallment: any | null;
  isPaidToday?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientDocument: string;
  clientAvatarUrl: string | null;
  clientPhone: string | null;
  loan: LocalLoan;
  financialState: FinancialState;
}

export function PaymentConfirmationModal({
  isOpen,
  onClose,
  clientName,
  clientDocument,
  clientAvatarUrl,
  clientPhone,
  loan,
  financialState,
}: Props) {
  const [amount, setAmount] = useState<string>('');
  const [observation, setObservation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [lotteryWinner, setLotteryWinner] = useState<{ winning_number: string; draw_date: string } | null>(null);
  const [isTransfer, setIsTransfer] = useState(false);
  const [voucherBase64, setVoucherBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp post-payment state
  const [whatsappData, setWhatsappData] = useState<{
    message: string;
    phone: string | null;
  } | null>(null);

  const { isOnline } = useSyncStore();

  // Payment distribution preview (Rules 2 & 3 applied locally)
  const distribution = useMemo(() => {
    const numAmount = parseFloat(amount) || 0;
    let remaining = numAmount;

    let dayInstallmentAmount = 0;
    let arrearsAmount = 0;
    let advanceAmount = 0;

    // 1. Cover today's quota
    if (financialState.todayInstallment && remaining > 0) {
      const needed = financialState.todayInstallment.balance;
      const allocated = Math.min(remaining, needed);
      dayInstallmentAmount = allocated;
      remaining -= allocated;
    }

    // 2. Cover arrears (past due installments)
    const arrearsInstallments = financialState.pendingInstallments.filter(
      i => i.scheduled_date < format(new Date(), 'yyyy-MM-dd')
    );
    for (const inst of arrearsInstallments) {
      if (remaining <= 0) break;
      const allocated = Math.min(remaining, inst.balance);
      arrearsAmount += allocated;
      remaining -= allocated;
    }

    // 3. Cover future installments (advance)
    const futureInstallments = financialState.pendingInstallments.filter(
      i => i.scheduled_date > format(new Date(), 'yyyy-MM-dd')
    );
    for (const inst of futureInstallments) {
      if (remaining <= 0) break;
      const allocated = Math.min(remaining, inst.balance);
      advanceAmount += allocated;
      remaining -= allocated;
    }

    const isSurplus = numAmount > financialState.expectedTotal;
    const coverToday = Math.min(numAmount, financialState.todayQuota);
    const coverArrears = Math.min(Math.max(numAmount - financialState.todayQuota, 0), financialState.arrears);

    return {
      numAmount,
      dayInstallmentAmount,
      arrearsAmount,
      advanceAmount,
      coverToday,
      coverArrears,
      isSurplus,
    };
  }, [amount, financialState]);

  // Capture voucher from file input
  const handleVoucherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setVoucherBase64(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Auto-fill expected amount when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount(financialState.expectedTotal.toString());
      setObservation('');
      setShowDuplicateWarning(false);
      setLotteryWinner(null);
      setIsTransfer(false);
      setVoucherBase64(null);
      setWhatsappData(null);

      // Check if this loan won the lottery by reading the last draw from Dexie settings
      const checkLotteryWinner = async () => {
        if (!loan.raffle_number) return;
        const setting = await db.settings.get('lottery_last_draw');
        if (setting?.value) {
          const draw = setting.value as { winning_number: string; draw_date: string };
          if (draw.winning_number === loan.raffle_number) {
            setLotteryWinner(draw);
          }
        }
      };
      checkLotteryWinner();
    }
  }, [isOpen, financialState.expectedTotal, loan.raffle_number]);

  const handleSaveClick = () => {
    if (distribution.numAmount <= 0) return;
    
    if (financialState.isPaidToday && !showDuplicateWarning) {
      setShowDuplicateWarning(true);
      return;
    }
    
    handleConfirmSave();
  };

  const handleConfirmSave = async () => {
    if (distribution.numAmount <= 0) return;
    setIsSaving(true);

    try {
      const operationId = uuidv4();
      const collectedAt = new Date().toISOString();
      const deviceId = 'web-' + (navigator.userAgent.substring(0, 20).replace(/\s/g, '-'));
      const today = format(new Date(), 'yyyy-MM-dd');

      if (isTransfer && !voucherBase64) {
        toast.error('Debes adjuntar el comprobante de transferencia.');
        setIsSaving(false);
        return;
      }

      const paymentPayload = {
        operationId,
        deviceId,
        loanId: loan.id,
        collectorId: loan.collector_id,
        routeId: loan.route_id,
        totalAmount: distribution.numAmount,
        collectorObservation: observation || null,
        collectedAt,
        isTransfer,
        transferVoucherBase64: isTransfer ? voucherBase64 : null,
      };

      // Calcular nuevo saldo antes de la transacción para reutilizarlo después
      const newLoanBalance = Math.max(loan.current_balance - distribution.numAmount, 0);

      // 1. Update local installments in Dexie
      await db.transaction('rw', db.installments, db.loans, db.syncQueue, db.settings, async () => {
        let remaining = distribution.numAmount;
        const updatedInstallments: any[] = [];

        // Apply to today's installment first
        if (financialState.todayInstallment && remaining > 0) {
          const inst = financialState.todayInstallment;
          const allocated = Math.min(remaining, inst.balance);
          const newBalance = inst.balance - allocated;
          const newPaidAmount = inst.paid_amount + allocated;
          const updateData = {
            paid_amount: newPaidAmount,
            balance: newBalance,
            status: newBalance <= 0 ? 'PAGADA' : 'PARCIAL',
            paid_date: newBalance <= 0 ? today : null,
          };
          await db.installments.update(inst.id, updateData as any);
          updatedInstallments.push({ id: inst.id, ...updateData });
          remaining -= allocated;
        }

        // Apply to arrears
        const arrearsInsts = financialState.pendingInstallments
          .filter(i => i.scheduled_date < today)
          .sort((a, b) => a.installment_number - b.installment_number);
        for (const inst of arrearsInsts) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, inst.balance);
          const newBalance = inst.balance - allocated;
          const updateData = {
            paid_amount: inst.paid_amount + allocated,
            balance: newBalance,
            status: newBalance <= 0 ? 'PAGADA' : 'PARCIAL',
            paid_date: newBalance <= 0 ? today : null,
          };
          await db.installments.update(inst.id, updateData as any);
          updatedInstallments.push({ id: inst.id, ...updateData });
          remaining -= allocated;
        }

        // Apply to future installments (advance)
        const futureInsts = financialState.pendingInstallments
          .filter(i => i.scheduled_date > today)
          .sort((a, b) => a.installment_number - b.installment_number);
        for (const inst of futureInsts) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, inst.balance);
          const newBalance = inst.balance - allocated;
          const updateData = {
            paid_amount: inst.paid_amount + allocated,
            balance: newBalance,
            status: newBalance <= 0 ? 'PAGADA' : 'PARCIAL',
            paid_date: newBalance <= 0 ? today : null,
          };
          await db.installments.update(inst.id, updateData as any);
          updatedInstallments.push({ id: inst.id, ...updateData });
          remaining -= allocated;
        }

        // Update loan balance locally
        await db.loans.update(loan.id, { current_balance: newLoanBalance });

        // 2. Queue sync operation with PAYMENT_BUNDLE
        await db.syncQueue.add({
          operation_id: operationId,
          operation_type: 'PAYMENT_BUNDLE',
          payload: {
            payment: {
              ...paymentPayload,
              day_installment_amount: distribution.dayInstallmentAmount,
              arrears_amount: distribution.arrearsAmount,
              advance_amount: distribution.advanceAmount,
              is_partial_payment: distribution.numAmount < loan.daily_installment && !distribution.isSurplus,
              is_advance_payment: distribution.advanceAmount > 0,
              is_above_expected: distribution.isSurplus,
            },
            loanId: loan.id,
            newLoanBalance: newLoanBalance,
            updatedInstallments: updatedInstallments
          },
          status: 'pending',
          local_timestamp: collectedAt,
          retry_count: 0,
        });

        // Store transfer flag locally for DailyClosing to read
        if (isTransfer) {
          await db.settings.put({ key: `transfer_${operationId}`, value: { amount: distribution.numAmount, operationId, collectedAt } });
        }
      });

      toast.success(`Cobro de ${formatCurrency(distribution.numAmount)} registrado${isOnline ? ' y sincronizado' : ' (se sincronizará en línea)'}`);

      // --- WhatsApp: preparar datos para que el cobrador decida si enviar ---
      const arrearsAfterPayment = Math.max((financialState.arrears ?? 0) - (distribution.arrearsAmount ?? 0), 0);
      const waMessage = buildCreditStatusMessage({
        clientName,
        amountPaidToday: distribution.numAmount,
        currentBalance: newLoanBalance,
        arrearsAfterPayment,
      });
      setWhatsappData({ message: waMessage, phone: clientPhone ?? null });
      // No cerramos el modal todavía — mostramos el paso de WhatsApp
    } catch (error: any) {
      console.error('Error saving payment:', error);
      toast.error('Error al guardar el cobro. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!whatsappData) return;
    const sent = openWhatsAppWithMessage(whatsappData.phone, whatsappData.message);
    if (!sent) {
      toast.error('El cliente no tiene un teléfono válido registrado.');
    }
    onClose();
  };

  if (!isOpen) return null;

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
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-xl z-10 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur-md z-20">
            <h2 className="text-lg font-bold text-slate-800">Registrar Cobro</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-6">

            {/* ─── LOTTERY WINNER BANNER ─── */}
            {lotteryWinner && (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 p-4 shadow-lg">
                <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/10" />
                <div className="relative flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-white text-base leading-tight">¡ESTE CLIENTE GANÓ LA LOTERÍA!</p>
                    <p className="text-yellow-100 text-xs mt-1 leading-snug">
                      Su préstamo fue cancelado automáticamente. <strong className="text-white">No es necesario cobrar.</strong>
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-white/20 rounded-lg px-2 py-1">
                        <Ticket className="w-3 h-3 text-white" />
                        <span className="text-white font-black text-sm tracking-widest">{lotteryWinner.winning_number}</span>
                      </div>
                      <span className="text-yellow-100 text-[10px]">
                        Sorteo del {new Date(lotteryWinner.draw_date + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Client mini info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {clientAvatarUrl ? (
                  <img src={clientAvatarUrl} alt={clientName} className="w-10 h-10 rounded-full mr-3 object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold mr-3">
                    {clientName.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-slate-800 leading-tight">{clientName}</p>
                  <p className="text-[10px] text-slate-500">CC {clientDocument}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Cuota diaria</p>
                <p className="font-bold text-slate-800">{formatCurrency(loan.daily_installment)}</p>
              </div>
            </div>

            {/* Financial Summary boxes */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Cuota de hoy</p>
                <p className="font-bold text-slate-800">{formatCurrency(financialState.todayQuota)}</p>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-semibold text-rose-500 mb-1">Días atrasados</p>
                <p className="text-xs font-semibold text-rose-600 mb-0.5">
                  {loan.daily_installment > 0 ? Math.round(financialState.arrears / loan.daily_installment) : 0}
                </p>
                <p className="font-bold text-rose-700">{formatCurrency(financialState.arrears)}</p>
              </div>
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-semibold text-brand-600 mb-1">Total esperado</p>
                <p className="font-bold text-brand-700">{formatCurrency(financialState.expectedTotal)}</p>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Monto recibido</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-lg">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatNumberInput(amount)}
                  onChange={(e) => setAmount(parseNumberInput(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-2xl py-4 pl-8 pr-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  placeholder="0"
                />
              </div>
              <div className="flex space-x-2 mt-3">
                <button onClick={() => setAmount(financialState.expectedTotal.toString())} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg">Pago exacto</button>
                <button onClick={() => setAmount(financialState.todayQuota.toString())} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg">Solo hoy</button>
                <button onClick={() => setAmount((financialState.expectedTotal + loan.daily_installment).toString())} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg">+1 Adelanto</button>
              </div>
            </div>

            {/* Distribution Breakdown */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-bold text-slate-800 mb-3">¿Qué incluye este pago?</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {distribution.coverToday >= financialState.todayQuota ? (
                      <CheckSquare className="w-5 h-5 text-brand-600 mr-2" />
                    ) : distribution.coverToday > 0 ? (
                      <CheckSquare className="w-5 h-5 text-amber-500 mr-2" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-300 mr-2" />
                    )}
                    <span className="text-sm text-slate-700 font-medium">Día de hoy</span>
                  </div>
                  <span className={cn("font-bold text-sm", distribution.coverToday > 0 ? "text-slate-900" : "text-slate-400")}>
                    {formatCurrency(distribution.coverToday)}
                  </span>
                </div>

                {financialState.arrears > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {distribution.coverArrears >= financialState.arrears ? (
                        <CheckSquare className="w-5 h-5 text-brand-600 mr-2" />
                      ) : distribution.coverArrears > 0 ? (
                        <CheckSquare className="w-5 h-5 text-amber-500 mr-2" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300 mr-2" />
                      )}
                      <span className="text-sm text-slate-700 font-medium">Atrasado ({Math.round(financialState.arrears / loan.daily_installment)} días)</span>
                    </div>
                    <span className={cn("font-bold text-sm", distribution.coverArrears > 0 ? "text-slate-900" : "text-slate-400")}>
                      {formatCurrency(distribution.coverArrears)}
                    </span>
                  </div>
                )}

                {distribution.advanceAmount > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <div className="flex items-center">
                      <div className="bg-emerald-100 text-emerald-600 rounded p-0.5 mr-2">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <span className="text-sm text-emerald-700 font-bold">Adelanto (días futuros)</span>
                    </div>
                    <span className="font-bold text-emerald-700 text-sm">{formatCurrency(distribution.advanceAmount)}</span>
                  </div>
                )}
              </div>

              {distribution.isSurplus && (
                <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-start">
                  <Info className="w-4 h-4 text-emerald-600 mt-0.5 mr-2 flex-shrink-0" />
                  <p className="text-[11px] text-emerald-700 font-medium">
                    El excedente de {formatCurrency(distribution.advanceAmount)} se aplicará a las cuotas de los días siguientes.
                  </p>
                </div>
              )}
            </div>

            {/* Transfer Toggle */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
              <button
                type="button"
                onClick={() => { setIsTransfer(v => !v); setVoucherBase64(null); }}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all border',
                  isTransfer
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Pago por Transferencia
                </div>
                <div className={cn(
                  'w-10 h-6 rounded-full transition-colors relative',
                  isTransfer ? 'bg-white/30' : 'bg-slate-200'
                )}>
                  <div className={cn(
                    'absolute top-1 w-4 h-4 rounded-full transition-all shadow-sm',
                    isTransfer ? 'left-5 bg-white' : 'left-1 bg-white'
                  )} />
                </div>
              </button>

              {isTransfer && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-blue-700">Adjunta el comprobante de transferencia *</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleVoucherChange}
                  />
                  {voucherBase64 ? (
                    <div className="relative rounded-xl overflow-hidden border-2 border-blue-300">
                      <img src={voucherBase64} alt="Voucher" className="w-full max-h-48 object-cover" />
                      <button
                        type="button"
                        onClick={() => { setVoucherBase64(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                        className="absolute top-2 right-2 bg-rose-500 text-white rounded-full p-1.5 shadow-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-5 border-2 border-dashed border-blue-300 rounded-xl bg-white text-blue-500 hover:bg-blue-50 transition-colors"
                    >
                      <Image className="w-6 h-6" />
                      <span className="text-xs font-bold">Tomar foto o seleccionar imagen</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Observation */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Observación (opcional)</label>
              <input
                type="text"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ej: Cliente pagó 1 día y promete mañana..."
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveClick}
              disabled={distribution.numAmount <= 0 || isSaving}
              className={cn(
                "w-full font-bold py-4 rounded-xl shadow-md transition-all active:scale-[0.98]",
                distribution.numAmount > 0 && !isSaving
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {isSaving ? 'Guardando...' : 'Guardar Cobro'}
            </button>
          </div>

          {/* ── PANEL: Doble pago ── */}
          {showDuplicateWarning && !whatsappData && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center rounded-t-3xl sm:rounded-2xl">
              <div className="max-w-xs w-full flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mb-5">
                  <AlertTriangle className="w-10 h-10 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">¿Doble pago?</h3>
                <p className="text-sm text-slate-600 mb-8 leading-relaxed">
                  Este cliente <strong>ya pagó su cuota de hoy</strong>. Todo el dinero ingresado se abonará como <strong>adelanto para días futuros</strong>. ¿Estás seguro de registrar este cobro extra?
                </p>
                <div className="w-full flex space-x-3">
                  <button
                    onClick={() => setShowDuplicateWarning(false)}
                    className="flex-1 py-3.5 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    disabled={isSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmSave}
                    className="flex-1 py-3.5 font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-md shadow-amber-500/30 transition-colors"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Guardando...' : 'Sí, registrar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── PANEL: WhatsApp post-pago ── */}
          {whatsappData && (
            <div className="absolute inset-0 bg-white/97 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center rounded-t-3xl sm:rounded-2xl">
              <div className="max-w-xs w-full flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <MessageCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">¡Cobro guardado!</h3>
                <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                  ¿Deseas notificar al cliente por WhatsApp con el resumen del pago?
                </p>
                <pre className="w-full text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 whitespace-pre-wrap font-sans leading-relaxed">
                  {whatsappData.message}
                </pre>
                <div className="w-full flex flex-col gap-3">
                  <button
                    onClick={handleSendWhatsApp}
                    className="w-full flex items-center justify-center gap-2 py-3.5 font-bold text-white bg-[#25D366] hover:bg-[#1ebe5d] rounded-xl shadow-md transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Enviar por WhatsApp
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full py-3 font-semibold text-slate-500 hover:text-slate-700 text-sm transition-colors"
                  >
                    No, cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
