import { useEffect, useMemo, useState } from 'react';
import { X, HandCoins, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminService } from '@/services/AdminService';
import { CapitalMovementService } from '@/services/CapitalMovementService';
import { useAuthStore } from '@/stores/authStore';
import { colombiaToday } from '@/lib/dailyCollection';
import { confirmAction } from '@/lib/swal';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import { KIND_LABELS, SOURCE_LABELS, periodLabel, type CapitalKind, type CapitalSource } from '@/lib/capitalMovements';

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
  /** Ruta sugerida. Si no se pasa y es un pago a un cobrador, se usa la ruta activa del cobrador elegido. */
  defaultRouteId?: string | null;
  /** Cobrador ya elegido (atajo desde su nómina). Sin esto, el formulario pide elegirlo de la lista. */
  beneficiary?: { id: string; name: string } | null;
  /** Mes que cubre el pago, YYYY-MM-01 (solo salarios). Por defecto, el mes actual. */
  periodMonth?: string;
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none';

const TITLES: Record<CapitalKind, string> = {
  APORTE_CAPITAL: 'Ingreso de dinero a la ruta',
  SALARIO_COBRADOR: 'Pago a un cobrador',
  SALARIO_ADMIN: 'Retiro de mi salario',
  RETIRO_OTRO: 'Otro retiro de la ruta',
};

