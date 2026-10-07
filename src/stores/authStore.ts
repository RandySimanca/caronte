import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { db } from '@/db/schema';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: string | null;
  companyId: string | null;
  isLoading: boolean;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
  loadUserProfile: (userId: string) => Promise<void>;
}

const LOCAL_STORAGE_KEY = 'auth_profile';

interface AuthProfile {
  userId: string;
  role: string;
  companyId: string | null;
}

// Función auxiliar para guardar perfil en localStorage
function saveProfileToLocalStorage(userId: string, role: string, companyId: string | null) {
  const profile: AuthProfile = { userId, role, companyId };
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));
}

// Función auxiliar para cargar perfil desde localStorage
function loadProfileFromLocalStorage(userId: string): AuthProfile | null {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return null;

    const profile: AuthProfile = JSON.parse(stored);
    // Solo usar si es del mismo usuario
    if (profile.userId === userId) {
      return profile;
    }
    return null;
  } catch {
    return null;
  }
}

// Función auxiliar para limpiar localStorage
function clearProfileFromLocalStorage() {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  companyId: null,
  isLoading: true,

  // Función unificada para cargar el perfil del usuario
  loadUserProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role_id, company_id, roles!role_id(name)')
        .eq('id', userId)
        .maybeSingle();

      console.log('[Auth] User profile query result:', { data, error });

      if (!error && data && (data as any).roles) {
        const roleName = (data as any).roles.name;
        const userCompanyId = data.company_id || null;

        // Guardar en localStorage para uso offline
        saveProfileToLocalStorage(userId, roleName, userCompanyId);

        set({ role: roleName, companyId: userCompanyId });

        // Validar estado de la empresa (solo online, no para SuperAdmin ni offline)
        if (roleName !== 'SUPER_ADMIN' && userCompanyId && navigator.onLine) {
          try {
            const { data: companyData, error: companyError } = await supabase
              .from('companies')
              .select('status, subscription_expires_at')
              .eq('id', userCompanyId)
              .single();

            if (!companyError && companyData) {
              const isActive = companyData.status === 'ACTIVE' &&
                (companyData.subscription_expires_at === null || new Date(companyData.subscription_expires_at) > new Date());

              if (!isActive) {
                console.warn('[Auth] Empresa suspendida o vencida');
                await supabase.auth.signOut();
                set({ session: null, user: null, role: null, companyId: null });
                throw new Error('Tu empresa está suspendida o vencida. Contacta a soporte.');
              }
            }
          } catch (companyErr) {
            console.warn('[Auth] Error validando estado de empresa:', companyErr);
            // No bloquear la sesión si falla la validación de empresa
          }
        }
      } else {
        // Si no hay fila en users, cerrar sesión con mensaje claro
        console.error('[Auth] Usuario no tiene perfil en public.users');
        await supabase.auth.signOut();
        set({ session: null, user: null, role: null, companyId: null });
        throw new Error('Tu usuario no tiene perfil. Contacta al administrador.');
      }
    } catch (err) {
      // Ante error de red o error del servidor, usar localStorage como fallback
      console.warn('[Auth] Error cargando perfil, usando localStorage:', err);
      const cachedProfile = loadProfileFromLocalStorage(userId);

      if (cachedProfile) {
        console.log('[Auth] Usando perfil caché:', cachedProfile);
        set({ role: cachedProfile.role, companyId: cachedProfile.companyId });
      } else {
        // Si no hay caché ni conexión, mantener el estado actual (no degradar)
        console.warn('[Auth] Sin perfil caché, manteniendo estado actual');
      }
    }
  },

  signIn: async (session) => {
    set({ session, user: session.user, isLoading: false });

    // Usar setTimeout para evitar bloqueos dentro de onAuthStateChange
    setTimeout(() => {
      get().loadUserProfile(session.user.id);
    }, 0);
  },

  signOut: async () => {
    // Verificar si hay operaciones pendientes antes de cerrar sesión
    try {
      const pendingCount = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'failed', 'syncing'])
        .count();

      if (pendingCount > 0) {
        const shouldProceed = confirm(
          `Hay ${pendingCount} operaciones sin sincronizar (cobros pendientes). ` +
          'Si sales ahora, estos datos se perderán. ¿Deseas continuar?'
        );

        if (!shouldProceed) {
          return; // Usuario canceló el cierre de sesión
        }

        // Si confirma, intentar sincronizar si hay red
        if (navigator.onLine) {
          console.log('[Auth] Intentando sincronizar antes de cerrar sesión...');
          try {
            const { SyncService } = await import('@/services/SyncService');
            await SyncService.pushPendingOperations();
          } catch (syncErr) {
            console.warn('[Auth] Error en sincronización final:', syncErr);
          }
        }
      }

      // Si no hay pendientes o el usuario confirmó, limpiar todo
      clearProfileFromLocalStorage();

      // Vaciar todas las tablas de Dexie
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
      });

      // Limpiar cachés del service worker
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (cacheErr) {
          console.warn('[Auth] Error limpiando caches:', cacheErr);
        }
      }

      await supabase.auth.signOut();
      set({ session: null, user: null, role: null, companyId: null });
    } catch (err) {
      console.error('[Auth] Error en signOut:', err);
      // En caso de error, al menos cerrar la sesión de Supabase
      await supabase.auth.signOut();
      set({ session: null, user: null, role: null, companyId: null });
    }
  },

  checkSession: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, user: session?.user || null, isLoading: false });

      if (session?.user) {
        // Usar setTimeout para evitar bloqueos
        setTimeout(() => {
          get().loadUserProfile(session.user.id);
        }, 0);
      } else {
        // No hay sesión, limpiar todo
        clearProfileFromLocalStorage();
        set({ role: null, companyId: null });
      }
    } catch (error) {
      console.error('[Auth] Session check failed:', error);
      set({ isLoading: false });
    }
  }
}));
