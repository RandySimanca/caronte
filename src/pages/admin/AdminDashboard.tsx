import { useState, useEffect } from 'react';
import { Users, UserPlus, DollarSign, UserCheck, Map, Activity, CheckCircle, AlertCircle, ChevronRight, Bell, Trophy, CalendarCheck } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { ClientsModal } from '@/components/admin/ClientsModal';
import { LotteryModule } from '@/components/admin/LotteryModule';
import { ObservationsModal } from '@/components/admin/ObservationsModal';
import { PrepaidTodayModal } from '@/components/admin/PrepaidTodayModal';
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

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 font-bold mb-4">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            Recaudo (hoy)
          </div>
          <div className={`text-4xl font-black text-slate-800 mb-1 transition-all ${isStatsLoading ? 'opacity-40' : 'opacity-100'}`}>
            {formatCurrency(stats?.recaudo ?? 0)}
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

      {/* Cuotas adelantadas para hoy */}
      {(stats?.prepaidToday?.count ?? 0) > 0 && (
        <button
          onClick={() => setIsPrepaidModalOpen(true)}
          className="w-full bg-white rounded-2xl border-2 border-indigo-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-400 transition-all text-left flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center relative shrink-0">
              <CalendarCheck className="w-6 h-6 text-indigo-600" />
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
                {stats!.prepaidToday!.count}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 leading-tight">Cuotas Adelantadas (hoy)</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {stats!.prepaidToday!.count} cliente{stats!.prepaidToday!.count !== 1 ? 's' : ''} ya pagaron la cuota de hoy en días anteriores
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-indigo-600 font-bold bg-indigo-50 px-4 py-2 rounded-xl">
            <span>Ver clientes</span>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      )}

      {/* ─── LOTTERY SHORTCUT ─── */}
      <button
        onClick={() => setIsLotteryOpen(true)}
        className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 active:scale-[0.99] transition-all rounded-2xl p-5 flex items-center justify-between shadow-md shadow-purple-500/20 group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <p className="font-black text-white text-base leading-tight">Sorteo de Boletas</p>
            <p className="text-purple-200 text-xs mt-0.5">Digita el número ganador y procesa el sorteo</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-purple-300 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Cards Row 2 — changes meaning based on filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full md:w-2/3">
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

      {/* ─── ALERTS: Cobros en exceso del día ─── */}
      {stats?.alerts && stats.alerts.length > 0 && (() => {
        const withObs = stats.alerts.filter((a: any) => a.observation);
        const withoutObs = stats.alerts.filter((a: any) => !a.observation);
        return (
          <button
            onClick={() => setIsObservationsOpen(true)}
            className="w-full bg-white rounded-2xl border-2 border-amber-200 shadow-sm p-5 hover:shadow-md hover:border-amber-400 transition-all text-left flex items-center justify-between group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center relative shrink-0">
                <Bell className="w-6 h-6 text-amber-600" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
                  {stats.alerts.length}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 leading-tight">Observaciones y Adicionales</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {withoutObs.length > 0 && (
                    <span className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full font-bold">
                      {withoutObs.length} sin justificar
                    </span>
                  )}
                  {withObs.length > 0 && (
                    <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                      {withObs.length} con observación
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-amber-600 font-bold bg-amber-50 px-4 py-2 rounded-xl">
              <span>Ver observaciones</span>
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        );
      })()}

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
    </div>
  );
}
