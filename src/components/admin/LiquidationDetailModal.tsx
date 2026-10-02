import { useState, useEffect } from 'react';
import { X, CheckCircle, Calculator, TrendingDown, TrendingUp, HandCoins, UserCheck, Info } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { DailyLiquidationPdf } from '../reports/pdf/templates/DailyLiquidationPdf';
import { downloadExcel } from '../reports/excel/ExcelExporter';
import { FileDown, FileSpreadsheet } from 'lucide-react';

interface LiquidationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  route: any | null;
  dateStr: string;
}

export function LiquidationDetailModal({ isOpen, onClose, onSuccess, route, dateStr }: LiquidationDetailModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [baseAmount, setBaseAmount] = useState<number>(0);
  
  const currentUser = useAuthStore(state => state.user);

  useEffect(() => {
    if (isOpen && route) {
      loadDetail();
    }
  }, [isOpen, route]);

  const loadDetail = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getRouteLiquidationDetail(route.id, dateStr);
      setDetail(data);
    } catch (error) {
      toast.error('Error al cargar detalle de liquidación');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!currentUser || !route || !detail) return;
    setIsApproving(true);
    try {
      await AdminService.approveLiquidation({
        routeId: route.id,
        collectorId: route.cobradorId,
        date: dateStr,
        totalCobrado: detail.totalCobrado,
        totalGastos: detail.totalGastos,
        viaticoDia: detail.viaticoDia,
        totalEntregar: detail.totalEntregar + baseAmount,
        totalPrestado: detail.totalPrestado,
        totalTransferencias: detail.totalTransferencias || 0,
        baseAmount: baseAmount,
        adminId: currentUser.id
      });
      toast.success('Liquidación aprobada exitosamente');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al aprobar liquidación');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReopen = async () => {
    if (!route || !dateStr) return;
    if (!window.confirm('¿Estás seguro de que deseas reabrir este día?')) return;
    
    try {
      await AdminService.reopenLiquidation(route.id, dateStr);
      toast.success('Día reabierto exitosamente');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al reabrir el día');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const exportPdf = async () => {
    try {
      const blob = await pdf(<DailyLiquidationPdf 
        dateStr={dateStr}
        routeName={route.ruta}
        collectorName={route.cobrador}
        detail={detail}
        baseAmount={baseAmount}
      />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Liquidacion_${route.ruta}_${dateStr}.pdf`;
      link.click();
    } catch (error) {
      toast.error('Error al generar PDF');
    }
  };

  const exportExcel = () => {
    try {
      downloadExcel([
        { sheetName: 'Liquidación', data: [
          { Concepto: 'Base Inicial', Valor: baseAmount },
          { Concepto: 'Total Recaudado', Valor: detail.totalCobrado },
          { Concepto: 'Cobros por Transferencia', Valor: -(detail.totalTransferencias || 0) },
          { Concepto: 'Gastos Operativos', Valor: -detail.totalGastos },
          { Concepto: 'Viático Asignado', Valor: -detail.viaticoDia },
          { Concepto: 'Préstamos Nuevos', Valor: -detail.totalPrestado },
          { Concepto: 'Total A Entregar', Valor: detail.totalEntregar + baseAmount },
          { Concepto: 'Salario Mensual Cobrador (Referencia)', Valor: detail.salarioCobrador || 0 }
        ]},
        { sheetName: 'Detalle Gastos', data: detail.detalleGastos.map((g: any) => ({
          Categoria: g.category?.name || 'Otros',
          Monto: g.amount
        }))}
      ], `Liquidacion_${route.ruta}_${dateStr}`);
    } catch (error) {
      toast.error('Error al generar Excel');
    }
  };

  if (!isOpen || !route) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-xl w-full max-w-lg max-h-[min(92dvh,920px)] flex flex-col overflow-hidden transform transition-all">
        <div className="shrink-0 px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-slate-800 truncate">Liquidación de Ruta</h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">{route.ruta} • {route.cobrador}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
            </div>
          ) : detail ? (
            <div className="space-y-5 sm:space-y-6">
              
              {/* Resumen Matemático */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3 sm:space-y-4">
                
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 text-brand-600 font-bold text-sm sm:text-base">
                    <HandCoins className="w-5 h-5 shrink-0" />
                    (+) Base Inicial (Mañana)
                  </div>
                  <div className="relative w-full sm:w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={formatNumberInput(baseAmount.toString())} 
                      onChange={(e) => setBaseAmount(Number(parseNumberInput(e.target.value)) || 0)} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-right font-bold text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center gap-3 pt-1">
                  <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm sm:text-base min-w-0">
                    <TrendingUp className="w-5 h-5 shrink-0" />
                    <span className="truncate">(+) Recaudo del día</span>
                  </div>
                  <span className="font-black text-slate-800 text-base sm:text-lg shrink-0">{formatCurrency(detail.totalCobrado)}</span>
                </div>

                <div className="flex justify-between items-center gap-3 text-rose-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2 font-bold text-sm sm:text-base min-w-0">
                    <TrendingDown className="w-5 h-5 shrink-0" />
                    <span className="truncate">(-) Gastos reportados</span>
                  </div>
                  <span className="font-bold shrink-0">-{formatCurrency(detail.totalGastos)}</span>
                </div>

                <div className="flex justify-between items-center gap-3 text-rose-600">
                  <div className="flex items-center gap-2 font-bold text-sm sm:text-base min-w-0">
                    <TrendingDown className="w-5 h-5 opacity-0 shrink-0" />
                    <span className="truncate">(-) Viático del día</span>
                  </div>
                  <span className="font-bold shrink-0">-{formatCurrency(detail.viaticoDia)}</span>
                </div>

                <div className="flex justify-between items-center gap-3 text-indigo-600">
                  <div className="flex items-center gap-2 font-bold text-sm sm:text-base min-w-0">
                    <TrendingDown className="w-5 h-5 opacity-0 shrink-0" />
                    <span className="truncate">(-) Cobros por transferencia</span>
                  </div>
                  <span className="font-bold shrink-0">-{formatCurrency(detail.totalTransferencias || 0)}</span>
                </div>

                <div className="flex justify-between items-center gap-3 text-blue-600">
                  <div className="flex items-center gap-2 font-bold text-sm sm:text-base min-w-0">
                    <HandCoins className="w-5 h-5 opacity-0 shrink-0" />
                    <span className="truncate">(-) Préstamos Nuevos ({detail.prestamosNuevos})</span>
                  </div>
                  <span className="font-bold shrink-0">-{formatCurrency(detail.totalPrestado)}</span>
                </div>

                <div className="flex justify-between items-center gap-3 border-t-2 border-slate-200 pt-4 mt-2">
                  <span className="text-base sm:text-lg font-black text-slate-800">TOTAL A ENTREGAR</span>
                  <span className={`text-xl sm:text-2xl font-black shrink-0 ${detail.totalEntregar + baseAmount < 0 ? 'text-rose-600' : 'text-brand-600'}`}>
                    {formatCurrency(detail.totalEntregar + baseAmount)}
                  </span>
                </div>
              </div>

              {/* Costos de Personal — informativo */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  Costos de Personal (referencia)
                  <div className="ml-auto group relative">
                    <Info className="w-4 h-4 text-amber-400 cursor-help" />
                    <div className="hidden group-hover:block absolute right-0 top-5 w-56 bg-slate-800 text-white text-xs rounded-xl p-3 z-10 shadow-xl">
                      Estos costos son informativos. El salario se paga de forma separada y no se descuenta del monto diario a entregar.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-3 border border-amber-100">
                    <p className="text-xs text-slate-500 mb-1">Viático del día</p>
                    <p className="text-sm sm:text-base font-black text-slate-800">{formatCurrency(detail.viaticoDia)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Descargado del recaudo</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-amber-100">
                    <p className="text-xs text-slate-500 mb-1">Salario mensual</p>
                    <p className="text-sm sm:text-base font-black text-amber-600">{formatCurrency(detail.salarioCobrador || 0)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Pago por fuera</p>
                  </div>
                </div>
                {(detail.salarioCobrador || 0) > 0 && (
                  <p className="text-xs text-amber-600 font-medium">
                    Costo total de personal del día: {formatCurrency(detail.viaticoDia + (detail.salarioCobrador || 0) / 30)}
                    <span className="text-amber-400 font-normal"> (viático + salario/30)</span>
                  </p>
                )}
              </div>

              {route.estado === 'Liquidado' ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex flex-col items-center justify-center font-bold space-y-3">
                  <div className="flex items-center text-center text-sm sm:text-base">
                    <CheckCircle className="w-5 h-5 mr-2 shrink-0" />
                    Esta ruta ya fue liquidada hoy.
                  </div>
                  <button
                    onClick={handleReopen}
                    className="px-4 py-2 bg-white text-emerald-700 border border-emerald-300 rounded-lg text-sm hover:bg-emerald-100 transition-colors"
                  >
                    Reabrir Día
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
                >
                  {isApproving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Aprobar y Cerrar Caja
                    </>
                  )}
                </button>
              )}

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pb-1">
                <button onClick={exportPdf} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                  <FileDown className="w-4 h-4" />
                  Imprimir (PDF)
                </button>
                <button onClick={exportExcel} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  Exportar Excel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
