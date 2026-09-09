import { useState, useEffect } from 'react';
import { X, Search, Trophy, Gift, Calendar, CheckCircle, Eye } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';

import { supabase } from '@/lib/supabase';

interface LotteryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LotteryModule({ isOpen, onClose }: LotteryModalProps) {
  const [winningNumber, setWinningNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [draws, setDraws] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewLoans, setPreviewLoans] = useState<any[] | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDraws();
      setWinningNumber('');
      setPreviewLoans(null);
    }
  }, [isOpen]);

  const loadDraws = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getLotteryDraws();
      setDraws(data);
    } catch (error: any) {
      toast.error('Error al cargar historial de sorteos: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!winningNumber || winningNumber.length !== 3) return;
    setIsLoadingPreview(true);
    setPreviewLoans(null);
    try {
      const { data, error } = await supabase
        .from('loans')
        .select('id, raffle_number, client:clients(full_name, phone), route:routes(name)')
        .eq('status', 'ACTIVO')
        .eq('raffle_number', winningNumber);
      if (error) throw error;
      setPreviewLoans(data || []);
    } catch (error: any) {
      toast.error('Error al previsualizar: ' + error.message);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleProcessDraw = async () => {
    if (!winningNumber || winningNumber.length !== 3 || isNaN(Number(winningNumber))) {
      toast.error('Debes ingresar un número válido de 3 cifras (000-999)');
      return;
    }

    if (!confirm(`¿Estás seguro de procesar el sorteo con el número ganador ${winningNumber}? Esto perdonará la deuda de los ganadores y no se puede deshacer.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id || 'admin-local';

      const result = await AdminService.processLotteryDraw(winningNumber, adminId);
      
      if (result.winners_count > 0) {
        toast.success(`¡Sorteo procesado! Hubo ${result.winners_count} ganador(es). Premio total: $${result.total_prize.toLocaleString('es-CO')}`, { duration: 5000 });
      } else {
        toast.success('Sorteo procesado. No hubo ganadores esta vez.');
      }
      
      setWinningNumber('');
      loadDraws();
    } catch (error: any) {
      toast.error('Error al procesar sorteo: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-8 pb-4 px-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Sorteo de Boletas</h3>
              <p className="text-sm font-medium text-slate-500">
                Gestiona el juego de lotería semanal
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 flex flex-col gap-6">
          
          {/* Realizar Sorteo */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Gift className="w-5 h-5 text-brand-500" />
              Nuevo Sorteo Semanal
            </h4>
            
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Número ganador (Últimas 3 cifras)
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="Ej: 123"
                    value={winningNumber}
                    onChange={(e) => { setWinningNumber(e.target.value.replace(/\D/g, '')); setPreviewLoans(null); }}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-slate-50 font-black text-2xl tracking-[0.2em] outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:font-normal placeholder:tracking-normal placeholder:text-base"
                  />
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={handlePreview}
                  disabled={isLoadingPreview || winningNumber.length !== 3}
                  className="flex-1 sm:flex-none px-5 py-3.5 rounded-xl bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {isLoadingPreview ? (
                    <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  Ver
                </button>
                <button
                  onClick={handleProcessDraw}
                  disabled={isProcessing || winningNumber.length !== 3}
                  className="flex-1 sm:flex-none px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trophy className="w-5 h-5" />
                  )}
                  Procesar Ganadores
                </button>
              </div>
            </div>

            {/* Preview results */}
            {previewLoans !== null && (
              <div className={`mt-3 rounded-xl p-4 border ${
                previewLoans.length > 0
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                {previewLoans.length === 0 ? (
                  <p className="text-sm text-slate-500 font-medium text-center">
                    No hay préstamos activos con el número <strong>{winningNumber}</strong>. Nadie gana este sorteo.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-emerald-800 mb-2">
                      🏆 {previewLoans.length} cliente{previewLoans.length !== 1 ? 's' : ''} ganador{previewLoans.length !== 1 ? 'es' : ''} con boleta <strong>{winningNumber}</strong>:
                    </p>
                    <ul className="space-y-1.5">
                      {previewLoans.map((loan: any) => (
                        <li key={loan.id} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span className="font-semibold text-slate-800">{loan.client?.full_name}</span>
                          <span className="text-slate-400 text-xs">— {loan.route?.name || 'Sin ruta'}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <p className="text-sm text-slate-500 mt-4">
              Al procesar el sorteo, el sistema buscará todos los préstamos activos que coincidan con este número, dejará su deuda en <strong>cero</strong> y registrará a los ganadores en el historial.
            </p>
          </div>

          {/* Historial de Sorteos */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-slate-500" />
              Historial de Sorteos
            </h4>
            
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              </div>
            ) : draws.length === 0 ? (
              <div className="text-center py-8 text-slate-400 font-medium">
                Aún no se han realizado sorteos.
              </div>
            ) : (
              <div className="space-y-4">
                {draws.map(draw => (
                  <div key={draw.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center font-black text-xl text-purple-700 border border-purple-200">
                          {draw.winning_number}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{new Date(draw.draw_date + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                          <p className="text-xs text-slate-500">Procesado por: {draw.processed_by?.full_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-700">{draw.winners.length} ganador(es)</p>
                        <p className="text-sm text-emerald-600 font-bold">
                          {formatCurrency(draw.winners.reduce((sum: number, w: any) => sum + Number(w.prize_amount), 0))} entregados
                        </p>
                      </div>
                    </div>
                    {draw.winners.length > 0 && (
                      <div className="p-4 bg-white">
                        <ul className="space-y-2">
                          {draw.winners.map((w: any, i: number) => (
                            <li key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                <span className="font-bold text-slate-700">{w.loan?.client?.full_name}</span>
                                <span className="text-slate-400">({w.loan?.client?.phone || 'Sin teléfono'})</span>
                              </div>
                              <span className="font-black text-slate-800">{formatCurrency(w.prize_amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
