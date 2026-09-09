import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Map as MapIcon, DollarSign, Wallet, MoreHorizontal, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { format } from 'date-fns';

export function CollectorLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navItems = [
    { to: '/', icon: Home, label: 'Inicio' },
    { to: '/route', icon: MapIcon, label: 'Mi Ruta' },
    { to: '/collect', icon: DollarSign, label: 'Cobros', primary: true },
    { to: '/expenses', icon: Wallet, label: 'Gastos' },
    { to: '/more', icon: MoreHorizontal, label: 'Más' },
  ];

  const today = format(new Date(), 'yyyy-MM-dd');
  const dayClosedSetting = useLiveQuery(() => db.settings.get(`day_closed_${today}`), [today]);
  const isDayClosed = dayClosedSetting?.value === true;

  // Rutas permitidas cuando el día está cerrado
  const isAllowedWhenClosed = pathname === '/' || pathname === '/more' || pathname === '/more/closing';

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header / Top Bar (can be overridden by children via Portal or specific components) */}
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-[80px] relative">
        {isDayClosed && !isAllowedWhenClosed ? (
          <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-6 text-center z-40">
            <div className="w-20 h-20 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
              <Lock className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">Día Cerrado</h2>
            <p className="text-slate-500 mb-8 max-w-sm font-medium">
              Tu ruta ha sido liquidada o el día fue cerrado manualmente. No puedes realizar más movimientos hoy.
            </p>
            <button
              onClick={() => navigate('/more')}
              className="w-full max-w-xs bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98]"
            >
              Ver Resumen
            </button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 px-2 py-2 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-50">
        <ul className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    isActive ? "text-brand-600" : "text-slate-400 hover:text-slate-600",
                    item.primary && "-mt-6"
                  )
                }
              >
                {item.primary ? (
                  <div className="bg-brand-600 text-white rounded-full p-4 shadow-lg shadow-brand-500/30">
                    <item.icon className="w-6 h-6" />
                  </div>
                ) : (
                  <>
                    <item.icon className="w-6 h-6" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
