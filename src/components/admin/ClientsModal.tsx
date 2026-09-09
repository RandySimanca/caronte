import React, { useState, useEffect } from 'react';
import { X, Search, Users, Calendar, Filter, CheckCircle, Camera, FileText, DollarSign, ChevronDown, ChevronUp, Eye, Trash2, Edit } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';
import { PaymentCardModal } from './PaymentCardModal';
import { EditClientModal } from './EditClientModal';

interface ClientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRouteId?: string;
  initialOnlyToday?: boolean;
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
function LoanDetail({ loan, onOpenPaymentCard }: { loan: any, onOpenPaymentCard: (loanId: string) => void }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
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
          {fmt((loan.initial_obligation || 0) - (loan.current_balance || loan.initial_obligation || 0))}
        </p>
      </div>
      <div>
        <p className="text-blue-500 font-bold text-xs uppercase mb-1">Deuda Actual</p>
        <p className="font-black text-red-600">{fmt(loan.current_balance || loan.initial_obligation || 0)}</p>
      </div>
      <div className="col-span-2 sm:col-span-4 mt-2 flex justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenPaymentCard(loan.id); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Ver Tarjeta de Cobros
        </button>
      </div>
    </div>
  );
}

// ---------- Main modal ----------
export function ClientsModal({ isOpen, onClose, initialRouteId = 'all', initialOnlyToday = false, routeStates }: ClientsModalProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyToday, setOnlyToday] = useState(initialOnlyToday);
  const [routeId, setRouteId] = useState(initialRouteId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentCardLoanId, setPaymentCardLoanId] = useState<string | null>(null);
  const [editClient, setEditClient] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRouteId(initialRouteId);
      setOnlyToday(initialOnlyToday);
      setSearch('');
      setExpandedId(null);
    }
  }, [isOpen, initialRouteId, initialOnlyToday]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await AdminService.getClients({ routeId, onlyToday, search });
        setClients(data);
      } catch (error: any) {
        toast.error('Error cargando clientes: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    };
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [isOpen, routeId, onlyToday, search, editClient]); // Added editClient dependency to refresh after edit

  const handleDeleteClient = async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Está seguro de que desea eliminar a este cliente? Esta acción no se puede deshacer.')) {
      return;
    }
    
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
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-8 pb-4 px-4">
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Clientes</h3>
              <p className="text-sm font-medium text-slate-500">
                {isLoading ? 'Cargando...' : `${clients.length} resultado${clients.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0 bg-white">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o teléfono..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-brand-500 transition"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={routeId}
              onChange={e => setRouteId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">Todas las rutas</option>
              {routeStates.map(r => (
                <option key={r.id} value={r.id}>{r.ruta}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setOnlyToday(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
              onlyToday
                ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-500/20'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-brand-400'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Solo hoy
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold w-8"></th>
                <th className="py-3 px-4 font-semibold">Nombre</th>
                <th className="py-3 px-4 font-semibold">Cédula</th>
                <th className="py-3 px-4 font-semibold">Teléfono</th>
                <th className="py-3 px-4 font-semibold">Ruta</th>
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
                  <td colSpan={9} className="py-16 text-center">
                    <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400 font-medium">
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
                        <td className="py-3 px-4 text-slate-600">{(c.route as any)?.name || '—'}</td>

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
                            <span className="text-slate-400 text-xs">Sin préstamo</span>
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
                          <td colSpan={9} className="px-6 pb-4 pt-1">
                            <LoanDetail loan={activeLoan} onOpenPaymentCard={setPaymentCardLoanId} />
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
        {onlyToday && !isLoading && (
          <div className="px-6 py-3 border-t border-slate-100 bg-brand-50 shrink-0 flex items-center gap-2 text-sm text-brand-700 font-medium">
            <CheckCircle className="w-4 h-4" />
            Mostrando solo clientes creados hoy
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
    </>
  );
}
