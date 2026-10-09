import { create } from 'zustand';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { db } from '@/db/schema';
import { readStoredSession } from '@/lib/offlineSession';

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
  handleAuthEvent: (event: AuthChangeEvent, session: Session | null) => void;
}

const LOCAL_STORAGE_KEY = 'auth_profile';

interface AuthProfile {
  userId: string;
  role: string;
  companyId: string | null;
}

// true mientras el propio usuario está cerrando sesión (para distinguirlo de un SIGNED_OUT "accidental")
let userInitiatedSignOut = false;

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

export const useAuthStore = create<AuthState>((set, get) => {
  /** Aplica de inmediato el rol/empresa guardados, para poder entrar sin red. */
  const hydrateProfileFromCache = (userId: string) => {
    const cached = loadProfileFromLocalStorage(userId);
    if (cached) set({ role: cached.role, companyId: cached.companyId });
  };

  /** Cierre de sesión forzado por el servidor (empresa suspendida, usuario sin perfil). No borra datos locales. */
  const forceSignOut = async () => {
    userInitiatedSignOut = true;
    try {
      await supabase.auth.signOut();
    } finally {
      userInitiatedSignOut = false;
    }
    clearProfileFromLocalStorage();
    set({ session: null, user: null, role: null, companyId: null });
  };

  return {
    session: null,
    user: null,
    role: null,
    companyId: null,
    isLoading: true,

    // Carga el perfil del usuario. JAMÁS cierra la sesión por un error de red o del servidor:
    // solo lo hace si la consulta respondió bien y confirma que no hay perfil / empresa inactiva.
    loadUserProfile: async (userId: string) => {
      // 1) Dejar el perfil en caché aplicado ya mismo (funciona sin internet)
      hydrateProfileFromCache(userId);

      if (!navigator.onLine) return;

      try {
        const { data, error } = await supabase
          .from('users')
          .select('role_id, company_id, roles!role_id(name)')
          .eq('id', userId)
          .maybeSingle();

        // Supabase NO lanza excepción en errores de red: los devuelve en `error`.
        // Con mala señal, token vencido o error 5xx se conserva la sesión y el perfil en caché.
        if (error) {
          console.warn('[Auth] No se pudo cargar el perfil, se conserva el caché:', error.message);
          return;
        }

        if (!data || !(data as any).roles) {
          // La consulta respondió OK y realmente no existe el perfil
          console.error('[Auth] Usuario no tiene perfil en public.users');
          toast.error('Tu usuario no tiene perfil. Contacta al administrador.');
          await forceSignOut();
          return;
        }

        const roleName = (data as any).roles.name as string;
        const userCompanyId = data.company_id || null;

        saveProfileToLocalStorage(userId, roleName, userCompanyId);
        set({ role: roleName, companyId: userCompanyId });

        // Validar estado de la empresa (solo online y no para SuperAdmin)
        if (roleName !== 'SUPER_ADMIN' && userCompanyId) {
          const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('status, subscription_expires_at')
            .eq('id', userCompanyId)
            .single();

          // Si falla la validación (red, etc.) NO se bloquea la sesión
          if (!companyError && companyData) {
            const isActive =
              companyData.status === 'ACTIVE' &&
              (companyData.subscription_expires_at === null ||
                new Date(companyData.subscription_expires_at) > new Date());

            if (!isActive) {
              console.warn('[Auth] Empresa suspendida o vencida');
              toast.error('Tu empresa está suspendida o vencida. Contacta a soporte.');
              await forceSignOut();
            }
          }
        }
      } catch (err) {
        console.warn('[Auth] Error cargando perfil, se conserva el caché:', err);
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
      // Sin internet NO se permite cerrar sesión: se borraría la ruta descargada y
      // no habría forma de volver a entrar hasta recuperar la señal.
      if (!navigator.onLine) {
        toast.error(
          'Sin conexión no puedes cerrar sesión: perderías tu ruta y no podrías volver a entrar. Hazlo cuando tengas internet.',
          { duration: 6000 }
        );
        return;
      }

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

        userInitiatedSignOut = true;
        await supabase.auth.signOut();
        set({ session: null, user: null, role: null, companyId: null });
      } catch (err) {
        console.error('[Auth] Error en signOut:', err);
        // En caso de error, al menos cerrar la sesión de Supabase
        userInitiatedSignOut = true;
        await supabase.auth.signOut();
        set({ session: null, user: null, role: null, companyId: null });
      } finally {
        userInitiatedSignOut = false;
      }
    },

    checkSession: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          set({ session, user: session.user, isLoading: false });
          hydrateProfileFromCache(session.user.id);
          setTimeout(() => get().loadUserProfile(session.user.id), 0);
          return;
        }

        // getSession() devuelve null si el access token venció y no hay red para renovarlo,
        // aunque la sesión SIGA guardada y siga siendo válida. En ese caso se usa la guardada:
        // supabase-js renueva el token solo cuando vuelva la señal.
        // Si el servidor rechazó el refresh token, supabase-js ya borró la sesión y aquí no habrá nada.
        const stored = readStoredSession();
        if (stored) {
          console.warn('[Auth] Usando sesión guardada en el dispositivo (sin renovar token)');
          set({ session: stored, user: stored.user, isLoading: false });
          hydrateProfileFromCache(stored.user.id);
          setTimeout(() => get().loadUserProfile(stored.user.id), 0);
          return;
        }

        // Realmente no hay sesión
        clearProfileFromLocalStorage();
        set({ session: null, user: null, role: null, companyId: null, isLoading: false });
      } catch (error) {
        console.error('[Auth] Session check failed:', error);
        // Ante un error inesperado NO se cierra la sesión si existe una guardada
        const stored = readStoredSession();
        if (stored) {
          set({ session: stored, user: stored.user, isLoading: false });
          hydrateProfileFromCache(stored.user.id);
        } else {
          set({ isLoading: false });
        }
      }
    },

    // Reacciona a los eventos de supabase.auth.onAuthStateChange
    handleAuthEvent: (event, newSession) => {
      if (newSession) {
        get().signIn(newSession);
        return;
      }

      // Evento sin sesión. Solo se cierra la sesión local cuando es un SIGNED_OUT real:
      // lo pidió el usuario, o el servidor (estando online) rechazó el refresh token.
      // Se ignora INITIAL_SESSION nulo y cualquier SIGNED_OUT sin conexión: lo resuelve checkSession().
      if (event === 'SIGNED_OUT' && (userInitiatedSignOut || navigator.onLine)) {
        clearProfileFromLocalStorage();
        set({ session: null, user: null, role: null, companyId: null, isLoading: false });
      } else {
        console.warn('[Auth] Evento sin sesión ignorado:', event);
      }
    },
  };
});
