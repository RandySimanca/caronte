import { useState, useEffect } from 'react';
import { X, Smartphone, ExternalLink, ChevronDown, Search } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  routeStates: { id: string; ruta: string }[];
  initialRouteId?: string;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function TransferVouchersModal({ isOpen, onClose, routeStates, initialRouteId = 'all' }: Props) {
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeId, setRouteId] = useState(initialRouteId);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!isOpen) return;
    setRouteId(initialRouteId);
  }, [isOpen, initialRouteId]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await AdminService.getTransferPayments(date, routeId);
        setPayments(data);
      } catch (err: any) {
        toast.error('Error cargando transferencias: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isOpen, date, routeId]);

  if (!isOpen) return null;

  const totalTransfers = payments.reduce((s, p) => s + (p.total_amount || 0), 0);

  return (
    <>
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-2 shadow-lg z-10"
            >
              <X className="w-4 h-4 text-slate-700" />
            </button>
            <img src={lightboxUrl} alt="Comprobante" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
            <a
              href={lightboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 text-white/70 hover:text-white text-xs font-semibold transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en nueva pestana
            </a>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-[110] flex items-start justify-center pt-6 pb-4 px-4">
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 3rem)' }}>
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Transferencias del Dia</h3>
                <p className="text-xs font-medium text-slate-500">
                  {isLoading ? 'Cargando...' : `${payments.length} pago${payments.length !== 1 ? 's' : ''} · ${formatCurrency(totalTransfers)}`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={routeId}
                onChange={e => setRouteId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 flex-1"
              >
                <option value="all">Todas las rutas</option>
                {routeStates.map(r => (
                  <option key={r.id} value={r.id}>{r.ruta}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Smartphone className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-semibold">No hay pagos por transferencia</p>
                <p className="text-xs mt-1">para la fecha y ruta seleccionadas</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {payments.map((p: any) => {
                  const clientName = p.loan?.client?.full_name || '—';
                  const clientDoc = p.loan?.client?.document_id || '';
                  const collectorName = (p.collector as any)?.full_name || '—';
                  const hasVoucher = !!p.transfer_voucher_url;

                  return (
                    <div key={p.id} className="bg-white border border-indigo-100 rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                      {/* Voucher thumbnail or placeholder */}
                      <div className="shrink-0">
                        {hasVoucher ? (
                          <button
                            onClick={() => setLightboxUrl(p.transfer_voucher_url)}
                            className="w-16 h-16 rounded-xl overflow-hidden border-2 border-indigo-200 hover:border-indigo-500 transition-colors relative group"
                          >
                            <img
                              src={p.transfer_voucher_url}
                              alt="Voucher"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/30 flex items-center justify-center transition-colors">
                              <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-slate-300" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-800 leading-tight truncate">{clientName}</p>
                        <p className="text-xs text-slate-400 font-mono">{clientDoc}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-slate-500">Por: <span className="font-semibold text-slate-700">{collectorName}</span></span>
                          <span className="text-xs text-slate-400">{formatTime(p.collected_at)}</span>
                        </div>
                        {p.collector_observation && (
                          <p className="text-xs text-slate-500 italic mt-1 truncate">"{p.collector_observation}"</p>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="shrink-0 text-right">
                        <p className="font-black text-indigo-700 text-lg leading-tight">{formatCurrency(p.total_amount)}</p>
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">
                          <Smartphone className="w-3 h-3" />
                          Transferencia
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer total */}
          {payments.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 bg-indigo-50 shrink-0 flex items-center justify-between">
              <span className="font-bold text-indigo-700 text-sm">Total Transferencias</span>
              <span className="font-black text-indigo-700 text-xl">{formatCurrency(totalTransfers)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
