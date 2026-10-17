import { useState, useEffect } from 'react';
import { X, Building2 } from 'lucide-react';
import { SuperAdminService } from '@/services/SuperAdminService';
import type { Company } from '@/lib/database.types';
import toast from 'react-hot-toast';
import { showError } from '@/lib/swal';

interface EditCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  company: Company;
}

export function EditCompanyModal({ isOpen, onClose, onSuccess, company }: EditCompanyModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [name, setName] = useState(company.name || '');
  const [slug, setSlug] = useState(company.slug || '');
  const [ownerName, setOwnerName] = useState(company.owner_name || '');
  const [email, setEmail] = useState(company.email || '');
  const [phone, setPhone] = useState(company.phone || '');
  const [status, setStatus] = useState(company.status || 'ACTIVE');
  const [maxCollectors, setMaxCollectors] = useState(company.max_collectors || 10);
  const [maxRoutes, setMaxRoutes] = useState(company.max_routes || 20);
  const [notes, setNotes] = useState(company.notes || '');

  useEffect(() => {
    if (isOpen && company) {
      setName(company.name || '');
      setSlug(company.slug || '');
      setOwnerName(company.owner_name || '');
      setEmail(company.email || '');
      setPhone(company.phone || '');
      setStatus(company.status || 'ACTIVE');
      setMaxCollectors(company.max_collectors || 10);
      setMaxRoutes(company.max_routes || 20);
      setNotes(company.notes || '');
    }
  }, [isOpen, company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) {
      toast.error('Por favor completa los campos requeridos.');
      return;
    }

    setIsLoading(true);
    try {
      await SuperAdminService.updateCompany(company.id, {
        name,
        slug,
        owner_name: ownerName,
        email,
        phone,
        status,
        max_collectors: maxCollectors,
        max_routes: maxRoutes,
        notes,
      });
      toast.success('Empresa actualizada exitosamente');
      onSuccess();
      onClose();
    } catch (error: any) {
      await showError({
        title: 'Error al actualizar empresa',
        text: error.message || 'Ocurrió un error desconocido',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden transform transition-all max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Editar Empresa</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre de la Empresa *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="Ej. Mi Préstamo S.A."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Slug (URL) *</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="mi-prestamo"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre del Propietario</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="Ej. Juan Pérez"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="contacto@empresa.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="Ej. 3001234567"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800 font-medium"
              >
                <option value="ACTIVE">ACTIVA</option>
                <option value="SUSPENDED">SUSPENDIDA</option>
                <option value="EXPIRED">VENCIDA</option>
                <option value="INACTIVE">INACTIVA</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Máximo de Cobradores</label>
              <input
                type="number"
                min="1"
                value={maxCollectors}
                onChange={(e) => setMaxCollectors(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Máximo de Rutas</label>
              <input
                type="number"
                min="1"
                value={maxRoutes}
                onChange={(e) => setMaxRoutes(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800 resize-none"
              placeholder="Notas adicionales sobre la empresa..."
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
                'Guardar Cambios'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
