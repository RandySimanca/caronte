import { useRef, useState } from 'react';
import { X, KeyRound, Eye, EyeOff, Wifi } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showError, Swal } from '@/lib/swal';
import toast from 'react-hot-toast';
import { TurnstileWidget, TURNSTILE_ENABLED, type TurnstileHandle } from '@/components/auth/TurnstileWidget';

interface CambiarClaveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CambiarClaveModal({ isOpen, onClose }: CambiarClaveModalProps) {
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveConfirmacion, setClaveConfirmacion] = useState('');
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [verConfirmacion, setVerConfirmacion] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [tokenCaptcha, setTokenCaptcha] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const limpiarFormulario = () => {
    setClaveActual('');
    setClaveNueva('');
    setClaveConfirmacion('');
    setVerActual(false);
    setVerNueva(false);
    setVerConfirmacion(false);
    setTokenCaptcha(null);
  };

  const handleCerrar = () => {
    limpiarFormulario();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verificar conexión a internet
    if (!navigator.onLine) {
      await showError({
        title: 'Sin conexión',
        text: 'Cambiar la contraseña requiere conexión a internet. Inténtalo cuando tengas señal.',
      });
      return;
    }

    // Validaciones en el frontend
    if (!claveActual || !claveNueva || !claveConfirmacion) {
      toast.error('Completa todos los campos.');
      return;
    }

    if (claveNueva.length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (claveNueva !== claveConfirmacion) {
      toast.error('La nueva contraseña y la confirmación no coinciden.');
      return;
    }

    if (claveNueva === claveActual) {
      toast.error('La nueva contraseña debe ser diferente a la actual.');
      return;
    }

    if (TURNSTILE_ENABLED && !tokenCaptcha) {
      toast.error('Espera a que termine la verificación de seguridad e inténtalo de nuevo.');
      return;
    }

    setCargando(true);
    try {
      // Paso 1: verificar la contraseña actual con signInWithPassword
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No se pudo obtener el usuario actual.');

      const { error: errorVerificacion } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: claveActual,
        options: tokenCaptcha ? { captchaToken: tokenCaptcha } : undefined,
      });

      if (errorVerificacion) {
        if (/captcha/i.test(errorVerificacion.message || '')) {
          await showError({
            title: 'Verificación de seguridad',
            text: 'No se pudo verificar que eres una persona. Inténtalo de nuevo.',
          });
        } else if (errorVerificacion.message === 'Invalid login credentials') {
          await showError({
            title: 'Contraseña actual incorrecta',
            text: 'La contraseña actual que ingresaste no es correcta.',
          });
        } else {
          await showError({
            title: 'No se pudo verificar la contraseña',
            text: errorVerificacion.message || 'Ocurrió un error al verificar tu contraseña actual.',
          });
        }
        return;
      }

      // Paso 2: actualizar la contraseña
      const { error: errorActualizacion } = await supabase.auth.updateUser({
        password: claveNueva,
      });

      if (errorActualizacion) {
        throw new Error(errorActualizacion.message);
      }

      // Paso 3: cerrar las demás sesiones (opcional, best-effort)
      try {
        await supabase.auth.signOut({ scope: 'others' });
      } catch {
        // No es crítico si falla
      }

      // Éxito
      limpiarFormulario();
      onClose();

      await Swal.fire({
        title: '¡Contraseña actualizada!',
        text: 'Tu contraseña se cambió exitosamente. Las demás sesiones activas fueron cerradas.',
        icon: 'success',
        confirmButtonText: 'Listo',
        confirmButtonColor: '#2563eb',
        customClass: {
          popup: 'swal-caronte-popup',
          title: 'swal-caronte-title',
        },
      });

    } catch (error: any) {
      await showError({
        title: 'Error al cambiar contraseña',
        text: error.message || 'Ocurrió un error desconocido.',
      });
    } finally {
      // El token de Turnstile es de un solo uso: se pide uno nuevo después de cada intento.
      turnstileRef.current?.reset();
      setCargando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={handleCerrar} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden transform transition-all">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Cambiar Contraseña</h3>
          </div>
          <button
            onClick={handleCerrar}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aviso de conexión */}
        <div className="mx-6 mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <Wifi className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Esta acción <strong>requiere conexión a internet</strong>.</span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Contraseña actual */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Contraseña actual *
            </label>
            <div className="relative">
              <input
                type={verActual ? 'text' : 'password'}
                required
                value={claveActual}
                onChange={(e) => setClaveActual(e.target.value)}
                className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="Tu contraseña actual"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setVerActual(!verActual)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {verActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nueva contraseña */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Nueva contraseña * <span className="text-slate-400 font-normal">(mín. 8 caracteres)</span>
            </label>
            <div className="relative">
              <input
                type={verNueva ? 'text' : 'password'}
                required
                value={claveNueva}
                onChange={(e) => setClaveNueva(e.target.value)}
                className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setVerNueva(!verNueva)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {verNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Indicador visual de longitud */}
            {claveNueva.length > 0 && (
              <p className={`text-xs mt-1 font-medium ${claveNueva.length >= 8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {claveNueva.length >= 8 ? '✓ Longitud correcta' : `${8 - claveNueva.length} caracteres más`}
              </p>
            )}
          </div>

          {/* Confirmar nueva contraseña */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Confirmar nueva contraseña *
            </label>
            <div className="relative">
              <input
                type={verConfirmacion ? 'text' : 'password'}
                required
                value={claveConfirmacion}
                onChange={(e) => setClaveConfirmacion(e.target.value)}
                className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all text-slate-800"
                placeholder="Repite la nueva contraseña"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setVerConfirmacion(!verConfirmacion)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {verConfirmacion ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Indicador de coincidencia */}
            {claveConfirmacion.length > 0 && (
              <p className={`text-xs mt-1 font-medium ${claveNueva === claveConfirmacion ? 'text-emerald-600' : 'text-red-500'}`}>
                {claveNueva === claveConfirmacion ? '✓ Las contraseñas coinciden' : '✗ No coinciden'}
              </p>
            )}
          </div>

          <TurnstileWidget ref={turnstileRef} onToken={setTokenCaptcha} />

          {/* Botones */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={handleCerrar}
              disabled={cargando}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando || (TURNSTILE_ENABLED && !tokenCaptcha)}
              className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {cargando ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  Cambiar contraseña
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

