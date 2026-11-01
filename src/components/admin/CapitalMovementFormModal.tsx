import { useEffect, useMemo, useState } from 'react';
import { X, HandCoins, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminService } from '@/services/AdminService';
import { CapitalMovementService } from '@/services/CapitalMovementService';
import { useAuthStore } from '@/stores/authStore';
import { colombiaToday } from '@/lib/dailyCollection';
import { confirmAction } from '@/lib/swal';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import { KIND_LABELS, periodLabel, type CapitalKind } from '@/lib/capitalMovements';

interface RouteOption {
  id: string;
  ruta: string;
  cobrador?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama al guardar, para que la pantalla de afuera se refresque. */
  onSaved: () => void;
  kind: CapitalKind;
  /** Ruta sugerida. Si no se pasa y es un pago al cobrador, se usa su ruta activa. */
  defaultRouteId?: string | null;
  /** A quién se le paga (solo SALARIO_COBRADOR). En SALARIO_ADMIN el beneficiario es quien está logueado. */
  beneficiary?: { id: string; name: string } | null;
  /** Mes que cubre el pago, YYYY-MM-01 (solo salarios). */
  periodMonth?: string;
  /** Monto con el que se abre el formulario (por ejemplo lo que falta por pagar). */
  defaultAmount?: number;
  /** Salario del mes completo, para avisar si el pago lo supera. */
  dueAmount?: number;
  /** Lo ya pagado de ese mes. */
  alreadyPaid?: number;
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none';

const TITLES: Record<CapitalKind, string> = {
  APORTE_CAPITAL: 'Agregar capital a la ruta',
  SALARIO_COBRADOR: 'Pagar salario al cobrador',
  SALARIO_ADMIN: 'Retirar mi salario',
};

export function CapitalMovementFormModal({
  isOpen,
  onClose,
  onSaved,
  kind,
  defaultRouteId,
  beneficiary,
  periodMonth,
  defaultAmount = 0,
  dueAmount = 0,
  alreadyPaid = 0,
}: Props) {
  const adminId = useAuthStore(state => state.user?.id);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routeId, setRouteId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO');
  const [date, setDate] = useState('');
  const [earliest, setEarliest] = useState('');
  const [note, setNote] = useState('');
  const [month, setMonth] = useState(''); // YYYY-MM (solo salarios)
  const [available, setAvailable] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const isSalary = kind !== 'APORTE_CAPITAL';
  const amount = Number(parseNumberInput(amountStr)) || 0;
  const today = colombiaToday();

  // Al abrir: campos en limpio y lista de rutas
  useEffect(() => {
    if (!isOpen) return;
    setAmountStr(defaultAmount > 0 ? formatNumberInput(String(Math.round(defaultAmount))) : '');
    setMethod('EFECTIVO');
    setNote('');
    setDate('');
    setEarliest('');
    setAvailable(null);
    setMonth(periodMonth ? periodMonth.slice(0, 7) : today.slice(0, 7));

    let cancelled = false;
    (async () => {
      try {
        const list = (await AdminService.getRouteStates()) as RouteOption[];
        if (cancelled) return;
        setRoutes(list);

        let initial = defaultRouteId || '';
        if (!initial && kind === 'SALARIO_COBRADOR' && beneficiary) {
          initial = (await CapitalMovementService.getCollectorRouteId(beneficiary.id)) || '';
        }
        if (cancelled) return;
        setRouteId(list.some(r => r.id === initial) ? initial : list.length === 1 ? list[0].id : '');

        // El retiro del admin sugiere el monto del último retiro registrado
        if (kind === 'SALARIO_ADMIN' && adminId && !(defaultAmount > 0)) {
          const last = await CapitalMovementService.getLastAdminSalary(adminId);
          if (!cancelled && last > 0) setAmountStr(formatNumberInput(String(Math.round(last))));
        }
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Error al cargar las rutas');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Al elegir ruta: primera fecha posible (si hoy ya está liquidado, es mañana)
  useEffect(() => {
    if (!isOpen || !routeId) return;
    let cancelled = false;
    CapitalMovementService.getEarliestDate(routeId)
      .then(d => {
        if (cancelled) return;
        setEarliest(d);
        setDate(d);
      })
      .catch((error: any) => {
        if (!cancelled) toast.error(error.message || 'Error al consultar la ruta');
      });
    return () => { cancelled = true; };
  }, [isOpen, routeId]);

  // Dinero disponible en la ruta a esa fecha (para avisar si el retiro lo supera)
  useEffect(() => {
    if (!isOpen || !routeId || !date || !isSalary) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    CapitalMovementService.getOpeningBase(routeId, date)
      .then(r => { if (!cancelled) setAvailable(r.base); })
      .catch(() => { if (!cancelled) setAvailable(null); });
    return () => { cancelled = true; };
  }, [isOpen, routeId, date, isSalary]);

  const beneficiaryInfo = useMemo(() => {
    if (kind === 'SALARIO_ADMIN') return adminId ? { id: adminId, name: 'Tú (administrador)' } : null;
    if (kind === 'SALARIO_COBRADOR') return beneficiary || null;
    return null;
  }, [kind, adminId, beneficiary]);

  if (!isOpen) return null;

  const exceedsAvailable = isSalary && available !== null && amount > available;
  const exceedsSalary = kind === 'SALARIO_COBRADOR' && dueAmount > 0 && alreadyPaid + amount > dueAmount;
  const routeName = routes.find(r => r.id === routeId)?.ruta || '';
  const periodMonthValue = month ? `${month}-01` : '';
  const dateIsFuture = !!earliest && earliest > today;

  const submit = async () => {
    if (!adminId) return;
    if (!routeId) return toast.error('Elige la ruta');
    if (amount <= 0) return toast.error('Digita el monto');
    if (!date) return toast.error('Elige la fecha');
    if (isSalary && !beneficiaryInfo) return toast.error('Falta el beneficiario del pago');
    if (isSalary && !periodMonthValue) return toast.error('Elige el mes que cubre el pago');

    const detail = isSalary
      ? `${beneficiaryInfo?.name} &mdash; ${periodLabel(periodMonthValue)}<br/>`
      : '';
    const confirmed = await confirmAction({
      title: kind === 'APORTE_CAPITAL' ? '¿Registrar el aporte de capital?' : '¿Registrar el pago?',
      html: `${detail}Ruta <strong>${routeName}</strong><br/>
             Monto: <strong>${formatCurrency(amount)}</strong><br/>
             ${kind === 'APORTE_CAPITAL' ? 'Sube' : 'Baja'} la base de la ruta desde el <strong>${date}</strong>.`,
      confirmText: 'Sí, registrar',
    });
    if (!confirmed) return;

    setIsBusy(true);
    try {
      const base = { routeId, amount, method, note, date, adminId };
      if (kind === 'APORTE_CAPITAL') {
        await CapitalMovementService.registerAporte(base);
        toast.success('Aporte registrado');
      } else {
        await CapitalMovementService.registerSalary({
          ...base,
          kind,
          beneficiaryId: beneficiaryInfo!.id,
          periodMonth: periodMonthValue,
        });
        toast.success('Pago registrado');
      }
      onSaved();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al registrar el movimiento');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-xl w-full max-w-md max-h-[min(92dvh,760px)] flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <HandCoins className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-800 truncate">{TITLES[kind]}</h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">
                {isSalary && beneficiaryInfo ? beneficiaryInfo.name : KIND_LABELS[kind]}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600">
              {kind === 'APORTE_CAPITAL' ? 'Ruta a la que agregas el dinero' : 'Ruta de la que sale el dinero'}
            </label>
            <select value={routeId} onChange={e => setRouteId(e.target.value)} className={inputCls}>
              <option value="">Elige la ruta…</option>
              {routes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.ruta}{r.cobrador && r.cobrador !== 'Sin asignar' ? ` · ${r.cobrador}` : ''}
                </option>
              ))}
            </select>
          </div>

          {isSalary && (
            <div>
              <label className="text-xs font-bold text-slate-600">Mes que cubre el pago</label>
              {kind === 'SALARIO_ADMIN' ? (
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputCls} />
              ) : (
                <p className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 capitalize">
                  {periodMonthValue ? periodLabel(periodMonthValue) : '—'}
                </p>
              )}
              {kind === 'SALARIO_COBRADOR' && dueAmount > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  Salario del mes {formatCurrency(Math.round(dueAmount))} · ya pagado {formatCurrency(Math.round(alreadyPaid))}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-600">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
              <input
                value={amountStr}
                inputMode="numeric"
                onChange={e => setAmountStr(formatNumberInput(e.target.value))}
                className={`${inputCls} pl-7 text-right font-bold`}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600">Cómo se hizo</label>
              <select value={method} onChange={e => setMethod(e.target.value as 'EFECTIVO' | 'TRANSFERENCIA')} className={inputCls}>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600">Cuenta desde</label>
              <input type="date" value={date} min={earliest || undefined} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            {dateIsFuture
              ? `Hoy esa ruta ya está liquidada: el movimiento cuenta desde el ${earliest}.`
              : 'Entra a la base de la liquidación de esa fecha en adelante.'}
          </p>

          {available !== null && (
            <p className="text-xs text-slate-500">
              Dinero disponible en la ruta a esa fecha: <strong className="text-slate-700">{formatCurrency(available)}</strong>
            </p>
          )}
          {exceedsAvailable && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>El monto supera lo disponible en la ruta. Si lo registras, la base de ese día queda en $0.</span>
            </div>
          )}
          {exceedsSalary && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Con este pago superas el salario del mes por {formatCurrency(Math.round(alreadyPaid + amount - dueAmount))}.</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-600">Nota (opcional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls} />
          </div>

          <button
            onClick={submit}
            disabled={isBusy || amount <= 0 || !routeId || !date}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm"
          >
            {isBusy ? 'Guardando…' : kind === 'APORTE_CAPITAL' ? 'Registrar aporte' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
