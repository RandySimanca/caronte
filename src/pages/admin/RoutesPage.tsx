import { useState, useEffect } from 'react';
import { Map, Plus, MapPin, UserCheck, AlertCircle } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { CreateRouteModal } from '@/components/admin/CreateRouteModal';
import { AssignRouteModal } from '@/components/admin/AssignRouteModal';
import toast from 'react-hot-toast';

export function RoutesPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);

  const fetchRoutes = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getRoutes();
      setRoutes(data);
    } catch (error: any) {
      toast.error('Error al cargar rutas: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const openAssignModal = (route: any) => {
    setSelectedRoute(route);
    setIsAssignModalOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Map className="w-6 h-6" />
            </div>
            Rutas y Zonas
          </h1>
          <p className="text-slate-500 mt-1 ml-12">Gestiona las áreas de trabajo y asigna cobradores.</p>
        </div>
        
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-lg shadow-brand-500/30 transition-all"
        >
          <Plus className="w-5 h-5" />
          Nueva Ruta
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 animate-pulse">
              <div className="h-6 bg-slate-200 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-6"></div>
              <div className="h-10 bg-slate-200 rounded-xl w-full"></div>
            </div>
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-slate-100">
          <div className="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Map className="w-10 h-10 text-brand-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay rutas creadas</h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Crea tu primera ruta para poder asignar cobradores y comenzar a registrar clientes y préstamos en esa área.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Crear Primera Ruta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {routes.map(route => (
            <div key={route.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-slate-800">{route.name}</h3>
                  <div className={`px-2.5 py-1 text-xs font-bold rounded-full ${route.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {route.active ? 'Activa' : 'Inactiva'}
                  </div>
                </div>
                
                {route.description && (
                  <p className="text-slate-600 text-sm mb-4 line-clamp-2">{route.description}</p>
                )}

                {route.zones && route.zones.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {route.zones.map((zone: string, idx: number) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg">
                        <MapPin className="w-3 h-3" />
                        {zone}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100">
                {route.activeAssignment ? (
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Cobrador Asignado</p>
                      <p className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4" />
                        {route.activeAssignment.collector?.full_name || 'Desconocido'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-4 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-xs font-medium">Sin cobrador asignado. Los clientes de esta ruta no serán visitados.</p>
                  </div>
                )}

                <button
                  onClick={() => openAssignModal(route)}
                  className="w-full py-2.5 bg-white border-2 border-brand-100 hover:border-brand-500 hover:bg-brand-50 text-brand-700 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  {route.activeAssignment ? 'Cambiar Cobrador' : 'Asignar Cobrador'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateRouteModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchRoutes}
      />
      
      <AssignRouteModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={fetchRoutes}
        route={selectedRoute}
      />
    </div>
  );
}
