import { useState, useMemo } from 'react';
import { ArrowLeft, Edit, CheckCircle2, CheckCircle } from 'lucide-react';
import { useNavigate, useParams, NavLink } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';
import { PaymentConfirmationModal } from '@/components/payments/PaymentConfirmationModal';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { ClientStatementPdf } from '@/components/reports/pdf/templates/ClientStatementPdf';
import { downloadExcel } from '@/components/reports/excel/ExcelExporter';
import { FileDown, FileSpreadsheet } from 'lucide-react';

export function ClientDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Real data from Dexie
  const client = useLiveQuery(() => id ? db.clients.get(id) : undefined, [id]);
  const loan = useLiveQuery(
    () => id ? db.loans.where('client_id').equals(id).filter(l => l.status === 'ACTIVO').first() : undefined,
    [id]
  );
  const installments = useLiveQuery(
    () => loan ? db.installments.where('loan_id').equals(loan.id).toArray() : [],
    [loan?.id]
  );

  const financialState = useMemo(() => {
    if (!loan || !installments) return null;

    // Search today's installment in ALL installments (not just pending)
    const todayInstallment = installments.find(i => i.scheduled_date === today) ?? null;

    // isPaidToday: today's installment is fully paid
    const isPaidToday = !!todayInstallment &&
      ['PAGADA', 'PAGADA_ANTICIPADAMENTE'].includes(todayInstallment.status);

    // Only truly pending installments (not paid ones)
    const pending = installments.filter(i =>
      ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status)
    );

    const arrearsInstallments = pending.filter(i => i.scheduled_date < today);
    const arrears = arrearsInstallments.reduce((sum, i) => sum + i.balance, 0);

    // todayQuota is 0 if already paid or if the loan hasn't started yet (starts tomorrow or later)
    const todayQuota = (isPaidToday || loan.start_date > today) ? 0 : loan.daily_installment;
    const expectedTotal = todayQuota + arrears;

    // Count advance days (future installments already paid)
    const advances = installments.filter(
      i => i.scheduled_date > today && ['PAGADA', 'PAGADA_ANTICIPADAMENTE'].includes(i.status)
    ).length;

    return {
      todayQuota,
      arrears,
      advances,
      expectedTotal,
      pendingInstallments: pending,
      // Pass null as todayInstallment when already paid so modal won't try to re-apply it
      todayInstallment: isPaidToday ? null : (todayInstallment ?? null),
      isPaidToday,
    };
  }, [loan, installments, today]);

  const exportPdf = async () => {
    if (!client || !loan || !installments) return;
    try {
      toast.loading('Generando PDF...', { id: 'pdf' });
      const blob = await pdf(<ClientStatementPdf
        client={client}
        loan={loan}
        installments={installments}
        payments={[]}
      />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Estado_Cuenta_${client.full_name}.pdf`;
      link.click();
      toast.success('PDF generado exitosamente', { id: 'pdf' });
    } catch (error) {
      toast.error('Error al generar PDF', { id: 'pdf' });
    }
  };

  const exportExcel = () => {
    if (!client || !loan || !installments) return;
    try {
      downloadExcel([
        {
          sheetName: 'Resumen', data: [
            { Concepto: 'Monto Solicitado', Valor: loan.amount_requested },
            { Concepto: 'Obligación Total', Valor: loan.initial_obligation },
            { Concepto: 'Cuota Diaria', Valor: loan.daily_installment },
            { Concepto: 'Plazo (días)', Valor: loan.term_days },
            { Concepto: 'Estado', Valor: loan.status }
          ]
        },
        {
          sheetName: 'Historial de Cuotas', data: installments.map(i => ({
            Numero: i.installment_number,
            Fecha: i.scheduled_date,
            Estado: i.status === 'PAGADA_ANTICIPADAMENTE' ? 'ANTICIPADA' : i.status,
            Pagado: i.paid_amount || 0,
            SaldoCuota: i.balance
          }))
        }
      ], `Estado_Cuenta_${client.full_name}`);
      toast.success('Excel generado exitosamente');
    } catch (error) {
      toast.error('Error al generar Excel');
    }
  };

  if (!client || !loan) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <header className="bg-white px-4 py-3 border-b border-slate-100 flex items-center">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-slate-800 ml-2">Detalle del Cliente</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <p>Cargando información del cliente...</p>
        </div>
      </div>
    );
  }

  const isPaidAndClear = financialState?.isPaidToday && financialState?.arrears === 0;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="bg-white px-4 py-3 border-b border-slate-100 sticky top-0 z-10 flex justify-between items-center">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-800">Detalle del Cliente</h1>
        <div className="flex items-center">
          <NavLink to={`/client/${id}/edit`} className="p-2 -mr-2 text-slate-600">
            <Edit className="w-5 h-5" />
          </NavLink>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Client Profile Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center">
          {client.photo_face_url ? (
            <img src={client.photo_face_url} alt={client.full_name} className="w-16 h-16 rounded-full border border-slate-200 mr-4 object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-slate-200 border border-slate-200 mr-4 flex items-center justify-center text-slate-500 text-2xl font-bold">
              {client.full_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{client.full_name}</h2>
            {client.document_id && <p className="text-xs text-slate-500 mt-1">CC {client.document_id}</p>}
            {client.phone && <p className="text-xs text-slate-500">Cel: {client.phone}</p>}
            {client.address && <p className="text-xs text-slate-500">{client.address}</p>}
          </div>
        </div>

        {/* Active Loan Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-bold text-slate-800">Préstamo Activo</h3>
              <p className="text-xs text-slate-500">Iniciado: {loan.start_date}</p>
            </div>
            <div className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              {loan.status}
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Monto solicitado</span>
              <span className="font-semibold text-slate-900">{formatCurrency(loan.amount_requested)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Obligación total (+20%)</span>
              <span className="font-bold text-slate-900">{formatCurrency(loan.initial_obligation)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Plazo</span>
              <span className="font-semibold text-slate-900">{loan.term_days} días</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cuota diaria</span>
              <span className="font-semibold text-slate-900">{formatCurrency(loan.daily_installment)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Domingos descontados</span>
              <span className="font-semibold text-slate-900">
                {loan.sundays_prepaid_count} ({formatCurrency(loan.sundays_prepaid_amount)})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">
                Boleta{loan.raffle_number && (
                  <span className="ml-1 font-bold text-purple-600">No. {loan.raffle_number}</span>
                )}
              </span>
              <span className="font-semibold text-slate-900">{formatCurrency(loan.receipt_fee)}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between items-center">
              <span className="text-slate-600 font-medium">Dinero entregado</span>
              <span className="font-bold text-emerald-600 text-lg">{formatCurrency(loan.amount_delivered)}</span>
            </div>
          </div>
        </div>

        {/* Current State & Action */}
        {financialState && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">

            {/* Paid & Clear banner */}
            {isPaidAndClear ? (
              <div className="flex flex-col items-center py-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                  <CheckCircle className="w-9 h-9 text-emerald-500" />
                </div>
                <p className="font-bold text-emerald-700 text-lg">¡Pagado al día!</p>
                <p className="text-xs text-slate-500 mt-1">La cuota de hoy ya fue cobrada correctamente.</p>
                {financialState.advances > 0 && (
                  <p className="text-xs text-brand-600 font-semibold mt-2 bg-brand-50 px-3 py-1 rounded-full">
                    {financialState.advances} día{financialState.advances !== 1 ? 's' : ''} adelantado{financialState.advances !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Cuota de hoy</p>
                  <p className="text-sm font-bold text-brand-600">{formatCurrency(financialState.todayQuota)}</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-rose-50 border border-rose-100">
                  <p className="text-[10px] uppercase text-rose-500 font-semibold mb-1">Atrasos</p>
                  <p className="text-sm font-bold text-rose-600">{formatCurrency(financialState.arrears)}</p>
                </div>
                <div className="text-center p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-[10px] uppercase text-emerald-600 font-semibold mb-1">Adelantos</p>
                  <p className="text-sm font-bold text-emerald-600">{financialState.advances} día{financialState.advances !== 1 ? 's' : ''}</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className={
                isPaidAndClear
                  ? "w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98]"
                  : "w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl shadow-md shadow-brand-500/30"
              }
            >
              {isPaidAndClear ? 'Registrar cobro adicional' : 'Registrar Cobro'}
            </button>

            {/* Export Actions */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={exportPdf}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm"
              >
                <FileDown className="w-4 h-4" />
                Exportar PDF
              </button>
              <button
                onClick={exportExcel}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Exportar Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {financialState && (
        <PaymentConfirmationModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          clientId={client.id}
          clientName={client.full_name}
          clientDocument={client.document_id}
          clientAvatarUrl={client.photo_face_url}
          loan={loan}
          financialState={financialState}
        />
      )}
    </div>
  );
}
