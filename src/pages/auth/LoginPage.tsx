import { useState } from 'react';
import { Lock, Phone, Eye, EyeOff, Wifi } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { SyncService } from '@/services/SyncService';
import toast from 'react-hot-toast';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('No se pudo iniciar sesión');

      // Validar rol y asignación de ruta
      const { data: userData } = await supabase
        .from('users')
        .select('role_id, roles!role_id(name)')
        .eq('id', data.session.user.id)
        .maybeSingle();
      
      const roleName = userData?.roles?.name || 'COBRADOR';
      
      if (roleName === 'COBRADOR') {
        const { data: assignmentData } = await supabase
          .from('route_assignments')
          .select('id')
          .eq('collector_id', data.session.user.id)
          .is('date_end', null)
          .maybeSingle();
          
        if (!assignmentData) {
          await supabase.auth.signOut();
          throw new Error('NO_ROUTE_ASSIGNED');
        }
      }

      signIn(data.session);

      // Pull initial data after login
      toast.promise(
        SyncService.pullInitialData(data.session.user.id),
        {
          loading: 'Descargando datos de tu ruta...',
          success: '¡Datos descargados! Listo para trabajar.',
          error: 'Sin conexión. Puedes trabajar con datos guardados.',
        }
      );
    } catch (error: any) {
      if (error.message === 'NO_ROUTE_ASSIGNED') {
        toast.error('No puedes iniciar sesión porque no tienes ninguna ruta asignada en este momento. Contacta al administrador.', { duration: 5000 });
      } else {
        toast.error(error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos'
          : error.message || 'Error al iniciar sesión'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full -ml-32 -mt-32 blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-72 h-72 bg-brand-900 opacity-30 rounded-full -mr-36 -mb-36 blur-3xl"></div>

      {/* Logo / App name */}
      <div className="mb-10 text-center relative z-10">
        <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-4 border border-white/20 shadow-xl">
          <span className="text-4xl">💰</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">CobraDiario</h1>
        <p className="text-brand-200 text-sm mt-1 font-medium">Sistema de préstamos y cobros</p>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-brand-900/30 p-7 relative z-10">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Iniciar sesión</h2>
        <p className="text-slate-500 text-sm mb-6">Ingresa con tu cuenta asignada</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Correo electrónico</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Phone className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none focus:bg-white transition-all"
                placeholder="cobrador@ejemplo.com"
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none focus:bg-white transition-all"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl shadow-md shadow-brand-500/30 transition-all active:scale-[0.98] mt-2"
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-center space-x-2 text-xs text-slate-400">
          <Wifi className="w-3 h-3" />
          <span>Funciona sin conexión después del primer inicio</span>
        </div>
      </div>
    </div>
  );
}
