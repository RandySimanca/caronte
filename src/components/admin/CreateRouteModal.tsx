import { useState } from 'react';
import { X, Map } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';

interface CreateRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateRouteModal({ isOpen, onClose, onSuccess }: CreateRouteModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [zonesInput, setZonesInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error('El nombre es requerido.');
      return;
    }

    setIsLoading(true);
    try {
      const zones = zonesInput
        .split(',')
        .map(z => z.trim())
        .filter(z => z.length > 0);

      await AdminService.createRoute({
        name,
        description,
        zones,
      });
      toast.success('Ruta creada exitosamente');
      onSuccess();
      
      // Reset form
      setName('');
      setDescription('');
      setZonesInput('');
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Error al crear ruta');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Map className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Nueva Ruta</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre de la Ruta *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
              placeholder="Ej. Ruta Centro"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
              placeholder="Ej. Clientes de la zona centro y alrededores"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Zonas (separadas por coma)</label>
            <input
              type="text"
              value={zonesInput}
              onChange={(e) => setZonesInput(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
              placeholder="Ej. Centro, Norte, Sur"
            />
          </div>

          <div className="pt-4 flex gap-3">
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
              disabled={isLoading}
              className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 transition-all disabled:opacity-50 flex items-center justify-center"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Crear Ruta'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
