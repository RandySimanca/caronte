import { useState, useEffect } from 'react';
import { X, CheckCircle, Calculator, TrendingDown, TrendingUp, HandCoins, UserCheck, Info } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';
import { confirmDanger, confirmAction } from '@/lib/swal';
import { pdf } from '@react-pdf/renderer';
import { DailyLiquidationPdf } from '../reports/pdf/templates/DailyLiquidationPdf';
import { downloadExcel } from '../reports/excel/ExcelExporter';
import { FileDown, FileSpreadsheet, CheckCheck } from 'lucide-react';
import { CashLedgerService } from '@/services/CashLedgerService';
import { CollectorCashAccountModal } from './CollectorCashAccountModal';
import { computeDifference, type CashBalances } from '@/lib/cashLedger';


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
  // Fecha del cierre anterior de donde se tomó la base automática (null = base manual o sin cierre previo)
  const [baseFromDate, setBaseFromDate] = useState<string | null>(null);
  // Cierre guardado en la base de datos para esta ruta y fecha (null si aún no existe)
  const [closing, setClosing] = useState<any | null>(null);
  // 'live': día abierto, se calcula en vivo | 'snapshot': liquidado con respaldo | 'legacy': liquidado sin respaldo
  const [source, setSource] = useState<'live' | 'snapshot' | 'legacy'>('live');
  // Efectivo que el admin cuenta y recibe del cobrador (texto del input) y la explicación de una diferencia
  const [actualStr, setActualStr] = useState('');
  const [observations, setObservations] = useState('');
  // Faltante / sobrante pendientes del cobrador en su cuenta de efectivo (null = aún no cargado o sin migración)
  const [balances, setBalances] = useState<CashBalances | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const currentUser = useAuthStore(state => state.user);

  useEffect(() => {
    if (!isOpen || !route) return;
    let cancelled = false;

    const load = async () => {
      // Reiniciar todo para no arrastrar datos de otra ruta o fecha (p. ej. la base)
      setIsLoading(true);
      setDetail(null);
      setBaseAmount(0);
      setBaseFromDate(null);
      setClosing(null);
      setSource('live');
      setActualStr('');
      setObservations('');
      setBalances(null);
      try {
        const closingRow = await AdminService.getClosingForDate(route.id, dateStr);
        if (cancelled) return;

        if (closingRow?.is_closed && closingRow.snapshot?.detail) {
          // Día liquidado con respaldo: mostrar exactamente lo aprobado, sin recalcular
          setDetail(closingRow.snapshot.detail);
          setBaseAmount(Number(closingRow.base_amount ?? closingRow.snapshot.base_amount ?? 0));
          setSource('snapshot');
        } else {
          // Día abierto, reabierto, o liquidado antes del respaldo: cálculo en vivo
          const data = await AdminService.getRouteLiquidationDetail(route.id, dateStr);
          if (cancelled) return;
          setDetail(data);
          // La base ya guardada se precarga (también al reabrir un día)
          if (closingRow) {
            setBaseAmount(Number(closingRow.base_amount || 0));
          } else {
            // Día sin liquidación guardada: la base es el total a entregar del cierre anterior (editable por el admin)
            try {
              const prev = await AdminService.getPreviousClosing(route.id, dateStr);
              if (cancelled) return;
              if (prev && prev.amount > 0) {
                setBaseAmount(prev.amount);
                setBaseFromDate(prev.date);
              }
            } catch {
              // Sin cierre anterior disponible: la base queda en 0 y se puede digitar
            }
          }
          setSource(closingRow?.is_closed ? 'legacy' : 'live');
        }
        setClosing(closingRow);
        // Cuenta de efectivo del cobrador: es informativa, si falla no se bloquea la liquidación
        if (route.cobradorId) {
          CashLedgerService.getBalances(route.cobradorId)
            .then(b => { if (!cancelled) setBalances(b); })
            .catch(() => undefined);
        }
      } catch (error) {
        if (cancelled) return;
        toast.error('Error al cargar detalle de liquidación');
        onClose();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen, route?.id, dateStr]);

  const isClosed = closing ? !!closing.is_closed : route?.estado === 'Liquidado';
  const totalFinal = detail ? detail.totalEntregar + baseAmount : 0;
  // Si el total esperado es <= 0 el admin no recibe efectivo, así que no hay nada que contar
  const needsCashCount = totalFinal > 0;
  const actualCash = actualStr === '' ? null : Number(parseNumberInput(actualStr));
  const cashEntered = !needsCashCount || actualCash !== null;
  const liveDifference = needsCashCount && actualCash !== null ? computeDifference(totalFinal, actualCash) : 0;
  const needsObservation = liveDifference !== 0 && observations.trim().length < 3;
  // Los cierres anteriores a esta función (sin snapshot versión 2) no tienen conteo real de efectivo
  const closedCounted = !!closing?.is_closed && (closing?.snapshot?.version ?? 0) >= 2;
  const approvedAtLabel = closing?.closed_at
    ? new Date(closing.closed_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const handleApprove = async () => {
    if (!currentUser || !route || !detail) return;
    if (!cashEntered) {
      toast.error('Digita el efectivo que entregó el cobrador');
      return;
    }
    if (needsObservation) {
      toast.error('Hay una diferencia de caja: escribe una observación que la explique');
      return;
    }

    const diffHtml = liveDifference === 0
      ? '<span style="color:#059669">Caja cuadrada</span>'
      : liveDifference < 0
        ? `<span style="color:#dc2626">Faltante: <strong>${formatCurrency(Math.abs(liveDifference))}</strong> (queda a cargo del cobrador)</span>`
        : `<span style="color:#d97706">Sobrante: <strong>${formatCurrency(liveDifference)}</strong> (queda por aclarar)</span>`;
    const confirmed = await confirmAction({
      title: '¿Aprobar y cerrar caja?',
      html: `<strong>${route.cobrador}</strong> &mdash; Ruta <strong>${route.ruta}</strong><br/>
             Total esperado: <strong style="color:#059669">${formatCurrency(totalFinal)}</strong>${needsCashCount
          ? `<br/>Efectivo recibido: <strong>${formatCurrency(actualCash ?? 0)}</strong><br/>${diffHtml}`
          : ''}`,
      confirmText: 'Sí, aprobar',
    });
    if (!confirmed) return;

    setIsApproving(true);
    try {
      await AdminService.approveLiquidation({
        routeId: route.id,
        collectorId: route.cobradorId,
        date: dateStr,
        totalCobrado: detail.totalCobrado,
        totalGastos: detail.totalGastos,
        viaticoDia: detail.viaticoDia,
        totalEntregar: totalFinal,
        actualDelivery: needsCashCount ? actualCash : totalFinal,
        observations: observations.trim(),
        totalPrestado: detail.totalPrestado,
        totalTransferencias: detail.totalTransferencias || 0,
        baseAmount: baseAmount,
        adminId: currentUser.id,
        routeName: route.ruta,
        collectorName: route.cobrador,
        detail,
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
    const confirmed = await confirmDanger({
      title: '¿Reabrir este día?',
      text: 'El día volverá a estado abierto y el cobrador podrá continuar operando.',
      confirmText: 'Sí, reabrir',
    });
    if (!confirmed) return;

    try {
      await AdminService.reopenLiquidation(route.id, dateStr);
      toast.success('Día reabierto exitosamente');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al reabrir el día');
    }
  };

  // Texto libre del gasto (p. ej. lo que el cobrador escribió en "Otros"); oculta el texto genérico "Gasto de X"
  const gastoDetalle = (g: any): string => {
    const d = (g?.description || '').trim();
    if (!d || /^gasto de /i.test(d)) return (g?.observation || '').trim();
    return d;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Conteo de efectivo para PDF/Excel: el guardado si el día está liquidado; el que se está digitando si no
  const reportActual = isClosed
    ? (closedCounted ? Number(closing.actual_delivery) : null)
    : (needsCashCount ? actualCash : null);
  const reportDifference = reportActual === null
    ? null
    : (isClosed ? Number(closing?.difference || 0) : liveDifference);
  const reportObservations = isClosed ? (closing?.observations || null) : (observations.trim() || null);

  const exportPdf = async () => {
    try {
      const blob = await pdf(<DailyLiquidationPdf
        dateStr={dateStr}
        routeName={route.ruta}
        collectorName={route.cobrador}
        detail={detail}
        baseAmount={baseAmount}
        source={source}
        approvedAt={closing?.closed_at || null}
        approvedTotal={closing?.is_closed ? Number(closing.expected_delivery) : null}
        actualDelivery={reportActual}
        difference={reportDifference}
        observations={reportObservations}
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
        {
          sheetName: 'Liquidación', data: [
            { Concepto: 'Base Inicial', Valor: baseAmount },
            { Concepto: 'Total Recaudado', Valor: detail.totalCobrado },
            { Concepto: 'Cobros por Transferencia', Valor: -(detail.totalTransferencias || 0) },
            { Concepto: 'Gastos Operativos', Valor: -detail.totalGastos },
            { Concepto: 'Viático Asignado', Valor: -detail.viaticoDia },
            { Concepto: 'Préstamos Nuevos', Valor: -detail.totalPrestado },
            { Concepto: 'Total A Entregar', Valor: detail.totalEntregar + baseAmount },
            ...(reportActual !== null ? [
              { Concepto: 'Efectivo Recibido', Valor: reportActual },
              { Concepto: 'Diferencia (negativo = faltante, positivo = sobrante)', Valor: reportDifference ?? 0 },
            ] : []),
            { Concepto: 'Salario Mensual Cobrador (Referencia)', Valor: detail.salarioCobrador || 0 }
          ]
        },
        {
          sheetName: 'Detalle Gastos', data: detail.detalleGastos.map((g: any) => ({
            Categoria: g.category?.name || 'Otros',
            Detalle: gastoDetalle(g),
            Monto: g.amount
          }))
        },
        {
          sheetName: 'Préstamos Nuevos', data: (detail.detallePrestamos || []).map((l: any) => ({
            Cliente: l.cliente,
            Monto: l.monto
          }))
        }
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

              {source === 'snapshot' && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium rounded-xl p-3 flex gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Valores guardados al aprobar{approvedAtLabel ? ` el ${approvedAtLabel}` : ''}. No cambian aunque después se corrijan cobros.
                  </span>
                </div>
              )}

              {source === 'legacy' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-medium rounded-xl p-3 flex gap-2">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Liquidación anterior sin respaldo detallado: los valores se recalcularon con los datos actuales.
                    {closing && Number(closing.expected_delivery) !== detail.totalEntregar + baseAmount && (
                      <> Total aprobado en su momento: <strong>{formatCurrency(Number(closing.expected_delivery))}</strong>.</>
                    )}
                  </span>
                </div>
              )}

              {balances && (balances.debt > 0 || balances.surplus > 0) && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-medium rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Este cobrador tiene
                    {balances.debt > 0 && <> un faltante por reponer de <strong>{formatCurrency(balances.debt)}</strong></>}
                    {balances.debt > 0 && balances.surplus > 0 && ' y'}
                    {balances.surplus > 0 && <> un sobrante por aclarar de <strong>{formatCurrency(balances.surplus)}</strong></>}.
                  </span>
                  <button onClick={() => setAccountOpen(true)} className="px-3 py-1 bg-white border border-amber-300 rounded-lg font-bold hover:bg-amber-100">
                    Ver cuenta
                  </button>
                </div>
              )}

              {/* Resumen Matemático */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3 sm:space-y-4">

                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 text-brand-600 font-bold text-sm sm:text-base">
                    <HandCoins className="w-5 h-5 shrink-0" />
                    (+) Base inicial (inicio del día)
                  </div>
                  <div className="relative w-full sm:w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberInput(baseAmount.toString())}
                      onChange={(e) => setBaseAmount(Number(parseNumberInput(e.target.value)) || 0)}
                      disabled={isClosed}
                      title={isClosed ? 'Día liquidado: reábrelo para modificar la base' : undefined}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-1.5 text-right font-bold text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      placeholder="0"
                    />
                  </div>
                </div>
                {baseFromDate && !isClosed && (
                  <p className="text-xs text-slate-400 -mt-1 px-1">
                    Tomada automáticamente del cierre del {baseFromDate}. Puedes ajustarla si hoy fue distinta.
                  </p>
                )}

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

                {(detail.detalleGastos?.length ?? 0) > 0 && (
                  <ul className="ml-7 -mt-1 bg-white border border-rose-100 rounded-xl divide-y divide-rose-50 text-xs sm:text-sm">
                    {detail.detalleGastos.map((g: any, i: number) => (
                      <li key={i} className="flex justify-between items-start gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-700 truncate">{g.category?.name || 'Otros'}</p>
                          {gastoDetalle(g) && <p className="text-slate-500 break-words">{gastoDetalle(g)}</p>}
                        </div>
                        <span className="font-bold text-rose-600 shrink-0">{formatCurrency(Number(g.amount))}</span>
                      </li>
                    ))}
                  </ul>
                )}

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

              {/* Conteo de efectivo: lo que realmente recibe el admin */}
              {!isClosed && (needsCashCount ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="font-bold text-slate-800 text-sm sm:text-base">Efectivo recibido del cobrador</label>
                    {/*cuadrar exacto*/}
                    <button
                      type="button"
                      onClick={() => setActualStr(formatNumberInput(String(Math.round(totalFinal))))}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 active:scale-95 border border-brand-200 text-brand-700 text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-all"
                    >
                      <CheckCheck className="w-4 h-4" />
                      Cuadra exacto
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={actualStr}
                      onChange={(e) => setActualStr(formatNumberInput(e.target.value))}
                      placeholder="Cuenta el dinero y digítalo"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-right text-lg font-black text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  {actualCash !== null && (
                    <div className={`flex justify-between items-center rounded-lg px-3 py-2 text-sm font-bold ${liveDifference === 0 ? 'bg-emerald-50 text-emerald-700'
                        : liveDifference < 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                      <span>{liveDifference === 0 ? 'Caja cuadrada' : liveDifference < 0 ? 'Faltante (lo debe el cobrador)' : 'Sobrante (por aclarar)'}</span>
                      {liveDifference !== 0 && <span>{formatCurrency(Math.abs(liveDifference))}</span>}
                    </div>
                  )}
                  {liveDifference !== 0 && (
                    <div>
                      <label className="text-xs font-bold text-slate-600">
                        Observación de la diferencia (obligatoria)
                      </label>
                      <textarea
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        rows={2}
                        placeholder={liveDifference < 0 ? 'Qué dijo el cobrador del faltante' : 'Posible cobro que no se digitó, etc.'}
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  El total a entregar es $0 o negativo: no hay efectivo por recibir del cobrador, así que no hay nada que contar.
                </p>
              ))}

              {isClosed && closing && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 text-sm">
                  {closedCounted ? (
                    <>
                      <div className="flex justify-between"><span className="text-slate-500">Total esperado</span><span className="font-bold text-slate-800">{formatCurrency(Number(closing.expected_delivery))}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Efectivo recibido</span><span className="font-bold text-slate-800">{formatCurrency(Number(closing.actual_delivery))}</span></div>
                      <div className={`flex justify-between font-black ${Number(closing.difference) === 0 ? 'text-emerald-600' : Number(closing.difference) < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                        <span>{Number(closing.difference) === 0 ? 'Caja cuadrada' : Number(closing.difference) < 0 ? 'Faltante' : 'Sobrante'}</span>
                        {Number(closing.difference) !== 0 && <span>{formatCurrency(Math.abs(Number(closing.difference)))}</span>}
                      </div>
                      {closing.observations && <p className="text-xs text-slate-500 break-words">“{closing.observations}”</p>}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Cierre anterior al conteo de efectivo: no tiene efectivo recibido ni diferencia registrados.</p>
                  )}
                </div>
              )}

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

              {isClosed ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex flex-col items-center justify-center font-bold space-y-3">
                  <div className="flex items-center text-center text-sm sm:text-base">
                    <CheckCircle className="w-5 h-5 mr-2 shrink-0" />
                    Esta ruta ya fue liquidada{approvedAtLabel ? ` (${approvedAtLabel})` : ''}.
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
                  disabled={isApproving || !cashEntered || needsObservation}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
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

      <CollectorCashAccountModal
        isOpen={accountOpen}
        onClose={() => setAccountOpen(false)}
        collectorId={route.cobradorId ?? null}
        collectorName={route.cobrador}
        onChanged={() => {
          if (route.cobradorId) CashLedgerService.getBalances(route.cobradorId).then(setBalances).catch(() => undefined);
        }}
      />
    </div>
  );
}
