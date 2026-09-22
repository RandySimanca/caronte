import { useState, useMemo } from 'react';
import { ArrowLeft, CheckCircle, HandCoins, TrendingDown, TrendingUp, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function DailyClosingPage() {
  const navigate = useNavigate();
  const [baseAmount, setBaseAmount] = useState(0);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Settings: viático asignado
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const collectorViaticumSetting = settings?.find(s => s.key === 'collector_viaticum');
  const defaultViaticumSetting = settings?.find(s => s.key === 'default_viaticum');
  const dayClosedSetting = settings?.find(s => s.key === `day_closed_${today}`);
  const closed = dayClosedSetting?.value === true;
  
  const viaticumAsignado = collectorViaticumSetting != null
    ? Number(collectorViaticumSetting.value)
    : defaultViaticumSetting
      ? Number(defaultViaticumSetting.value)
      : 0;

  // Gastos del día
  const expenses = useLiveQuery(
    () => db.expenses.where('expense_date').equals(today).toArray(),
    [today]
  ) || [];
  const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  // Datos de cobros e instalamentos
  const loans = useLiveQuery(() => db.loans.where('status').equals('ACTIVO').toArray()) || [];
  const allLoans = useLiveQuery(() => db.loans.toArray()) || [];
  const installments = useLiveQuery(() => db.installments.toArray()) || [];

  // Operaciones de sincronización (para contar pendientes)
  const syncQueue = useLiveQuery(() => db.syncQueue.toArray(), []) || [];

  // Pagos por transferencia del día (guardados en settings con prefijo transfer_)
  // Y también obtenemos los pagos de oficina descargados en pullInitialData
  const allSettings = useLiveQuery(() => db.settings.toArray(), []) || [];
  
  const totalTransfers = useMemo(() => {
    const todayPrefix = `transfer_`;
    return allSettings
      .filter(s => s.key.startsWith(todayPrefix))
      .filter(s => {
        const val = s.value as { collectedAt?: string };
        return val?.collectedAt?.startsWith(today);
      })
      .reduce((sum, s) => sum + ((s.value as any).amount || 0), 0);
  }, [allSettings, today]);

  const { officeCash, officeTransfers } = useMemo(() => {
    const cash = allSettings.find(s => s.key === `office_cash_${today}`)?.value as number || 0;
    const transfers = allSettings.find(s => s.key === `office_transfers_${today}`)?.value as number || 0;
    return { officeCash: cash, officeTransfers: transfers };
  }, [allSettings, today]);
  
  const totalOfficePayments = officeCash + officeTransfers;

  const { expected, collected, newLoansDelivered, newLoansCount } = useMemo(() => {
    let exp = 0;
    let col = 0;

    for (const loan of loans) {
      const loanInsts = installments.filter(i => i.loan_id === loan.id);
      const arrearsInsts = loanInsts.filter(i =>
        i.scheduled_date < today && ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status)
      );
      const todayQuota = loan.start_date > today ? 0 : loan.daily_installment;
      const todayArrears = arrearsInsts.reduce((s, i) => s + i.balance, 0);
      exp += todayQuota + todayArrears;

      // Cobrado hoy: cualquier cuota (normal, atrasada o adelantada) cuyo
      // paid_date sea hoy y no sea un domingo pre-pagado automáticamente.
      // Esto incluye días atrasados pagados hoy (scheduled_date < today).
      const collectedToday = loanInsts
        .filter(i => i.paid_date === today && i.paid_amount > 0 && !i.is_prepaid)
        .reduce((s, i) => s + i.paid_amount, 0);
      col += collectedToday;
    }

    // Prestamos nuevos desembolsados hoy
    const todayLoans = allLoans.filter(l => l.disbursement_date === today);
    const newLoansDelivered = todayLoans.reduce((s, l) => s + (l.amount_delivered || 0), 0);
    const newLoansCount = todayLoans.length;

    return { expected: exp, collected: col, newLoansDelivered, newLoansCount };
  }, [loans, allLoans, installments, today]);

  const pendingSync = syncQueue.filter(op => op.status === 'pending' || op.status === 'failed').length;

  // Formula identica al admin:
  // Total a entregar = Base inicial + Total cobrado - Gastos - Viaticos - Prestamos nuevos - Transferencias cobrador - Pagos Oficina
  const totalEntregar = baseAmount + collected - totalExpenses - viaticumAsignado - newLoansDelivered - totalTransfers - totalOfficePayments;

  const handleClose = async () => {
    if (!baseAmount || baseAmount <= 0) {
      toast.error('La base inicial no puede estar vacía o en cero. Es necesaria para calcular el total a entregar.');
      return;
    }

    if (window.confirm('¿Estás seguro de que deseas cerrar el día? Esta acción no se puede deshacer y no podrás realizar más operaciones de cobro hoy.')) {
      try {
        await db.settings.put({ key: `day_closed_${today}`, value: true });
        toast.success('Día cerrado correctamente.');
      } catch (error) {
        toast.error('Error al cerrar el día.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <header className="bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-800">Cierre del Día</h1>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {closed && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-2xl flex items-center justify-center font-bold shadow-sm shadow-emerald-500/10"
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            Dia cerrado correctamente!
          </motion.div>
        )}

        {/* Base inicial -- cobrador digita lo que le dieron de base */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-600 font-bold text-sm">
              <HandCoins className="w-5 h-5" />
              Base inicial recibida
            </div>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatNumberInput(baseAmount.toString())}
                onChange={(e) => setBaseAmount(Number(parseNumberInput(e.target.value)) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-right font-bold text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                placeholder="0"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Dinero que el jefe le entrego para salir a cobrar hoy.
          </p>
        </div>

        {/* Resumen financiero */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800">Liquidacion del dia</h2>

          <div className="space-y-3">
            {/* Base inicial */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5 text-brand-600 font-semibold">
                <TrendingUp className="w-4 h-4" />
                (+) Base inicial
              </div>
              <span className="font-bold text-slate-800">{formatCurrency(baseAmount)}</span>
            </div>

            {/* Total cobrado */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <TrendingUp className="w-4 h-4" />
                (+) Total cobrado
              </div>
              <span className="font-bold text-slate-800">{formatCurrency(collected)}</span>
            </div>

            {/* Separador esperado */}
            <div className="flex justify-between text-xs text-slate-400 pl-5">
              <span>Esperado</span>
              <span>{formatCurrency(expected)}</span>
            </div>

            {/* Gastos */}
            <div className="flex justify-between items-center text-sm border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 text-rose-500 font-semibold">
                <TrendingDown className="w-4 h-4" />
                (-) Gastos del dia
              </div>
              <span className="font-semibold text-rose-500">-{formatCurrency(totalExpenses)}</span>
            </div>

            {/* Viaticos */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5 text-rose-500 font-semibold">
                <TrendingDown className="w-4 h-4 opacity-0" />
                (-) Viaticos
              </div>
              <span className="font-semibold text-rose-500">-{formatCurrency(viaticumAsignado)}</span>
            </div>

            {/* Prestamos nuevos */}
            {newLoansCount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-1.5 text-blue-500 font-semibold">
                  <TrendingDown className="w-4 h-4 opacity-0" />
                  (-) Prestamos nuevos ({newLoansCount})
                </div>
                <span className="font-semibold text-blue-500">-{formatCurrency(newLoansDelivered)}</span>
              </div>
            )}

            {/* Transferencias */}
            {totalTransfers > 0 && (
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-1.5 text-indigo-500 font-semibold">
                  <Smartphone className="w-4 h-4" />
                  (-) Tus cobros por transferencia
                </div>
                <span className="font-semibold text-indigo-500">-{formatCurrency(totalTransfers)}</span>
              </div>
            )}

            {/* Cobros en oficina */}
            {totalOfficePayments > 0 && (
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-1.5 text-orange-500 font-semibold">
                  <TrendingDown className="w-4 h-4 opacity-0" />
                  (-) Cobros en oficina (Admin)
                </div>
                <span className="font-semibold text-orange-500">-{formatCurrency(totalOfficePayments)}</span>
              </div>
            )}

            {/* Total a entregar */}
            <div className="flex justify-between items-center border-t-2 border-slate-200 pt-4 mt-2">
              <span className="font-black text-slate-800">TOTAL A ENTREGAR AL JEFE</span>
              <span className={`font-black text-xl ${totalEntregar >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatCurrency(totalEntregar)}
              </span>
            </div>

            {totalEntregar < 0 && (
              <p className="text-xs text-rose-500 text-right">
                El jefe te debe este valor.
              </p>
            )}
          </div>
        </div>

        {/* Sincronizacion */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">Sincronizacion</h2>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Estado</span>
            <span className={`font-bold ${pendingSync > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
              {pendingSync > 0 ? 'Pendiente' : 'Al dia'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Pendientes por sincronizar</span>
            <span className="font-bold text-slate-800">{pendingSync}</span>
          </div>
        </div>
      </div>

      {!closed && (
        <div className="p-4 bg-white border-t border-slate-100 space-y-3">
          <button
            onClick={handleClose}
            className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl shadow-md shadow-emerald-500/30"
          >
            Cerrar Dia
          </button>

          <button
            onClick={async () => {
              const { useAuthStore } = await import('@/stores/authStore');
              useAuthStore.getState().signOut();
            }}
            className="w-full bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all text-slate-700 font-bold py-3.5 rounded-xl border border-slate-200"
          >
            Cerrar Sesion
          </button>
        </div>
      )}

      {closed && (
        <div className="p-4 bg-white border-t border-slate-100">
          <button
            onClick={async () => {
              const { useAuthStore } = await import('@/stores/authStore');
              useAuthStore.getState().signOut();
            }}
            className="w-full bg-rose-50 hover:bg-rose-100 active:scale-[0.98] transition-all text-rose-600 font-bold py-3.5 rounded-xl border border-rose-200"
          >
            Cerrar Sesion
          </button>
        </div>
      )}
    </div>
  );
}
