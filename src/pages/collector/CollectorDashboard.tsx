import { Bell, ChevronRight, RefreshCw, AlertCircle, WifiOff, CalendarCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useSyncStore } from '@/stores/syncStore';
import { SyncService } from '@/services/SyncService';
import { useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { PrepaidTodayModal } from '@/components/admin/PrepaidTodayModal';

export function CollectorDashboard() {
  const dateStr = format(new Date(), "EEEE, dd MMM yyyy", { locale: es });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const today = format(new Date(), 'yyyy-MM-dd');

  const { isOnline, isSyncing } = useSyncStore();
  const user = useAuthStore(state => state.user);

  // Refresca datos del servidor cada vez que el dashboard monta (para ver cambios del admin)
  useEffect(() => {
    if (isOnline && user?.id) {
      SyncService.pullInitialData(user.id);
    }
  }, [isOnline, user?.id]);

  // Live data from Dexie
  const routes = useLiveQuery(() => db.routes.toArray()) || [];
  const clients = useLiveQuery(() => db.clients.toArray()) || [];
  const loans = useLiveQuery(() => db.loans.where('status').equals('ACTIVO').toArray()) || [];
  const installments = useLiveQuery(() => db.installments.toArray()) || [];
  const pendingOps = useLiveQuery(() => db.syncQueue.where('status').anyOf(['pending', 'failed']).count()) || 0;

  const routeName = routes.length > 0 ? routes[0].name : 'Cargando ruta...';

  const [isPrepaidModalOpen, setIsPrepaidModalOpen] = useState(false);

  const stats = useMemo(() => {
    let expected = 0;
    let collected = 0;
    let arrearsTotal = 0;
    let arrearsClients = 0;
    let visitedCount = 0;
    let newCount = 0;
    const prepaidTodayClients: { loanId: string; clientName: string; amount: number; paidDate: string }[] = [];

    for (const loan of loans) {
      const loanInsts = installments.filter(i => i.loan_id === loan.id);
      const todayInst = loanInsts.find(i => i.scheduled_date === today);
      const arrearsInsts = loanInsts.filter(i =>
        i.scheduled_date < today && ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status)
      );

      // Si la cuota de hoy ya fue adelantada (balance=0), no suma al esperado.
      // Usamos el balance real de la cuota en vez del daily_installment fijo.
      const todayBalance = loan.start_date > today
        ? 0
        : (todayInst ? todayInst.balance : loan.daily_installment);
      const todayArrears = arrearsInsts.reduce((s, i) => s + i.balance, 0);

      expected += todayBalance + todayArrears;

      // Detectar cuotas adelantadas para hoy: pagadas ANTES de hoy
      if (todayInst && todayInst.balance <= 0 && todayInst.paid_date && todayInst.paid_date < today) {
        const client = clients.find(c => c.id === loan.client_id);
        prepaidTodayClients.push({
            loanId: loan.id,
            clientName: client?.full_name || 'Cliente desconocido',
            amount: loan.daily_installment,
            paidDate: todayInst.paid_date,
          });
      }

      // Cobrado hoy:
      // Cualquier cuota (del día, atraso o adelanto futuro) cuyo paid_date sea hoy
      // y no sea un domingo pre-pagado automáticamente al crear el préstamo.
      // Esto es equivalente a la lógica del admin (loan_installments WHERE paid_date = hoy).
      // Una cuota adelantada en días anteriores tiene paid_date != hoy → NO se cuenta.
      const collectedToday = loanInsts
        .filter(i =>
          i.paid_date === today && i.paid_amount > 0 && !i.is_prepaid
        )
        .reduce((s, i) => s + i.paid_amount, 0);
      collected += collectedToday;

      if (todayArrears > 0) arrearsClients++;
      arrearsTotal += todayArrears;

      const isTodayPaid = todayInst && todayInst.balance <= 0;
      const isFutureStart = loan.start_date > today;

      if (isFutureStart) {
        newCount++;
      } else if (isTodayPaid && todayArrears === 0) {
        visitedCount++;
      }
    }

    return {
      expected,
      collected,
      pending: Math.max(expected - collected, 0),
      clientsTotal: clients.length,
      clientsVisited: visitedCount,
      clientsNew: newCount,
      clientsPending: clients.length - visitedCount - newCount,
      arrearsAmount: arrearsTotal,
      arrearsClients,
      prepaidTodayCount: prepaidTodayClients.length,
      prepaidTodayClients,
    };
  }, [loans, installments, clients, today]);

  const collectedPercent = stats.expected > 0 ? Math.round((stats.collected / stats.expected) * 100) : 0;
  const pendingPercent = 100 - collectedPercent;

  const handleSync = async () => {
    await SyncService.pushPendingOperations();
    if (user?.id) {
      await SyncService.pullInitialData(user.id);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buenos días!</h1>
          <p className="text-sm text-slate-500 capitalize">{capitalizedDate}</p>
          <div className="mt-1.5 flex items-center">
            <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-700/20">
              Ruta: {routeName}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${
            isOnline
              ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
              : 'text-rose-600 bg-rose-50 border-rose-100'
          }`}>
            {isOnline ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>En línea</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Sin conexión</span>
              </>
            )}
          </div>
          <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <Bell className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Blue Card */}
      <div className="bg-brand-600 rounded-2xl p-5 text-white shadow-lg shadow-brand-500/25 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-brand-900 opacity-20 rounded-full -ml-10 -mb-10 blur-xl"></div>
        <div className="relative z-10">
          <p className="text-sm text-brand-100 mb-1">Total esperado (hoy)</p>
          <p className="text-4xl font-bold tracking-tight">{formatCurrency(stats.expected)}</p>
        </div>
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500 rounded-2xl p-4 text-white shadow-sm shadow-emerald-500/20">
          <p className="text-emerald-50 text-xs font-medium">Cobrado (hoy)</p>
          <p className="text-2xl font-bold mt-1 mb-2">{formatCurrency(stats.collected)}</p>
          <div className="w-full bg-emerald-700/30 rounded-full h-1.5 mb-1">
            <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${collectedPercent}%` }}></div>
          </div>
          <p className="text-[10px] text-emerald-100 text-right">{collectedPercent}%</p>
        </div>

        <div className="bg-orange-400 rounded-2xl p-4 text-white shadow-sm shadow-orange-400/20">
          <p className="text-orange-50 text-xs font-medium">Por cobrar (hoy)</p>
          <p className="text-2xl font-bold mt-1 mb-2">{formatCurrency(stats.pending)}</p>
          <div className="w-full bg-orange-600/30 rounded-full h-1.5 mb-1">
            <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${pendingPercent}%` }}></div>
          </div>
          <p className="text-[10px] text-orange-100 text-right">{pendingPercent}%</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <p className="text-slate-500 text-xs font-medium">Clientes visitados</p>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            <span className="text-brand-600">{stats.clientsVisited}</span>
            <span className="text-slate-300 text-xl font-medium"> / {stats.clientsTotal - stats.clientsNew}</span>
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <p className="text-slate-500 text-xs font-medium leading-tight">Pendientes por visitar</p>
          <p className="text-2xl font-bold text-slate-800 mt-2">{stats.clientsPending}</p>
        </div>
      </div>

      {/* Arrears card */}
      {stats.arrearsAmount > 0 && (
        <button className="w-full bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform">
          <div className="flex items-start">
            <div className="bg-rose-100 p-2 rounded-full mr-3 text-rose-500">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-rose-600 text-xs font-semibold uppercase tracking-wider mb-0.5">Atrasos por recuperar</p>
              <p className="text-xl font-bold text-rose-700">{formatCurrency(stats.arrearsAmount)}</p>
              <p className="text-xs text-rose-500 mt-1">De {stats.arrearsClients} clientes</p>
            </div>
          </div>
          <ChevronRight className="text-rose-300 w-5 h-5" />
        </button>
      )}

      {/* Cuotas adelantadas para hoy */}
      {stats.prepaidTodayCount > 0 && (
        <button
          onClick={() => setIsPrepaidModalOpen(true)}
          className="w-full bg-white rounded-2xl border-2 border-indigo-200 shadow-sm p-4 hover:shadow-md hover:border-indigo-400 transition-all text-left flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center relative shrink-0">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm">
                {stats.prepaidTodayCount}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 leading-tight">Adelantadas (hoy)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ya pagadas en días anteriores
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-indigo-300 group-hover:translate-x-1 transition-transform" />
        </button>
      )}

      {/* Sync Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Operaciones pendientes</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (window.confirm('¿Forzar limpieza y resincronizar? ADVERTENCIA: Perderás cobros offline no enviados.')) {
                  await db.syncQueue.clear();
                  useSyncStore.getState().setPendingCount(0);
                  if (user?.id) {
                    await SyncService.pullInitialData(user.id);
                  }
                }
              }}
              className="text-slate-500 hover:text-rose-600 text-xs font-medium flex items-center bg-slate-100 hover:bg-rose-50 px-3 py-1.5 rounded-full transition-colors"
            >
              Forzar limpieza
            </button>
            <button
              onClick={handleSync}
              disabled={!isOnline || isSyncing || pendingOps === 0}
              className="text-brand-600 text-xs font-medium flex items-center bg-brand-50 px-3 py-1.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
        </div>
        <div className="flex justify-around items-center text-center">
          <div className="flex-1">
            <p className="text-xl font-bold text-slate-700">{pendingOps}</p>
            <p className="text-[10px] uppercase text-slate-400 font-semibold mt-1">Operaciones</p>
          </div>
          <div className="w-px h-8 bg-slate-100"></div>
          <div className="flex-1">
            <p className={`text-sm font-semibold mt-1 ${isOnline ? 'text-emerald-600' : 'text-rose-500'}`}>
              {isOnline ? 'En línea' : 'Offline'}
            </p>
            <p className="text-[10px] uppercase text-slate-400 font-semibold mt-1">Estado</p>
          </div>
        </div>
      </div>

      <PrepaidTodayModal
        isOpen={isPrepaidModalOpen}
        onClose={() => setIsPrepaidModalOpen(false)}
        clients={stats.prepaidTodayClients}
      />
    </div>
  );
}