export function CapitalMovementFormModal({
  isOpen,
  onClose,
  onSaved,
  kind,
  defaultRouteId,
  beneficiary,
  periodMonth,
}: Props) {
  const adminId = useAuthStore(state => state.user?.id);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [collectors, setCollectors] = useState<{ id: string; name: string }[]>([]);
  const [routeId, setRouteId] = useState('');
  const [collectorId, setCollectorId] = useState('');
  const [source, setSource] = useState<CapitalSource>('RUTA');
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO');
  const [date, setDate] = useState('');
  const [earliest, setEarliest] = useState('');
  const [note, setNote] = useState('');
  const [month, setMonth] = useState(''); // YYYY-MM (solo salarios)
  const [available, setAvailable] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const isSalary = kind === 'SALARIO_COBRADOR' || kind === 'SALARIO_ADMIN';
  // Los pagos de salario pueden salir de otro dinero; los ingresos y los otros retiros siempre son de la ruta
  const fromRoute = !isSalary || source === 'RUTA';
  const amount = Number(parseNumberInput(amountStr)) || 0;
  const today = colombiaToday();

  // Al abrir: todo en limpio (el monto NO se rellena: lo digita el admin) y listas de rutas y cobradores
  useEffect(() => {
    if (!isOpen) return;
    setAmountStr('');
    setMethod('EFECTIVO');
    setNote('');
    setDate('');
    setEarliest('');
    setAvailable(null);
    setSource('RUTA');
    setCollectorId(beneficiary?.id || '');
    setMonth(periodMonth ? periodMonth.slice(0, 7) : today.slice(0, 7));

    let cancelled = false;
    (async () => {
      try {
        const [list, people] = await Promise.all([
          AdminService.getRouteStates() as Promise<RouteOption[]>,
          kind === 'SALARIO_COBRADOR' && !beneficiary ? CapitalMovementService.getCollectors() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setRoutes(list);
        setCollectors(people);

        let initial = defaultRouteId || '';
        if (!initial && beneficiary) {
          initial = (await CapitalMovementService.getCollectorRouteId(beneficiary.id)) || '';
        }
        if (cancelled) return;
        setRouteId(list.some(r => r.id === initial) ? initial : list.length === 1 ? list[0].id : '');
      } catch (error: any) {
        if (!cancelled) toast.error(error.message || 'Error al cargar los datos');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Al elegir un cobrador de la lista, se sugiere su ruta activa (se puede cambiar)
  useEffect(() => {
    if (!isOpen || kind !== 'SALARIO_COBRADOR' || beneficiary || !collectorId) return;
    let cancelled = false;
    CapitalMovementService.getCollectorRouteId(collectorId)
      .then(id => { if (!cancelled && id && routes.some(r => r.id === id)) setRouteId(id); })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectorId]);

  // Fecha: en dinero de la ruta, la primera libre (si hoy ya está liquidado, mañana); si no, hoy
  useEffect(() => {
    if (!isOpen) return;
    if (!fromRoute) {
      setEarliest('');
      setDate(today);
      return;
    }
    if (!routeId) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, routeId, fromRoute]);

  // Dinero disponible en la ruta a esa fecha (para avisar si el pago o retiro lo supera)
  useEffect(() => {
    if (!isOpen || !routeId || !date || !fromRoute || kind === 'APORTE_CAPITAL') {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    CapitalMovementService.getOpeningBase(routeId, date)
      .then(r => { if (!cancelled) setAvailable(r.base); })
      .catch(() => { if (!cancelled) setAvailable(null); });
    return () => { cancelled = true; };
  }, [isOpen, routeId, date, fromRoute, kind]);

  const beneficiaryInfo = useMemo(() => {
    if (kind === 'SALARIO_ADMIN') return adminId ? { id: adminId, name: 'Tú (administrador)' } : null;
    if (kind === 'SALARIO_COBRADOR') {
      if (beneficiary) return beneficiary;
      const c = collectors.find(x => x.id === collectorId);
      return c ? { id: c.id, name: c.name } : null;
    }
    return null;
  }, [kind, adminId, beneficiary, collectors, collectorId]);

  if (!isOpen) return null;

  const exceedsAvailable = fromRoute && kind !== 'APORTE_CAPITAL' && available !== null && amount > available;
  const routeName = routes.find(r => r.id === routeId)?.ruta || '';
  const periodMonthValue = month ? `${month}-01` : '';
  const dateIsFuture = fromRoute && !!earliest && earliest > today;
  const noteRequired = kind === 'RETIRO_OTRO';
  const routeRequired = fromRoute;

  const submit = async () => {
    if (!adminId) return;
    if (routeRequired && !routeId) return toast.error('Elige la ruta');
    if (isSalary && !beneficiaryInfo) return toast.error(kind === 'SALARIO_COBRADOR' ? 'Elige el cobrador' : 'Falta el beneficiario del pago');
    if (amount <= 0) return toast.error('Digita el monto');
    if (!date) return toast.error('Elige la fecha');
    if (isSalary && !periodMonthValue) return toast.error('Elige el mes que cubre el pago');
    if (noteRequired && note.trim().length < 3) return toast.error('Escribe en la nota para qué es el retiro');

    const effect = kind === 'APORTE_CAPITAL'
      ? `Sube la base de la ruta desde el <strong>${date}</strong>.`
      : fromRoute
        ? `Baja la base de la ruta desde el <strong>${date}</strong>.`
        : 'Se paga con otro dinero: <strong>no toca la base ni el efectivo de la ruta</strong>.';
    const detail = isSalary ? `${beneficiaryInfo?.name} &mdash; ${periodLabel(periodMonthValue)}<br/>` : '';
    const confirmed = await confirmAction({
      title: kind === 'APORTE_CAPITAL' ? '¿Registrar el ingreso?' : kind === 'RETIRO_OTRO' ? '¿Registrar el retiro?' : '¿Registrar el pago?',
      html: `${detail}${routeName ? `Ruta <strong>${routeName}</strong><br/>` : ''}
             Monto: <strong>${formatCurrency(amount)}</strong><br/>${effect}`,
      confirmText: 'Sí, registrar',
    });
    if (!confirmed) return;

    setIsBusy(true);
    try {
      const common = { amount, method, note, date, adminId };
      if (kind === 'APORTE_CAPITAL') {
        await CapitalMovementService.registerAporte({ ...common, routeId });
        toast.success('Ingreso registrado');
      } else if (kind === 'RETIRO_OTRO') {
        await CapitalMovementService.registerRetiro({ ...common, routeId });
        toast.success('Retiro registrado');
      } else {
        await CapitalMovementService.registerSalary({
          ...common,
          kind,
          source,
          routeId: routeId || null,
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

  const submitLabel = kind === 'APORTE_CAPITAL' ? 'Registrar ingreso' : kind === 'RETIRO_OTRO' ? 'Registrar retiro' : 'Registrar pago';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-xl w-full max-w-md max-h-[min(92dvh,800px)] flex flex-col overflow-hidden">
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
          {kind === 'SALARIO_COBRADOR' && !beneficiary && (
            <div>
              <label className="text-xs font-bold text-slate-600">Cobrador al que le pagas</label>
              <select value={collectorId} onChange={e => setCollectorId(e.target.value)} className={inputCls}>
                <option value="">Elige el cobrador…</option>
                {collectors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {isSalary && (
            <div>
              <label className="text-xs font-bold text-slate-600">De dónde sale el dinero</label>
              <select value={source} onChange={e => setSource(e.target.value as CapitalSource)} className={inputCls}>
                <option value="RUTA">{SOURCE_LABELS.RUTA}</option>
                <option value="EXTERNO">{SOURCE_LABELS.EXTERNO}</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                {source === 'RUTA'
                  ? 'Baja la base de la liquidación de la ruta.'
                  : 'Lo pagas con otro dinero: queda registrado y cuenta como salario pagado, pero la base de la ruta no cambia.'}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-600">
              {kind === 'APORTE_CAPITAL'
                ? 'Ruta a la que agregas el dinero'
                : fromRoute
                  ? 'Ruta de la que sale el dinero'
                  : 'Ruta (opcional, para que cuente en sus reportes)'}
            </label>
            <select value={routeId} onChange={e => setRouteId(e.target.value)} className={inputCls}>
              <option value="">{routeRequired ? 'Elige la ruta…' : 'Sin ruta'}</option>
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
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputCls} />
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
              <label className="text-xs font-bold text-slate-600">{fromRoute ? 'Cuenta desde' : 'Fecha del pago'}</label>
              <input type="date" value={date} min={fromRoute ? earliest || undefined : undefined} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          {fromRoute && (
            <p className="text-xs text-slate-500 -mt-2">
              {dateIsFuture
                ? `Hoy esa ruta ya está liquidada: el movimiento cuenta desde el ${earliest}.`
                : 'Entra a la base de la liquidación de esa fecha en adelante.'}
            </p>
          )}

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

          <div>
            <label className="text-xs font-bold text-slate-600">{noteRequired ? 'Nota (obligatoria: para qué es el retiro)' : 'Nota (opcional)'}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls} />
          </div>

          <button
            onClick={submit}
            disabled={isBusy || amount <= 0 || !date || (routeRequired && !routeId)}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm"
          >
            {isBusy ? 'Guardando…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
