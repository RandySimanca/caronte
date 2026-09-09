import { useState, useEffect } from 'react';
import { Tags, Plus, AlertCircle } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';

export function ExpenseCategoriesTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getExpenseCategories();
      setCategories(data);
    } catch (error: any) {
      toast.error('Error cargando categorías');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    try {
      await AdminService.upsertExpenseCategory({
        name,
        description,
        active: true,
        is_system: false,
      });
      toast.success('Categoría creada exitosamente');
      setName('');
      setDescription('');
      loadCategories();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar categoría');
    }
  };

  const handleToggle = async (category: any) => {
    if (category.is_system) {
      toast.error('No puedes desactivar categorías del sistema');
      return;
    }
    try {
      await AdminService.upsertExpenseCategory({
        ...category,
        active: !category.active
      });
      loadCategories();
    } catch (error: any) {
      toast.error('Error al actualizar categoría');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-brand-50 p-4 rounded-xl border border-brand-100 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-brand-600 mt-0.5" />
        <div>
          <h4 className="font-bold text-brand-900">Categorías de Gastos</h4>
          <p className="text-sm text-brand-700 mt-1">
            Agrupa los egresos reportados por los cobradores. Algunas categorías base (Combustible, Viáticos)
            son del sistema y no se pueden desactivar.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-brand-500" />
          Nueva Categoría
        </h3>
        
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Peajes"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="md:col-span-6">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 transition-all"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
              <th className="py-3 px-4 font-semibold w-1/3">Nombre</th>
              <th className="py-3 px-4 font-semibold w-1/3">Descripción</th>
              <th className="py-3 px-4 font-semibold text-center w-1/6">Tipo</th>
              <th className="py-3 px-4 font-semibold text-right w-1/6">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto"></div>
                  </div>
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <Tags className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No hay categorías registradas</p>
                </td>
              </tr>
            ) : (
              categories.map(cat => (
                <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800">{cat.name}</td>
                  <td className="py-3 px-4 text-slate-600 text-sm">{cat.description}</td>
                  <td className="py-3 px-4 text-center">
                    {cat.is_system ? (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-md">
                        Sistema
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-md">
                        Personalizada
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleToggle(cat)}
                      disabled={cat.is_system}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        cat.active ? 'bg-brand-500' : 'bg-slate-300'
                      } ${cat.is_system ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          cat.active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
