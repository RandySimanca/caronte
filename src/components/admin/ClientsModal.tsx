import React, { useState, useEffect } from 'react';
import { X, Search, Users, Calendar, Filter, CheckCircle, Camera, FileText, DollarSign, ChevronDown, ChevronUp, Eye, Trash2, Edit, Plus } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { colombiaDateFromIso } from '@/lib/dailyCollection';
import toast from 'react-hot-toast';
import { confirmDanger } from '@/lib/swal';
import { PaymentCardModal } from './PaymentCardModal';
import { EditClientModal } from './EditClientModal';
import { AdminCreateLoanModal } from './AdminCreateLoanModal';
import { AdminPaymentModal } from './AdminPaymentModal';
import { ClientLoanHistoryModal } from './ClientLoanHistoryModal';

interface ClientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRouteId?: string;
  initialOnlyToday?: boolean;
  initialDate?: string;
  routeStates: { id: string; ruta: string }[];
}

// ---------- Photo viewer ----------
function PhotoViewer({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={label}
        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-brand-100 hover:text-brand-600 text-slate-500 flex items-center justify-center transition-colors"
      >
        <Eye className="w-4 h-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
              <span className="font-bold text-slate-700">{label}</span>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex justify-center bg-slate-900">
              <img src={url} alt={label} className="max-h-96 object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- Expanded loan row ----------
function LoanDetail({ loan, onOpenPaymentCard, onAdminPayment }: { loan: any, onOpenPaymentCard: (loanId: string) => void, onAdminPayment: (loan: any) => void }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
  // OJO: un saldo de 0 es válido (préstamo pagado). Nunca usar `||` aquí: 0 es "falsy"
  // y haría que se muestre la obligación inicial como deuda.
  const obligation = Number(loan.initial_obligation ?? 0);
  const rawBalance = loan.current_balance;
  const isPaidOff = loan.status === 'CANCELADO';
  const balance = isPaidOff
    ? 0
    : Math.max(0, Number(rawBalance ?? obligation));
  const totalPaid = Math.max(0, obligation - balance);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm">
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Prestado</p>
        <p className="font-black text-slate-800">{fmt(loan.amount_requested)}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Entregado</p>
        <p className="font-black text-slate-800">{fmt(loan.amount_delivered)}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Interés</p>
        <p className="font-black text-slate-800">{fmt(loan.interest_amount)}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Obligación Total</p>
        <p className="font-black text-slate-800">{fmt(loan.initial_obligation)}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Plazo</p>
        <p className="font-black text-slate-800">{loan.term_days} días</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Cuota diaria</p>
        <p className="font-black text-slate-800">{fmt(loan.daily_installment)}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Desembolso</p>
        <p className="font-black text-slate-800">
          {loan.disbursement_date
            ? new Date(loan.disbursement_date + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—'}
        </p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Estado préstamo</p>
        <p className="font-black text-slate-800">{loan.status}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Boleta</p>
        <p className="font-black text-slate-800">
          {loan.receipt_fee > 0 ? fmt(loan.receipt_fee) : 'No'}
        </p>
      </div>
      <div>
        <p className="text-purple-500 font-bold text-xs uppercase mb-1">Nº Sorteo</p>
        <p className="font-black text-purple-700 text-lg leading-none">{loan.raffle_number || '—'}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Domingos desc.</p>
        <p className="font-black text-slate-800">{loan.sundays_prepaid_count || 0}</p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Total Pagado</p>
        <p className="font-black text-emerald-600">
          {fmt(totalPaid)}
        </p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Deuda Actual</p>
        <p className={`font-black ${balance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(balance)}</p>
      </div>
      <div className="col-span-2 sm:col-span-4 mt-2 flex flex-col sm:flex-row sm:justify-end gap-2">
        {!isPaidOff && <button
          onClick={(e) => { e.stopPropagation(); onAdminPayment(loan); }}
          className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          <DollarSign className="w-4 h-4" />
          Registrar Cobro (Oficina)
        </button>}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenPaymentCard(loan.id); }}
          className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Ver Tarjeta de Cobros
        </button>
      </div>
    </div>
  );
}

// ---------- Main modal ----------
export function ClientsModal({ isOpen, onClose, initialRouteId = 'all', initialOnlyToday = false, initialDate = '', routeStates }: ClientsModalProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [createdDate, setCreatedDate] = useState<string>('');
  const [routeId, setRouteId] = useState(initialRouteId);
  // Por defecto se muestran solo los clientes con préstamo activo (igual que la ruta del cobrador).
  const [onlyActiveLoan, setOnlyActiveLoan] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentCardLoanId, setPaymentCardLoanId] = useState<string | null>(null);
  const [editClient, setEditClient] = useState<any | null>(null);
  const [adminPaymentLoan, setAdminPaymentLoan] = useState<any | null>(null);
  const [isCreateLoanOpen, setIsCreateLoanOpen] = useState(false);
  const [createLoanClientId, setCreateLoanClientId] = useState<string | undefined>(undefined);
  // Historial de préstamos del cliente
  const [historyClient, setHistoryClient] = useState<{ id: string; name: string } | null>(null);

  const todayStr = colombiaDateFromIso(new Date().toISOString());

  useEffect(() => {
    if (isOpen) {
      setRouteId(initialRouteId);
      setCreatedDate(initialDate || (initialOnlyToday ? todayStr : ''));
      // Si se abre para ver clientes nuevos de una fecha, no se filtra por préstamo activo
      setOnlyActiveLoan(!(initialOnlyToday || initialDate));
      setSearch('');
      setExpandedId(null);
    }
  }, [isOpen, initialRouteId, initialOnlyToday, initialDate]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await AdminService.getClients({ routeId, createdDate, search, onlyActiveLoan });
        setClients(data);
      } catch (error: any) {
        toast.error('Error cargando clientes: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    };
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [isOpen, routeId, createdDate, search, onlyActiveLoan, editClient, adminPaymentLoan, isCreateLoanOpen]);

  const handleDeleteClient = async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await confirmDanger({
      title: '¿Eliminar cliente?',
      text: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
    });
    if (!confirmed) return;

    try {
      await AdminService.deleteClient(clientId);
      toast.success('Cliente eliminado correctamente');
      setClients(prev => prev.filter(c => c.id !== clientId));
    } catch (error: any) {
      toast.error('Error al eliminar cliente. ' + (error.message || ''));
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  const statusColors: Record<string, string> = {
    ACTIVO: 'bg-emerald-100 text-emerald-700',
    INACTIVO: 'bg-slate-100 text-slate-600',
    MOROSO: 'bg-red-100 text-red-700',
    CLAVO: 'bg-orange-100 text-orange-700',
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end md:items-start justify-center md:pt-8 md:pb-4 md:px-4">
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[94dvh] md:max-h-[calc(100vh-4rem)]">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-800">Clientes</h3>
                <p className="text-sm font-medium text-slate-500">
                  {isLoading ? 'Cargando...' : `${clients.length} resultado${clients.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                onClick={() => { setCreateLoanClientId(undefined); setIsCreateLoanOpen(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nuevo Préstamo</span>
                <span className="sm:hidden">Nuevo</span>
              </button>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors sm:ml-2">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 shrink-0 bg-white items-stretch md:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, cédula o teléfono..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-brand-500 transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={routeId}
                  onChange={e => setRouteId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 font-medium text-slate-700"
                >
                  <option value="all">Todas las rutas</option>
                  {routeStates.map(r => (
                    <option key={r.id} value={r.id}>{r.ruta}</option>
                  ))}
                </select>
              </div>

              {/* Solo con préstamo activo */}
              <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyActiveLoan}
                  onChange={e => setOnlyActiveLoan(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                Solo con préstamo activo
              </label>

              {/* Date filter selector */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <Calendar className="w-4 h-4 text-brand-600 shrink-0" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">Fecha:</span>
                <input
                  type="date"
                  value={createdDate}
                  onChange={e => setCreatedDate(e.target.value)}
                  className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer"
                  title="Filtrar por fecha de adición del cliente"
                />
                {createdDate && (
                  <button
                    type="button"
                    onClick={() => setCreatedDate('')}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
                    title="Ver todos los clientes (quitar filtro de fecha)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setCreatedDate(createdDate === todayStr ? '' : todayStr)}
                className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${createdDate === todayStr
                    ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-brand-400'
                  }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Hoy
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-y-auto flex-1 pb-safe">
            {/* ===== Vista móvil: tarjetas (sin scroll horizontal; el detalle y los botones siempre quedan visibles) ===== */}
            <div className="md:hidden divide-y divide-slate-100">
              {isLoading ? (
                <div className="py-16 text-center">
                  <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
                </div>
              ) : clients.length === 0 ? (
                <p className="py-16 px-4 text-center text-slate-400 font-medium">No se encontraron clientes con los filtros actuales.</p>
              ) : (
                clients.map((c: any) => {
                  const activeLoan = c.loans?.find((l: any) => l.status === 'ACTIVO') || c.loans?.[0] || null;
                  const isExpanded = expandedId === c.id;
                  const loanCount = c.loans?.length ?? 0;
                  return (
                    <div key={c.id} className={`px-4 py-3 ${isExpanded ? 'bg-blue-50/40' : ''}`}>
                      <div className="flex items-start gap-2" onClick={() => activeLoan && toggleExpand(c.id)}>
                        <div className="pt-0.5 shrink-0 text-slate-400">
                          {activeLoan
                            ? (isExpanded ? <ChevronUp className="w-5 h-5 text-blue-500" /> : <ChevronDown className="w-5 h-5" />)
                            : <span className="block w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 break-words">{c.full_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 break-all">
                            <span className="font-mono">{c.document_id}</span>{c.phone ? ` · ${c.phone}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setEditClient(c)}
                            className="p-2.5 text-slate-400 hover:text-blue-600 rounded-lg"
                            title="Editar cliente"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteClient(c.id, e)}
                            className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Eliminar Cliente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 pl-7 flex flex-wrap items-center gap-2 text-xs" onClick={() => activeLoan && toggleExpand(c.id)}>
                        <span className={`px-2.5 py-1 rounded-lg font-bold ${statusColors[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setHistoryClient({ id: c.id, name: c.full_name }); }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 font-bold hover:bg-indigo-200 transition-colors"
                          title="Ver historial completo de préstamos de este cliente"
                        >
                          {loanCount} préstamo{loanCount !== 1 ? 's' : ''}
                        </button>
                        {activeLoan ? (
                          <span className="flex items-center gap-0.5 font-black text-slate-800 text-sm">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                            {formatCurrency(activeLoan.amount_requested)}
                          </span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCreateLoanClientId(c.id); setIsCreateLoanOpen(true); }}
                            className="text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg font-bold border border-brand-200"
                          >
                            Asignar préstamo
                          </button>
                        )}
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {c.photo_face_url && <PhotoViewer url={c.photo_face_url} label={`Foto persona — ${c.full_name}`} />}
                          {c.photo_doc_url && <PhotoViewer url={c.photo_doc_url} label={`Foto documento — ${c.full_name}`} />}
                        </div>
                      </div>

                      {isExpanded && activeLoan && (
                        <div className="mt-3">
                          <LoanDetail loan={activeLoan} onOpenPaymentCard={setPaymentCardLoanId} onAdminPayment={setAdminPaymentLoan} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* ===== Vista escritorio: tabla ===== */}
            <table className="hidden md:table w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold w-8"></th>
                  <th className="py-3 px-4 font-semibold">Nombre</th>
                  <th className="py-3 px-4 font-semibold">Cédula</th>
                  <th className="py-3 px-4 font-semibold">Teléfono</th>
                  <th className="py-3 px-4 font-semibold text-center" title="Total de préstamos que ha tenido el cliente, incluyendo el actual">Nº Préstamos</th>
                  <th className="py-3 px-4 font-semibold text-right">Préstamo</th>
                  <th className="py-3 px-4 font-semibold text-center">Fotos</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Registrado</th>
                  <th className="py-3 px-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : clients.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400 font-medium">
                      No se encontraron clientes con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  clients.map((c: any) => {
                    const activeLoan = c.loans?.find((l: any) => l.status === 'ACTIVO') || c.loans?.[0] || null;
                    const isExpanded = expandedId === c.id;
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/40' : ''}`}
                          onClick={() => activeLoan && toggleExpand(c.id)}
                        >
                          {/* Expand icon */}
                          <td className="py-3 px-4 text-slate-400">
                            {activeLoan
                              ? (isExpanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4" />)
                              : <span className="block w-4" />}
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {c.full_name}
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditClient(c); }}
                                className="text-slate-400 hover:text-blue-600 transition-colors p-1 bg-white rounded-md hover:bg-blue-50 border border-transparent hover:border-blue-100"
                                title="Editar cliente"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-mono text-sm">{c.document_id}</td>
                          <td className="py-3 px-4 text-slate-600">{c.phone || '—'}</td>
                          {/* Total de préstamos del cliente (históricos + actual). Cada préstamo nuevo o refinanciación es una fila en `loans`. */}
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setHistoryClient({ id: c.id, name: c.full_name })}
                              className="inline-flex items-center justify-center min-w-[2rem] px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-black hover:bg-indigo-200 transition-colors cursor-pointer"
                              title={`Ver historial completo: ${c.loans?.length ?? 0} préstamo${(c.loans?.length ?? 0) !== 1 ? 's' : ''} en total`}
                            >
                              {c.loans?.length ?? 0}
                            </button>
                          </td>

                          {/* Loan amount */}
                          <td className="py-3 px-4 text-right">
                            {activeLoan ? (
                              <div className="flex items-center justify-end gap-1">
                                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="font-black text-slate-800 text-sm">
                                  {formatCurrency(activeLoan.amount_requested)}
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateLoanClientId(c.id);
                                  setIsCreateLoanOpen(true);
                                }}
                                className="text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-brand-200"
                              >
                                Asignar préstamo
                              </button>
                            )}
                          </td>

                          {/* Photos */}
                          <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              {c.photo_face_url ? (
                                <div className="flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5 text-slate-400" />
                                  <PhotoViewer url={c.photo_face_url} label={`Foto persona — ${c.full_name}`} />
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5" /> —
                                </span>
                              )}
                              {c.photo_doc_url ? (
                                <div className="flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                                  <PhotoViewer url={c.photo_doc_url} label={`Foto documento — ${c.full_name}`} />
                                </div>
                              ) : (
                                <span className="text-slate-300 text-xs flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5" /> —
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${statusColors[c.status] || 'bg-slate-100 text-slate-600'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs whitespace-nowrap">
                            <p>{formatDate(c.created_at)}</p>
                            {c.creator && <p className="text-slate-400 mt-0.5">Por: {c.creator.full_name}</p>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={(e) => handleDeleteClient(c.id, e)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Eliminar Cliente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded loan detail row */}
                        {isExpanded && activeLoan && (
                          <tr key={`${c.id}-detail`} className="bg-blue-50/40">
                            <td colSpan={10} className="px-6 pb-4 pt-1">
                              <LoanDetail loan={activeLoan} onOpenPaymentCard={setPaymentCardLoanId} onAdminPayment={setAdminPaymentLoan} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {createdDate && !isLoading && (
            <div className="px-6 py-3 border-t border-slate-100 bg-brand-50 shrink-0 flex items-center justify-between text-sm text-brand-700 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-600" />
                <span>
                  Mostrando clientes agregados el{' '}
                  <strong className="font-bold text-brand-800">
                    {createdDate === todayStr ? `hoy (${createdDate})` : createdDate}
                  </strong>
                  {clients.length > 0 && ` (${clients.length} cliente${clients.length !== 1 ? 's' : ''})`}
                </span>
              </div>
              <button
                onClick={() => setCreatedDate('')}
                className="text-xs text-brand-700 hover:text-brand-900 underline font-bold"
              >
                Ver todos los clientes
              </button>
            </div>
          )}
        </div>
      </div>

      <PaymentCardModal
        isOpen={!!paymentCardLoanId}
        onClose={() => setPaymentCardLoanId(null)}
        loanId={paymentCardLoanId || ''}
      />

      <EditClientModal
        isOpen={!!editClient}
        onClose={() => setEditClient(null)}
        client={editClient}
        onUpdated={() => {
          setEditClient(null);
        }}
      />

      <AdminPaymentModal
        isOpen={!!adminPaymentLoan}
        onClose={() => setAdminPaymentLoan(null)}
        loan={adminPaymentLoan}
        onSuccess={() => { }}
      />

      <AdminCreateLoanModal
        isOpen={isCreateLoanOpen}
        onClose={() => setIsCreateLoanOpen(false)}
        routeStates={routeStates}
        onSuccess={() => { }}
        initialClientId={createLoanClientId}
      />

      <ClientLoanHistoryModal
        isOpen={!!historyClient}
        onClose={() => setHistoryClient(null)}
        clientId={historyClient?.id ?? null}
        clientName={historyClient?.name ?? ''}
      />
    </>
  );
}
