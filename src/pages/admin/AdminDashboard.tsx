import { useState, useEffect } from 'react';
import { Users, UserPlus, DollarSign, UserCheck, Map, Activity, CheckCircle, AlertCircle, ChevronRight, Bell, Trophy, CalendarCheck, Plus, Building2, Smartphone } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { ClientsModal } from '@/components/admin/ClientsModal';
import { LotteryModule } from '@/components/admin/LotteryModule';
import { ObservationsModal } from '@/components/admin/ObservationsModal';
import { PrepaidTodayModal } from '@/components/admin/PrepaidTodayModal';
import { AdminCreateLoanModal } from '@/components/admin/AdminCreateLoanModal';
import { TransferVouchersModal } from '@/components/admin/TransferVouchersModal';
import toast from 'react-hot-toast';

export function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [routeStates, setRouteStates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [clientsModal, setClientsModal] = useState<{ open: boolean; onlyToday: boolean }>({ open: false, onlyToday: false });
  const [isLotteryOpen, setIsLotteryOpen] = useState(false);
  const [isObservationsOpen, setIsObservationsOpen] = useState(false);
  const [isPrepaidModalOpen, setIsPrepaidModalOpen] = useState(false);
  const [isCreateLoanOpen, setIsCreateLoanOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  // Load route list only once
  useEffect(() => {
    const loadRoutes = async () => {
      setIsLoading(true);
      try {
        const routes = await AdminService.getRouteStates();
        setRouteStates(routes);
      } catch (error) {
        toast.error('Error cargando rutas');
      } finally {
        setIsLoading(false);
      }
    };
    loadRoutes();
  }, []);

  // Reload stats whenever the selected route changes
  useEffect(() => {
    const fetchStats = async () => {
      setIsStatsLoading(true);
      try {
        const dashboardStats = await AdminService.getDashboardStats(selectedRoute);
        setStats(dashboardStats);
      } catch (error) {
        toast.error('Error cargando estadísticas');
      } finally {
        setIsStatsLoading(false);
      }
    };
    fetchStats();
  }, [selectedRoute]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Derive context for the second row of cards based on selection
  const isFiltered = selectedRoute !== 'all';
  const selectedRouteData = isFiltered ? routeStates.find(r => r.id === selectedRoute) : null;

  // Filter table rows
  const visibleRoutes = isFiltered
    ? routeStates.filter(r => r.id === selectedRoute)
    : routeStates;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
          <Activity className="w-6 h-6 text-brand-600" />
          Dashboard
          {isStatsLoading && <div className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin ml-2" />}
        </h1>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <label>Ruta:</label>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand-500"
          >
            <option value="all">Todas las rutas</option>
            {routeStates.map(r => (
              <option key={r.id} value={r.id}>{r.ruta}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setIsCreateLoanOpen(true)}
          className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-base">Nuevo Préstamo</span>
        </button>

        <button
          onClick={() => setClientsModal({ open: true, onlyToday: false })}
          className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98] text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="text-base">Registrar Cobro (Oficina)</span>
        </button>

      </div>

      {/* Cards Row 1 — always filtered by selected route */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Clientes — clickable to open modal */}
        <button
          onClick={() => setClientsModal({ open: true, onlyToday: false })}
          className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-left hover:shadow-md hover:border-brand-200 transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-slate-500 font-bold">
              <Users className="w-5 h-5 text-brand-500" />
              Clientes Activos
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
          </div>
          <div className={`text-4xl font-black text-slate-800 mb-1 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
            {stats?.clientes ?? '—'}
          </div>
          <p className="text-xs text-slate-400">{isFiltered ? `En ruta: ${selectedRouteData?.ruta}` : 'Todas las rutas'}</p>
        </button>

        {/* Nuevos — clickable with only today filter */}
        <button
          onClick={() => setClientsModal({ open: true, onlyToday: true })}
          className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-left hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-slate-500 font-bold">
              <UserPlus className="w-5 h-5 text-blue-500" />
              Nuevos (esta semana)
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
          </div>
          <div className={`text-4xl font-black text-slate-800 mb-1 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
            {stats?.nuevos ?? '—'}
          </div>
          <p className="text-xs text-slate-400">{isFiltered ? `En ruta: ${selectedRouteData?.ruta}` : 'Todas las rutas'}</p>
        </button>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-500 font-bold mb-4">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              Recaudo (hoy)
            </div>
            <div className={`text-4xl font-black text-slate-800 mb-1 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
              {formatCurrency(stats?.recaudo ?? 0)}
            </div>
            <div className={`text-sm font-bold text-brand-600 mb-1 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
              Oficina: {formatCurrency(stats?.recaudoOficina ?? 0)}
            </div>
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className={`text-sm font-bold text-indigo-600 mb-2 hover:text-indigo-700 transition-all text-left flex items-center gap-1 ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}
            >
              Transferencias: {formatCurrency(stats?.recaudoTransferencias ?? 0)}
            </button>
          </div>
          <p className="text-xs text-slate-400">{isFiltered ? `En ruta: ${selectedRouteData?.ruta}` : 'Todas las rutas'}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 font-bold mb-4">
            <DollarSign className="w-5 h-5 text-amber-500" />
            Por recoger (hoy)
          </div>
          <div className={`text-4xl font-black text-slate-800 mb-1 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
            {formatCurrency(stats?.esperado ?? 0)}
          </div>
          <p className="text-xs text-slate-400">{isFiltered ? `En ruta: ${selectedRouteData?.ruta}` : 'Todas las rutas'}</p>
        </div>
      </div>

      {/* ─── ACTION MODULES GRID ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">

        {/* 1. Cuotas adelantadas para hoy */}
        {(stats?.prepaidToday?.count ?? 0) > 0 && (
          <button
            onClick={() => setIsPrepaidModalOpen(true)}
            className="bg-white rounded-3xl border border-indigo-100 shadow-sm p-6 hover:shadow-md hover:border-indigo-300 transition-all text-left flex flex-col justify-between group h-full relative overflow-hidden"
          >
            <div className="flex items-start justify-between w-full mb-6">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center relative shadow-inner">
                <CalendarCheck className="w-7 h-7 text-indigo-600" />
                <span className="absolute -top-2 -right-2 w-7 h-7 bg-indigo-600 text-white text-xs font-black rounded-full flex items-center justify-center shadow-md">
                  {stats!.prepaidToday!.count}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 leading-tight mb-1.5">Cuotas Adelantadas</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                <strong className="text-indigo-600">{stats!.prepaidToday!.count}</strong> cliente{stats!.prepaidToday!.count !== 1 ? 's' : ''} ya {stats!.prepaidToday!.count !== 1 ? 'pagaron' : 'pagó'} la cuota de hoy en días anteriores.
              </p>
            </div>
          </button>
        )}

        {/* 2. Sorteo de boletas */}
        <button
          onClick={() => setIsLotteryOpen(true)}
          className="bg-gradient-to-br from-indigo-900 via-purple-900 to-violet-900 hover:from-indigo-800 hover:via-purple-800 hover:to-violet-800 active:scale-[0.98] transition-all rounded-3xl p-6 flex flex-col justify-between shadow-lg shadow-purple-900/20 group h-full relative overflow-hidden"
        >
          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

          <div className="flex items-start justify-between w-full mb-6 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <ChevronRight className="w-5 h-5 text-purple-200 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
          <div className="relative z-10 text-left">
            <h3 className="text-xl font-black text-white leading-tight mb-1.5">Sorteo de Boletas</h3>
            <p className="text-sm text-purple-200/80 leading-relaxed">
              Digita el número ganador y procesa el sorteo para todas las rutas.
            </p>
          </div>
        </button>

        {/* 3. Observaciones y Adicionales */}
        {stats?.alerts && stats.alerts.length > 0 && (() => {
          const withObs = stats.alerts.filter((a: any) => a.observation);
          const withoutObs = stats.alerts.filter((a: any) => !a.observation);
          return (
            <button
              onClick={() => setIsObservationsOpen(true)}
              className="bg-white rounded-3xl border border-amber-100 shadow-sm p-6 hover:shadow-md hover:border-amber-300 transition-all text-left flex flex-col justify-between group h-full relative overflow-hidden"
            >
              <div className="flex items-start justify-between w-full mb-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center relative shadow-inner">
                  <Bell className="w-7 h-7 text-amber-500" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 bg-amber-500 text-white text-xs font-black rounded-full flex items-center justify-center shadow-md">
                    {stats.alerts.length}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-amber-50 transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 leading-tight mb-3">Observaciones y Alertas</h3>
                <div className="flex flex-col gap-2">
                  {withoutObs.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                      <span className="text-xs font-bold text-slate-600">
                        {withoutObs.length} alerta{withoutObs.length !== 1 ? 's' : ''} sin justificar
                      </span>
                    </div>
                  )}
                  {withObs.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-xs font-bold text-slate-600">
                        {withObs.length} {withObs.length !== 1 ? 'justificadas' : 'justificada'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })()}
      </div>

      {/* Cards Row 2 — changes meaning based on filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full md:w-2/3 mb-8">
        {isFiltered ? (
          /* Route-specific context cards */
          <>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 font-bold mb-3">
                <UserCheck className="w-5 h-5 text-amber-500" />
                Cobrador Asignado
              </div>
              <div className="text-lg font-black text-slate-800 leading-tight">
                {selectedRouteData?.cobrador || 'Sin asignar'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 font-bold mb-3">
                <Map className="w-5 h-5 text-indigo-500" />
                Estado de Ruta
              </div>
              <div className={`flex items-center gap-2 text-lg font-black ${selectedRouteData?.estado === 'Activo' ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                {selectedRouteData?.estado === 'Activo'
                  ? <CheckCircle className="w-5 h-5" />
                  : <AlertCircle className="w-5 h-5" />
                }
                {selectedRouteData?.estado || '—'}
              </div>
            </div>
          </>
        ) : (
          /* Global context cards */
          <>
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 font-bold mb-3">
                <UserCheck className="w-5 h-5 text-amber-500" />
                Cobradores Activos
              </div>
              <div className={`text-3xl font-black text-slate-800 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
                {stats?.cobradores ?? '—'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 font-bold mb-3">
                <Map className="w-5 h-5 text-indigo-500" />
                Rutas Activas
              </div>
              <div className={`text-3xl font-black text-slate-800 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
                {stats?.rutas ?? '—'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Table Section */}
      <div className="pt-4">
        <h3 className="text-lg font-bold text-slate-800 mb-4">
          {isFiltered ? `Detalle: ${selectedRouteData?.ruta}` : 'Estado de las rutas'}
        </h3>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
                <th className="py-4 px-6 font-semibold w-1/4">Ruta</th>
                <th className="py-4 px-6 font-semibold w-1/4">Cobrador</th>
                <th className="py-4 px-6 font-semibold text-center w-1/4">Clientes</th>
                <th className="py-4 px-6 font-semibold w-1/4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleRoutes.map(route => (
                <tr key={route.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-slate-800">{route.ruta}</td>
                  <td className="py-4 px-6 text-slate-600">{route.cobrador}</td>
                  <td className="py-4 px-6 text-center font-semibold text-slate-700">{route.clientesCount}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${route.estado === 'Activo' ? 'bg-emerald-500' :
                        route.estado === 'Sin asignar' ? 'bg-amber-500' :
                          'bg-slate-300'
                        }`} />
                      <span className="text-sm font-semibold text-slate-700">{route.estado}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleRoutes.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No hay rutas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clients Modal */}
      <ClientsModal
        isOpen={clientsModal.open}
        onClose={() => setClientsModal({ open: false, onlyToday: false })}
        initialRouteId={selectedRoute}
        initialOnlyToday={clientsModal.onlyToday}
        routeStates={routeStates}
      />

      <LotteryModule
        isOpen={isLotteryOpen}
        onClose={() => setIsLotteryOpen(false)}
      />

      <ObservationsModal
        isOpen={isObservationsOpen}
        onClose={() => setIsObservationsOpen(false)}
        alerts={stats?.alerts || []}
      />

      <PrepaidTodayModal
        isOpen={isPrepaidModalOpen}
        onClose={() => setIsPrepaidModalOpen(false)}
        clients={stats?.prepaidToday?.clients || []}
      />

      <AdminCreateLoanModal
        isOpen={isCreateLoanOpen}
        onClose={() => setIsCreateLoanOpen(false)}
        routeStates={routeStates}
        onSuccess={() => setIsCreateLoanOpen(false)}
      />

      <TransferVouchersModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        routeStates={routeStates}
        initialRouteId={selectedRoute}
      />
    </div>
  );
}
