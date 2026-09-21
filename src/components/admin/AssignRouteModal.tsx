import { useState, useEffect } from 'react';
import { X, UserCheck, Info } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import { formatNumberInput, parseNumberInput } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AssignRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  route: any | null; // La ruta seleccionada
}

export function AssignRouteModal({ isOpen, onClose, onSuccess, route }: AssignRouteModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [collectors, setCollectors] = useState<any[]>([]);
  const [selectedCollectorId, setSelectedCollectorId] = useState('');
  // Viático y salario opcionales por cobrador (vacío = usar valor global del sistema)
  const [viaticoOverride, setViaticoOverride] = useState('');
  const [salaryOverride, setSalaryOverride] = useState('');

  const currentUser = useAuthStore(state => state.user);

  useEffect(() => {
    if (isOpen) {
      setViaticoOverride('');
      setSalaryOverride('');
      AdminService.getActiveCollectors()
        .then(data => {
          setCollectors(data);
          if (data.length > 0) setSelectedCollectorId(data[0].id);
        })
        .catch(err => {
          console.error(err);
          toast.error('Error cargando cobradores');
        });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!route || !selectedCollectorId || !currentUser) {
      toast.error('Faltan datos para realizar la asignación.');
      return;
    }

    const viaticum = viaticoOverride !== '' ? Number(parseNumberInput(viaticoOverride)) : null;
    const salary = salaryOverride !== '' ? Number(parseNumberInput(salaryOverride)) : null;

    setIsLoading(true);
    try {
      await AdminService.assignRoute(route.id, selectedCollectorId, currentUser.id, viaticum, salary);
      toast.success('Ruta asignada exitosamente');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al asignar ruta');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !route) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <UserCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Asignar Cobrador</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-brand-50 p-4 rounded-xl border border-brand-100">
            <p className="text-sm text-brand-700 font-medium">Estás asignando la ruta:</p>
            <p className="text-lg font-bold text-brand-900">{route.name}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Seleccionar Cobrador *</label>
            {collectors.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">No hay cobradores activos disponibles.</p>
            ) : (
              <select
                required
                value={selectedCollectorId}
                onChange={(e) => setSelectedCollectorId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800 font-medium"
              >
                {collectors.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Costos de personal por cobrador */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-bold">
              <Info className="w-4 h-4" />
              Costos del cobrador (opcional)
            </div>
            <p className="text-xs text-amber-600">
              Déjalo en blanco para usar los valores globales de Configuraciones.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Viático diario</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={viaticoOverride ? formatNumberInput(viaticoOverride) : ''}
                    onChange={(e) => setViaticoOverride(parseNumberInput(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                    placeholder="Global"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Salario mensual</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={salaryOverride ? formatNumberInput(salaryOverride) : ''}
                    onChange={(e) => setSalaryOverride(parseNumberInput(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-500 outline-none"
                    placeholder="Global"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || collectors.length === 0}
              className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 transition-all disabled:opacity-50 flex items-center justify-center"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Confirmar Asignación'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
