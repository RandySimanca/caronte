import { Bell, ChevronRight, RefreshCw, WifiOff, CalendarCheck, Trophy } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { mergeTodayPayments, paymentsTodaySettingKey, sumTodayPayments } from '@/lib/dailyCollection';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useSyncStore } from '@/stores/syncStore';
import { SyncService } from '@/services/SyncService';
import { useMemo, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { PrepaidTodayModal } from '@/components/admin/PrepaidTodayModal';
import { NewLoansTodayModal } from '@/components/admin/NewLoansTodayModal';
import { applyLotteryDrawLocally, isLotteryWinnerLoan, parseLotteryLastDraw } from '@/lib/lottery';
import { NavLink } from 'react-router-dom';

export function CollectorDashboard() {
  const dateStr = format(new Date(), "EEEE, dd MMM yyyy", { locale: es });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const today = format(new Date(), 'yyyy-MM-dd');

  const { isOnline, isSyncing } = useSyncStore();
  const user = useAuthStore(state => state.user);

  // Refresca datos del servidor cada vez que el dashboard monta (para ver cambios del admin)
  useEffect(() => {
    if (isOnline && user?.id) {
      SyncService.fullSync(user.id);
    }
  }, [isOnline, user?.id]);

  // Live data from Dexie
  const routes = useLiveQuery(() => db.routes.toArray()) || [];
  const clients = useLiveQuery(() => db.clients.toArray()) || [];
  const loans = useLiveQuery(() => db.loans.where('status').equals('ACTIVO').toArray()) || [];
  const allLoans = useLiveQuery(() => db.loans.toArray()) || [];
  const installments = useLiveQuery(() => db.installments.toArray()) || [];
  const pendingOps = useLiveQuery(() => db.syncQueue.where('status').anyOf(['pending', 'failed']).count()) || 0;
  const syncQueue = useLiveQuery(() => db.syncQueue.toArray(), []) || [];
  const allSettings = useLiveQuery(() => db.settings.toArray(), []) || [];
  const lotterySetting = useLiveQuery(() => db.settings.get('lottery_last_draw'));

  const routeName = routes.length > 0 ? routes[0].name : 'Cargando ruta...';

  const [isPrepaidModalOpen, setIsPrepaidModalOpen] = useState(false);
  const [isNewLoansModalOpen, setIsNewLoansModalOpen] = useState(false);

  const lotteryDraw = parseLotteryLastDraw(lotterySetting?.value);

  useEffect(() => {
    if (lotteryDraw) applyLotteryDrawLocally(lotteryDraw).catch(() => {});
  }, [lotterySetting?.value]);

  const lotteryWinners = useMemo(() => {
    if (!lotteryDraw) return [];
    const seen = new Set<string>();
    const list: { clientId: string; name: string; raffle: string }[] = [];
    for (const loan of allLoans) {
      if (!isLotteryWinnerLoan(loan, lotteryDraw)) continue;
      if (seen.has(loan.client_id)) continue;
      seen.add(loan.client_id);
      list.push({
        clientId: loan.client_id,
        name: clients.find(c => c.id === loan.client_id)?.full_name || 'Cliente',
        raffle: loan.raffle_number || lotteryDraw.winning_number,
      });
    }
    for (const clientId of lotteryDraw.winner_client_ids || []) {
      if (seen.has(clientId)) continue;
      seen.add(clientId);
      list.push({
        clientId,
        name: clients.find(c => c.id === clientId)?.full_name || 'Cliente',
        raffle: lotteryDraw.winning_number,
      });
    }
    return list;
  }, [allLoans, clients, lotteryDraw]);

  const stats = useMemo(() => {
    let targetTodayOnly = 0;
    let currentTodayOnly = 0;
    let currentArrears = 0;
    let arrearsClients = 0;
    let visitedCount = 0;
    let newCount = 0;
    const prepaidTodayClients: { loanId: string; clientName: string; amount: number; paidDate: string }[] = [];

    const draw = parseLotteryLastDraw(lotterySetting?.value);

    for (const loan of loans) {
      if (isLotteryWinnerLoan(loan, draw)) continue;
      
      // Prevent orphaned loans (e.g. from deleted clients but stuck pending sync) from affecting stats
      const client = clients.find(c => c.id === loan.client_id);
      if (!client) continue;

      const loanInsts = installments.filter(i => i.loan_id === loan.id);
      const todayInst = loanInsts.find(i => i.scheduled_date === today);
      const arrearsInsts = loanInsts.filter(i =>
        i.scheduled_date < today && ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status)
      );

      const loanEnded = loan.end_date && loan.end_date < today;
      
      // 1. Target today (doesn't discount when paid today)
      let loanTargetToday = 0;
      if (loan.start_date > today || loanEnded) {
        loanTargetToday = 0;
      } else if (todayInst) {
        if (todayInst.balance <= 0 && todayInst.paid_date && todayInst.paid_date < today) {
          loanTargetToday = 0; // Prepaid before today
        } else {
          loanTargetToday = Number(todayInst.scheduled_amount || loan.daily_installment);
        }
      } else {
        loanTargetToday = Number(loan.daily_installment || 0);
      }
      
      // 2. Current pending for today (discounts when paid today)
      let loanCurrentToday = 0;
      if (loan.start_date > today || loanEnded) {
        loanCurrentToday = 0;
      } else if (todayInst) {
        loanCurrentToday = Number(todayInst.balance || 0);
      } else {
        loanCurrentToday = Number(loan.daily_installment || 0);
      }

      // 3. Current arrears
      const loanCurrentArrears = arrearsInsts.reduce((s, i) => s + Number(i.balance || 0), 0);

      targetTodayOnly += loanTargetToday;
      currentTodayOnly += loanCurrentToday;
      currentArrears += loanCurrentArrears;

      if (todayInst && todayInst.balance <= 0 && todayInst.paid_date && todayInst.paid_date < today) {
        prepaidTodayClients.push({
          loanId: loan.id,
          clientName: client.full_name || 'Cliente desconocido',
          amount: loan.daily_installment,
          paidDate: todayInst.paid_date,
        });
      }

      if (loanCurrentArrears > 0) arrearsClients++;

      const isTodayPaid = todayInst && todayInst.balance <= 0;
      const isFutureStart = loan.start_date > today;

      if (isFutureStart) {
        newCount++;
      } else if (isTodayPaid && loanCurrentArrears === 0) {
        visitedCount++;
      }
    }

    const serverPayments = allSettings.find(s => s.key === paymentsTodaySettingKey(today))?.value as any[] | undefined;
    const collected = sumTodayPayments(mergeTodayPayments(serverPayments, syncQueue, today)).collected;

    // Derived values
    const collectedTodayOnly = Math.max(0, targetTodayOnly - currentTodayOnly);
    const collectedArrears = Math.max(0, collected - collectedTodayOnly);
    
    // For expected totals, we show target values that don't discount today
    const targetArrears = currentArrears + collectedArrears;
    const targetExpected = targetTodayOnly + targetArrears;

    const todayNewLoans = allLoans.filter(l => l.disbursement_date === today);
    const newLoansTodayClients = todayNewLoans.map(l => ({
      loanId: l.id,
      clientId: l.client_id,
      clientName: clients.find(c => c.id === l.client_id)?.full_name || 'Cliente',
      amount: Number(l.amount_delivered || 0),
    }));
    const newLoansTodayAmount = newLoansTodayClients.reduce((s, c) => s + c.amount, 0);

    return {
      targetExpected,
      targetTodayOnly,
      targetArrears,
      collected,
      collectedTodayOnly,
      collectedArrears,
      pending: Math.max(targetExpected - collected, 0),
      clientsTotal: clients.length,
      clientsVisited: visitedCount,
      clientsNew: newCount,
      clientsPending: clients.length - visitedCount - newCount,
      arrearsAmount: currentArrears, // For the generic "arrears" red box, they want the pending ones
      arrearsClients,
      prepaidTodayCount: prepaidTodayClients.length,
      prepaidTodayClients,
      newLoansTodayCount: newLoansTodayClients.length,
      newLoansTodayAmount,
      newLoansTodayClients,
    };
  }, [loans, allLoans, installments, clients, today, lotterySetting?.value, allSettings, syncQueue]);

  const collectedPercent = stats.targetExpected > 0 ? Math.round((stats.collected / stats.targetExpected) * 100) : 0;
  const pendingPercent = 100 - collectedPercent;

  const handleSync = async () => {
    if (user?.id) {
      await SyncService.fullSync(user.id);
    } else {
      await SyncService.pushPendingOperations();
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
          <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${isOnline
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

      {lotteryWinners.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 p-4 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5" />
            <p className="font-black text-sm uppercase tracking-wide">Ganadores de la lotería</p>
          </div>
          <p className="text-yellow-50 text-xs mb-3">
            Indícale a estos clientes que ganaron. Su deuda quedó pagada y no se cobra.
          </p>
          <ul className="space-y-2">
            {lotteryWinners.map(w => (
              <li key={w.clientId}>
                <NavLink
                  to={`/client/${w.clientId}`}
                  className="flex items-center justify-between bg-white/20 rounded-xl px-3 py-2 active:bg-white/30"
                >
                  <span className="font-bold text-sm truncate pr-2">{w.name}</span>
                  <span className="text-xs font-black tracking-widest bg-white/25 px-2 py-0.5 rounded">
                    {w.raffle}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Blue Card */}
      <div className="bg-brand-600 rounded-2xl p-5 text-white shadow-lg shadow-brand-500/25 relative overflow-hidden flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-brand-900 opacity-20 rounded-full -ml-10 -mb-10 blur-xl"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs font-bold text-brand-100 uppercase tracking-wider">Cuotas del Día (Hoy)</p>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">Del día</span>
          </div>
          <p className="text-3xl font-black tracking-tight mb-3">{formatCurrency(stats.targetTodayOnly)}</p>

          <div className="pt-2 border-t border-white/20 text-xs space-y-1">
            <div className="flex justify-between text-brand-100">
              <span>+ Atrasos acumulados:</span>
              <span className="font-bold text-amber-200">{formatCurrency(stats.targetArrears)}</span>
            </div>
            <div className="flex justify-between font-bold text-white pt-1 border-t border-white/10">
              <span>Total a recoger (Hoy + Atrasos):</span>
              <span className="font-black">{formatCurrency(stats.targetExpected)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500 rounded-2xl p-4 text-white shadow-sm shadow-emerald-500/20 flex flex-col justify-between">
          <div>
            <p className="text-emerald-50 text-[11px] font-medium uppercase tracking-wider">Cobrado (Hoy)</p>
            <p className="text-2xl font-black mt-1 mb-1 leading-none">{formatCurrency(stats.collectedTodayOnly)}</p>
          </div>
          <div className="pt-2 border-t border-emerald-400/40 mt-3">
            <div className="flex justify-between items-center text-[10px] text-emerald-100 mb-0.5">
              <span>Atrasos (y otros):</span>
              <span className="font-bold text-emerald-50">{formatCurrency(stats.collectedArrears)}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold text-white">
              <span>Total recaudado:</span>
              <span>{formatCurrency(stats.collected)}</span>
            </div>
          </div>
        </div>

        <div className="bg-orange-400 rounded-2xl p-4 text-white shadow-sm shadow-orange-400/20 flex flex-col justify-between">
          <div>
            <p className="text-orange-50 text-[11px] font-medium uppercase tracking-wider">Por cobrar (Hoy)</p>
            <p className="text-2xl font-black mt-1 mb-1 leading-none">{formatCurrency(stats.targetTodayOnly)}</p>
          </div>
          <div className="pt-2 border-t border-orange-300/40 mt-3">
            <div className="flex justify-between items-center text-[10px] text-orange-100 mb-0.5">
              <span>Atrasos (Esperado):</span>
              <span className="font-bold text-orange-50">{formatCurrency(stats.targetArrears)}</span>
            </div>
            <div className="flex justify-between items-center text-[11px] font-bold text-white">
              <span>Total esperado:</span>
              <span>{formatCurrency(stats.targetExpected)}</span>
            </div>
          </div>
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

      {/* Arrears + New loans cards */}
      {(stats.arrearsAmount > 0 || stats.newLoansTodayCount > 0) && (
        <div className={`grid gap-3 ${stats.arrearsAmount > 0 && stats.newLoansTodayCount > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {stats.arrearsAmount > 0 && (
            <button className="w-full bg-rose-50 border border-rose-100 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform">
              <p className="text-rose-600 text-[10px] font-semibold uppercase tracking-wider mb-0.5 leading-tight">Atrasos por recuperar</p>
              <p className="text-lg font-bold text-rose-700">{formatCurrency(stats.arrearsAmount)}</p>
              <p className="text-xs text-rose-500 mt-1">{stats.arrearsClients} clientes</p>
            </button>
          )}

          {stats.newLoansTodayCount > 0 && (
            <button
              onClick={() => setIsNewLoansModalOpen(true)}
              className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
            >
              <p className="text-emerald-600 text-[10px] font-semibold uppercase tracking-wider mb-0.5 leading-tight">Préstamos nuevos hoy</p>
              <p className="text-lg font-bold text-emerald-700">{formatCurrency(stats.newLoansTodayAmount)}</p>
              <p className="text-xs text-emerald-500 mt-1">{stats.newLoansTodayCount} préstamo{stats.newLoansTodayCount !== 1 ? 's' : ''}</p>
            </button>
          )}
        </div>
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
                if (window.confirm('¿Forzar limpieza y resincronizar? ADVERTENCIA: Perderás cobros offline no enviados (soluciona problemas de datos atascados).')) {
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

      <NewLoansTodayModal
        isOpen={isNewLoansModalOpen}
        onClose={() => setIsNewLoansModalOpen(false)}
        clients={stats.newLoansTodayClients}
      />
    </div>
  );
}
