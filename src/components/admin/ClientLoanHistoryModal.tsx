import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  Clock,
  Tag,
  Loader2,
} from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';

type LoanHistoryItem = Awaited<ReturnType<typeof AdminService.getClientLoanHistory>>[number];

interface ClientLoanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string | null;
  clientName: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ACTIVO: { label: 'Activo', cls: 'bg-blue-100 text-blue-800' },
  CANCELADO: { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-800' },
  REFINANCIADO: { label: 'Refinanciado', cls: 'bg-violet-100 text-violet-800' },
  VENCIDO: { label: 'Vencido', cls: 'bg-red-100 text-red-800' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function LoanCard({ loan, index }: { loan: LoanHistoryItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isFinished = loan.status === 'CANCELADO' || loan.status === 'REFINANCIADO';
  const profitPositive = loan.profit >= 0;

  return (
    <article
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        loan.status === 'ACTIVO'
          ? 'border-blue-200 bg-blue-50/40'
          : loan.status === 'CANCELADO'
          ? 'border-emerald-200 bg-emerald-50/30'
          : loan.status === 'REFINANCIADO'
          ? 'border-violet-200 bg-violet-50/30'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Header de la tarjeta */}
      <button
        className="w-full text-left px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Número de préstamo */}
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-black ${
              loan.status === 'ACTIVO'
                ? 'bg-blue-200 text-blue-800'
                : loan.status === 'CANCELADO'
                ? 'bg-emerald-200 text-emerald-800'
                : loan.status === 'REFINANCIADO'
                ? 'bg-violet-200 text-violet-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            #{index + 1}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={loan.status} />
              {loan.isRefinanced && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">
                  <RefreshCw className="w-3 h-3" />
                  Refinanciado
                </span>
              )}
              {loan.raffleNumber && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                  <Tag className="w-3 h-3" />
                  Boleta #{loan.raffleNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Calendar className="w-3 h-3 shrink-0" />
              Desembolso: <strong className="text-slate-700">{fmtDate(loan.disbursementDate)}</strong>
              {loan.completedOn && (
                <>
                  <span className="mx-0.5">→</span>
                  Cierre: <strong className="text-slate-700">{fmtDate(loan.completedOn)}</strong>
                  {loan.daysToFinish !== null && (
                    <span className="text-slate-400">({loan.daysToFinish} días)</span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Resumen financiero rápido */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Prestado</p>
            <p className="font-black text-slate-800 text-sm">{fmt(loan.amountRequested)}</p>
          </div>
          {isFinished && (
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Recaudado</p>
              <p className="font-black text-slate-800 text-sm">{fmt(loan.collected)}</p>
            </div>
          )}
          {isFinished && (
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Ganancia</p>
              <div className={`flex items-center gap-1 font-black text-sm ${profitPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                {profitPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {fmt(loan.profit)}
              </div>
            </div>
          )}
          {loan.status === 'ACTIVO' && (
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Saldo</p>
              <p className="font-black text-red-600 text-sm">{fmt(loan.currentBalance)}</p>
            </div>
          )}
          <div
            className={`w-6 h-6 flex items-center justify-center rounded-full transition-transform ${expanded ? 'rotate-180' : ''} text-slate-400`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      </button>

      {/* Detalle expandido */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <InfoCell label="Monto solicitado" value={fmt(loan.amountRequested)} />
            <InfoCell label="Monto entregado" value={fmt(loan.amountDelivered)} />
            <InfoCell label="Interés" value={fmt(loan.interestAmount)} />
            <InfoCell label="Obligación total" value={fmt(loan.initialObligation)} />
            <InfoCell label="Plazo" value={`${loan.termDays} días`} />
            <InfoCell label="Cuota diaria" value={fmt(loan.dailyInstallment)} />
            <InfoCell label="Boleta" value={loan.receiptFee > 0 ? fmt(loan.receiptFee) : 'No'} />
            {loan.sundaysPrepaidAmount > 0 && (
              <InfoCell label="Domingos desc." value={fmt(loan.sundaysPrepaidAmount)} />
            )}
            <InfoCell
              label="Inicio cobros"
              value={fmtDate(loan.startDate)}
              icon={<Calendar className="w-3 h-3" />}
            />
            <InfoCell
              label="Fecha vencimiento"
              value={fmtDate(loan.endDate)}
              icon={<Clock className="w-3 h-3" />}
            />
            {loan.completedOn && (
              <InfoCell
                label="Fecha de cierre"
                value={fmtDate(loan.completedOn)}
                icon={<CheckCircle2 className="w-3 h-3 text-emerald-600" />}
              />
            )}
            {loan.routeName && (
              <InfoCell label="Ruta" value={loan.routeName} />
            )}
          </div>

          {/* Bloque financiero detallado (solo préstamos terminados) */}
          {isFinished && (
            <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-slate-200">
                <div className="p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Capital prestado</p>
                  <p className="font-black text-slate-800 text-base mt-1">{fmt(loan.amountRequested)}</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Total recaudado</p>
                  <p className="font-black text-slate-800 text-base mt-1">{fmt(loan.collected)}</p>
                  {loan.sundaysPrepaidAmount > 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Incl. {fmt(loan.sundaysPrepaidAmount)} domingos
                    </p>
                  )}
                  {loan.isRefinanced && loan.refinancedBalance > 0 && (
                    <p className="text-[10px] text-violet-600 mt-0.5">
                      Incl. {fmt(loan.refinancedBalance)} saldo recogido
                    </p>
                  )}
                </div>
                <div className={`p-3 text-center ${profitPositive ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className={`text-[10px] font-bold uppercase ${profitPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                    Ganancia neta
                  </p>
                  <p className={`font-black text-base mt-1 flex items-center justify-center gap-1 ${profitPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                    {profitPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {fmt(loan.profit)}
                  </p>
                  {loan.daysToFinish !== null && (
                    <p className="text-[10px] text-slate-400 mt-0.5">en {loan.daysToFinish} días</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Préstamo activo: deuda actual */}
          {loan.status === 'ACTIVO' && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-blue-700">Saldo pendiente actual</p>
                <p className="font-black text-blue-900 text-lg">{fmt(loan.currentBalance)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function InfoCell({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-bold text-slate-800 text-sm mt-1 flex items-center gap-1">
        {icon}
        {value}
      </p>
    </div>
  );
}

export function ClientLoanHistoryModal({
  isOpen,
  onClose,
  clientId,
  clientName,
}: ClientLoanHistoryModalProps) {
  const [loans, setLoans] = useState<LoanHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !clientId) return;
    setLoading(true);
    setLoans([]);
    AdminService.getClientLoanHistory(clientId)
      .then(setLoans)
      .catch((err: any) => toast.error('Error al cargar historial: ' + (err.message || '')))
      .finally(() => setLoading(false));
  }, [isOpen, clientId]);

  if (!isOpen) return null;

  // Totales solo de préstamos terminados
  const finished = loans.filter((l) => l.status === 'CANCELADO' || l.status === 'REFINANCIADO');
  const totalCapital = finished.reduce((s, l) => s + l.amountRequested, 0);
  const totalCollected = finished.reduce((s, l) => s + l.collected, 0);
  const totalProfit = totalCollected - totalCapital;

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[96dvh] md:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-indigo-50 to-violet-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <History className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black text-slate-800 leading-tight truncate">
                {clientName}
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                Historial completo de préstamos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de ganancias (solo préstamos terminados) */}
        {!loading && finished.length > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-100 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">
              Resumen — {finished.length} préstamo{finished.length !== 1 ? 's' : ''} terminado{finished.length !== 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">Capital total</p>
                <p className="font-black text-slate-800 text-sm sm:text-base mt-0.5">{fmt(totalCapital)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">Recaudado</p>
                <p className="font-black text-slate-800 text-sm sm:text-base mt-0.5">{fmt(totalCollected)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${totalProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <p className={`text-[10px] font-bold uppercase ${totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  Ganancia total
                </p>
                <p className={`font-black text-sm sm:text-base mt-0.5 ${totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(totalProfit)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de préstamos */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-3">
          {loading && (
            <div className="py-16 flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="font-medium">Cargando historial…</p>
            </div>
          )}

          {!loading && loans.length === 0 && (
            <div className="py-16 text-center">
              <History className="w-12 h-12 mx-auto text-slate-200 mb-3" />
              <p className="font-bold text-slate-500">Sin préstamos registrados</p>
              <p className="text-sm text-slate-400 mt-1">Este cliente no tiene préstamos en el sistema.</p>
            </div>
          )}

          {!loading &&
            loans.map((loan, idx) => (
              <LoanCard key={loan.id} loan={loan} index={idx} />
            ))}
        </div>

        {/* Footer con contador */}
        {!loading && loans.length > 0 && (
          <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between text-sm text-slate-600">
            <span className="font-semibold">
              {loans.length} préstamo{loans.length !== 1 ? 's' : ''} en total
            </span>
            <span className="text-slate-400 text-xs">
              {loans.filter((l) => l.status === 'ACTIVO').length} activo
              {loans.filter((l) => l.status === 'ACTIVO').length !== 1 ? 's' : ''} ·{' '}
              {finished.length} terminado{finished.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
