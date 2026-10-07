import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: string | null;
  companyId: string | null;
  isLoading: boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  companyId: null,
  isLoading: true,

  signIn: async (session) => {
    set({ session, user: session.user, isLoading: false });
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role_id, company_id, roles!role_id(name)')
        .eq('id', session.user.id)
        .maybeSingle();

      console.log('[Auth] User data query result:', { data, error });

      if (!error && data && (data as any).roles) {
        // @ts-ignore
        set({ role: (data as any).roles.name, companyId: data.company_id || null });
      } else {
        console.error('[Auth] User not found in users table or error:', error, data);
        set({ role: 'COBRADOR', companyId: null });
      }
    } catch (err) {
      console.error('[Auth] Exception fetching user role:', err);
      set({ role: 'COBRADOR', companyId: null });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, role: null, companyId: null });
  },

  checkSession: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, user: session?.user || null, isLoading: false });

      if (session?.user) {
        try {
          // Use explicit FK hint: roles!role_id(name)
          const { data, error } = await supabase
            .from('users')
            .select('role_id, company_id, roles!role_id(name)')
            .eq('id', session.user.id)
            .maybeSingle(); // maybeSingle() returns null instead of error when no row found

          console.log('[Auth] Session check result:', { data, error });

          if (!error && data && (data as any).roles) {
            // @ts-ignore - PostgREST embedded response typing
            set({ role: data.roles.name, companyId: data.company_id || null });
          } else {
            console.error('[Auth] User not found in users table or error:', error, data);
            set({ role: 'COBRADOR', companyId: null });
          }
        } catch (err) {
          console.error('[Auth] Exception fetching user role:', err);
          set({ role: 'COBRADOR', companyId: null });
        }
      }
    } catch (error) {
      console.error('Session check failed', error);
      set({ isLoading: false });
    }
  }
}));
