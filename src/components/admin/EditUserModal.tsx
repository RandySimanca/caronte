import { useState, useEffect } from 'react';
import { X, Edit2, KeyRound, RefreshCw, Eye, EyeOff, Wifi } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import type { Database } from '@/lib/database.types';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { showError, Swal } from '@/lib/swal';

type Role = Database['public']['Tables']['roles']['Row'];
type User = Database['public']['Tables']['users']['Row'];

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
}

// Genera una contraseña aleatoria de 12 caracteres (letras y números)
function generarClaveAleatoria(): string {
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => caracteres[Math.floor(Math.random() * caracteres.length)]).join('');
}

export function EditUserModal({ isOpen, onClose, onSuccess, user }: EditUserModalProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const userRole = useAuthStore(state => state.role);
  const currentUserId = useAuthStore(state => state.user?.id);

  // Form State
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [roleId, setRoleId] = useState(user?.role_id || '');
  const [active, setActive] = useState(user?.active ?? true);

  // Estado del bloque restablecer contraseña
  const [claveRestablecida, setClaveRestablecida] = useState('');
  const [verClaveRestablecida, setVerClaveRestablecida] = useState(false);
  const [cargandoRestablecimiento, setCargandoRestablecimiento] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
      setRoleId(user.role_id || '');
      setActive(user.active ?? true);
      // Limpiar el bloque de restablecimiento al abrir con un usuario diferente
      setClaveRestablecida('');
      setVerClaveRestablecida(false);

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

    if (!user) {
      toast.error('No se seleccionó ningún usuario');
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

  const handleRestablecerClave = async () => {
    if (!user) return;

    if (!claveRestablecida) {
      toast.error('Escribe o genera una contraseña temporal.');
      return;
    }

    if (claveRestablecida.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setCargandoRestablecimiento(true);
    try {
      await AdminService.restablecerClave(user.id, claveRestablecida);

      // Guardar la clave antes de limpiarla para mostrarla en el modal
      const claveParaMostrar = claveRestablecida;
      setClaveRestablecida('');

      const nombreSeguro = (user.full_name || '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c
      ));

      await Swal.fire({
        title: '¡Contraseña restablecida!',
        html: `
          <p class="text-slate-600 mb-3">Comparte esta clave con <strong>${nombreSeguro}</strong>. Se mostrará solo esta vez.</p>
          <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:8px 0;">
            <p style="font-family:monospace;font-size:1.5rem;font-weight:bold;color:#1e293b;letter-spacing:0.1em;margin:0;">${claveParaMostrar}</p>
          </div>
        `,
        icon: 'success',
        confirmButtonText: 'Copiar y cerrar',
        confirmButtonColor: '#2563eb',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        cancelButtonColor: '#64748b',
        customClass: {
          popup: 'swal-caronte-popup',
          title: 'swal-caronte-title',
        },
        preConfirm: () => {
          navigator.clipboard?.writeText(claveParaMostrar).catch(() => {});
        },
      });

    } catch (error: any) {
      await showError({
        title: 'Error al restablecer contraseña',
        text: error.message || 'Ocurrió un error desconocido.',
      });
    } finally {
      setCargandoRestablecimiento(false);
    }
  };

  if (!isOpen) return null;

  // Si es el propio usuario admin, no permitir desactivar
  const isSelf = user?.id === currentUserId;

  // Mostrar sección de restablecimiento solo si no es el propio admin y el objetivo no es SUPER_ADMIN
  const mostrarRestablecimiento = !isSelf && user && (user as any).roles?.name !== 'SUPER_ADMIN';

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden transform transition-all">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
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

          {/* ── Sección: Restablecer contraseña ── */}
          {mostrarRestablecimiento && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" />
                Restablecer contraseña
              </p>
              <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                <Wifi className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Requiere conexión a internet. La clave se muestra una sola vez.</span>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={verClaveRestablecida ? 'text' : 'password'}
                    value={claveRestablecida}
                    onChange={(e) => setClaveRestablecida(e.target.value)}
                    className="w-full px-3 py-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all text-slate-800 text-sm"
                    placeholder="Clave temporal (mín. 8 car.)"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setVerClaveRestablecida(!verClaveRestablecida)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {verClaveRestablecida ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setClaveRestablecida(generarClaveAleatoria())}
                  title="Generar contraseña aleatoria"
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleRestablecerClave}
                disabled={cargandoRestablecimiento || !claveRestablecida}
                className="mt-2 w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {cargandoRestablecimiento ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    Restablecer contraseña
                  </>
                )}
              </button>
            </div>
          )}

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
