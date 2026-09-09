import { useState, useEffect } from 'react';
import { Wallet, CheckCircle, Clock } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { LiquidationDetailModal } from '@/components/admin/LiquidationDetailModal';
import toast from 'react-hot-toast';

export function LiquidationsPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    // Format YYYY-MM-DD local time
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchLiquidations = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getRouteLiquidations(selectedDate);
      setRoutes(data);
    } catch (error: any) {
      toast.error('Error al cargar liquidaciones: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiquidations();
  }, [selectedDate]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const openLiquidationDetail = (route: any) => {
    if (route.cobradorId) {
      setSelectedRoute(route);
      setIsModalOpen(true);
    } else {
      toast.error('Esta ruta no tiene un cobrador asignado para liquidar.');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Wallet className="w-7 h-7" />
            </div>
            Liquidaciones
          </h1>
          <p className="text-slate-500 mt-2 ml-14">Cuadre de caja diario por ruta y cobrador.</p>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <label className="text-sm font-bold text-slate-600 pl-2">Fecha:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">Resumen del Día</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Liquidado</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>Pendiente</span>
            </div>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <th className="py-4 px-6 font-semibold w-1/4">Ruta</th>
              <th className="py-4 px-6 font-semibold w-1/4">Cobrador</th>
              <th className="py-4 px-6 font-semibold text-right w-1/4">Recaudado (Aprox)</th>
              <th className="py-4 px-6 font-semibold text-center w-1/4">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-400">
                  <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-4"></div>
                  Cargando rutas...
                </td>
              </tr>
            ) : routes.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500 font-medium">
                  No hay rutas activas para mostrar.
                </td>
              </tr>
            ) : (
              routes.map(route => (
                <tr
                  key={route.id}
                  onClick={() => openLiquidationDetail(route)}
                  className="hover:bg-brand-50/50 transition-colors cursor-pointer group"
                >
                  <td className="py-4 px-6 font-bold text-slate-800 group-hover:text-brand-600">{route.ruta}</td>
                  <td className="py-4 px-6 text-slate-600 font-medium">{route.cobrador}</td>
                  <td className="py-4 px-6 text-right font-black text-slate-700">
                    {route.estado === 'Liquidado' ? formatCurrency(route.aEntregar) : '---'}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex justify-center">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold ${route.estado === 'Liquidado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                        {route.estado === 'Liquidado' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        {route.estado}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <LiquidationDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchLiquidations}
        route={selectedRoute}
        dateStr={selectedDate}
      />
    </div>
  );
}
