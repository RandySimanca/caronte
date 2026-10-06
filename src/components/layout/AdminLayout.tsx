import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { 
  Users, 
  Map, 
  BarChart3, 
  Settings,
  LogOut,
  Activity,
  Wallet,
  ChevronLeft,
  ChevronRight
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

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('admin_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('admin_sidebar_collapsed', String(isCollapsed));
  }, [isCollapsed]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className={`bg-slate-900 text-white hidden md:flex flex-col flex-shrink-0 relative overflow-hidden transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}>
        {/* Futuristic accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        
        {/* Sidebar Header */}
        <div className={`p-4 border-b border-white/10 relative z-10 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 shrink-0">
              <span className="font-bold text-xl">A</span>
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <h1 className="font-bold text-lg leading-tight truncate">AdminPanel</h1>
                <p className="text-xs text-brand-300 truncate">Caronte</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors ${
              isCollapsed ? 'hidden' : 'block'
            }`}
            title="Contraer menú"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Floating Expand Toggle when Collapsed */}
        {isCollapsed && (
          <div className="px-3 pt-3 flex justify-center relative z-10">
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors w-full flex justify-center"
              title="Expandir menú"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 relative z-10">
          {!isCollapsed && (
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3 mt-2 px-3">
              Menú Principal
            </div>
          )}
          {ADMIN_NAVIGATION.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
                  isCollapsed ? 'justify-center' : ''
                } ${
                  isActive 
                    ? 'bg-brand-500/10 text-brand-400 font-medium' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-brand-400' : 'group-hover:text-white'}`} />
                {!isCollapsed && (
                  <span className="truncate">{item.name}</span>
                )}
                {isActive && !isCollapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] shrink-0" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer / User Info */}
        <div className="p-3 border-t border-white/10 relative z-10">
          <div className={`mb-3 flex items-center gap-3 ${isCollapsed ? 'justify-center px-0' : 'px-2'}`}>
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs text-slate-300 uppercase shrink-0">
              {user?.email?.charAt(0) || 'A'}
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{user?.user_metadata?.full_name || 'Administrador'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => signOut()}
            title={isCollapsed ? "Cerrar Sesión" : undefined}
            className={`w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-red-500/10 text-slate-300 hover:text-red-400 rounded-xl transition-colors text-sm font-medium ${
              isCollapsed ? 'px-0' : 'px-4'
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Cerrar Sesión</span>}
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

