import { useEffect } from 'react';
import { RouterProvider, createBrowserRouter, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { SyncService } from '@/services/SyncService';

import { CollectorLayout } from '@/components/layout/CollectorLayout';
import { CollectorDashboard } from '@/pages/collector/CollectorDashboard';
import { RouteClientList } from '@/pages/collector/RouteClientList';
import { ClientDetailPage } from '@/pages/collector/ClientDetailPage';
import { EditClientPage } from '@/pages/collector/EditClientPage';
import { ExpensesPage } from '@/pages/collector/ExpensesPage';
import { NewLoanWizard } from '@/pages/collector/NewLoanWizard';
import { DailyClosingPage } from '@/pages/collector/DailyClosingPage';
import { LoginPage } from '@/pages/auth/LoginPage';

import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { LiquidationsPage } from '@/pages/admin/LiquidationsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { RoutesPage } from '@/pages/admin/RoutesPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { ReportsPage } from '@/pages/admin/ReportsPage';

// Protected route wrapper
function RequireAuth({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { session, role, isLoading } = useAuthStore();
  if (isLoading) return <SplashScreen />;
  if (!session) return <LoginPage />;
  
  // Wait for role to be loaded
  if (!role) return <SplashScreen />;

  // Check roles
  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'ADMINISTRADOR') return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function SplashScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 to-brand-500 flex flex-col items-center justify-center">
      <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-4 border border-white/20">
        <span className="text-4xl">💰</span>
      </div>
      <h1 className="text-3xl font-black text-white">CobraDiario</h1>
      <div className="mt-8 flex space-x-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  // RUTAS DEL COBRADOR
  {
    path: '/',
    element: <RequireAuth allowedRoles={['COBRADOR']}><CollectorLayout /></RequireAuth>,
    children: [
      { index: true, element: <CollectorDashboard /> },
      { path: 'route', element: <RouteClientList /> },
      { path: 'collect', element: <Navigate to="/route" replace /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'more', element: <DailyClosingPage /> },
    ]
  },
  { path: '/client/:id', element: <RequireAuth allowedRoles={['COBRADOR']}><ClientDetailPage /></RequireAuth> },
  { path: '/client/:id/edit', element: <RequireAuth allowedRoles={['COBRADOR']}><EditClientPage /></RequireAuth> },
  { path: '/loan/new', element: <RequireAuth allowedRoles={['COBRADOR']}><NewLoanWizard /></RequireAuth> },
  
  // RUTAS DEL ADMINISTRADOR
  {
    path: '/admin',
    element: <RequireAuth allowedRoles={['ADMINISTRADOR']}><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <AdminDashboard /> },
      { path: 'liquidations', element: <LiquidationsPage /> },
      { path: 'users', element: <UsersPage /> },
      // Placeholders para el resto
      { path: 'routes', element: <RoutesPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ]
  }
]);

export function App() {
  const { checkSession, session } = useAuthStore();
  const { setOnlineStatus } = useSyncStore();

  useEffect(() => {
    // 1. Restore session on app start
    checkSession();

    // 2. Listen for auth changes (token refresh, logout from another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        useAuthStore.getState().signIn(newSession);
      } else {
        useAuthStore.setState({ session: null, user: null, role: null });
      }
    });

    // 3. Monitor network connectivity
    const handleOnline = async () => {
      setOnlineStatus(true);
      // Push any pending operations, then pull fresh data from server
      await SyncService.pushPendingOperations();
      const userId = useAuthStore.getState().user?.id;
      const role = useAuthStore.getState().role;
      if (userId && role === 'COBRADOR') {
        await SyncService.pullInitialData(userId);
      }
    };
    const handleOffline = () => setOnlineStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync every 5 minutes when online
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        await SyncService.pushPendingOperations();
        // Also pull fresh data so admin changes (edits, new loans, etc.) are seen by collector
        const userId = useAuthStore.getState().user?.id;
        const role = useAuthStore.getState().role;
        if (userId && role === 'COBRADOR') {
          await SyncService.pullInitialData(userId);
        }
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: '12px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
          },
        }}
      />
    </>
  );
}
