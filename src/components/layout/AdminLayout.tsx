import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { 
  Users, 
  Map, 
  BarChart3, 
  Settings,
  LogOut,
  Activity,
  Wallet
} from 'lucide-react';

const ADMIN_NAVIGATION = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: Activity },
  { name: 'Liquidaciones', href: '/admin/liquidations', icon: Wallet },
  { name: 'Usuarios', href: '/admin/users', icon: Users },
  { name: 'Rutas', href: '/admin/routes', icon: Map },
  { name: 'Reportes', href: '/admin/reports', icon: BarChart3 },
  { name: 'Ajustes', href: '/admin/settings', icon: Settings },
];

export function AdminLayout() {
  const { signOut, user } = useAuthStore();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col flex-shrink-0 relative overflow-hidden">
        {/* Futuristic accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        <div className="p-6 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/30">
              <span className="font-bold text-xl">A</span>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">AdminPanel</h1>
              <p className="text-xs text-brand-300">CobraDiario</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 relative z-10">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 mt-2 px-3">
            Menú Principal
          </div>
          {ADMIN_NAVIGATION.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-brand-500/10 text-brand-400 font-medium' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : 'group-hover:text-white'}`} />
                {item.name}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/10 relative z-10">
          <div className="mb-4 px-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-300 uppercase">
              {user?.email?.charAt(0) || 'A'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user?.user_metadata?.full_name || 'Administrador'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-red-500/10 text-slate-300 hover:text-red-400 rounded-xl transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile Topbar */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white">
            <span className="font-bold">A</span>
          </div>
          <h1 className="font-bold">AdminPanel</h1>
        </div>
        <button onClick={() => signOut()} className="p-2 text-slate-400 hover:text-white">
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 pb-safe z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {ADMIN_NAVIGATION.map((item) => {
          const isActive = location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-colors ${
                isActive ? 'text-brand-600' : 'text-slate-500'
              }`}
            >
              <item.icon className={`w-6 h-6 mb-1 ${isActive ? 'stroke-2' : ''}`} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-[calc(100vh-64px)] md:h-screen overflow-hidden bg-slate-50 md:rounded-l-2xl md:-ml-2 shadow-2xl relative z-20">
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
