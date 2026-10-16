import { useState, useEffect } from 'react';
import { X, Edit2 } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import type { Database } from '@/lib/database.types';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { showError } from '@/lib/swal';

type Role = Database['public']['Tables']['roles']['Row'];
type User = Database['public']['Tables']['users']['Row'];

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User;
}

export function EditUserModal({ isOpen, onClose, onSuccess, user }: EditUserModalProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const userRole = useAuthStore(state => state.role);
  const currentUserId = useAuthStore(state => state.user?.id);

  // Form State
  const [fullName, setFullName] = useState(user.full_name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [roleId, setRoleId] = useState(user.role_id || '');
  const [active, setActive] = useState(user.active ?? true);

  useEffect(() => {
    if (isOpen) {
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
      setRoleId(user.role_id || '');
      setActive(user.active ?? true);

      AdminService.getRoles()
        .then(data => {
          // Filtrar roles según el usuario actual
          // ADMINISTRADOR solo puede editar roles COBRADOR
          // SUPER_ADMIN puede editar cualquier rol
          const filteredRoles = userRole === 'SUPER_ADMIN'
            ? data
            : data.filter(r => r.name === 'COBRADOR');

          setRoles(filteredRoles);
        })
        .catch(err => {
          console.error(err);
          toast.error('Error cargando roles');
        });
    }
  }, [isOpen, user, userRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !roleId) {
      toast.error('Por favor completa los campos requeridos.');
      return;
    }

    setIsLoading(true);
    try {
      await AdminService.updateUser(user.id, {
        full_name: fullName,
        phone,
        role_id: roleId,
        active,
      });
      toast.success('Usuario actualizado exitosamente');
      onSuccess();
      onClose();
    } catch (error: any) {
      await showError({
        title: 'Error al actualizar usuario',
        text: error.message || 'Ocurrió un error desconocido',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Si es el propio usuario admin, no permitir desactivar
  const isSelf = user.id === currentUserId;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Edit2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Editar Usuario</h3>
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
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Completo *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
              placeholder="Ej. Juan Pérez"
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
            <label className="block text-sm font-semibold text-slate-700 mb-1">Rol *</label>
            <select
              required
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800 font-medium"
            >
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isSelf}
              className="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="active" className="text-sm font-semibold text-slate-700">
              Usuario activo
              {isSelf && <span className="text-slate-400 font-normal ml-2">(no puedes desactivar tu propio usuario)</span>}
            </label>
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
