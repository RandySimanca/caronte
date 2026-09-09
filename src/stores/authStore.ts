import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: string | null;
  isLoading: boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  isLoading: true,

  signIn: async (session) => {
    set({ session, user: session.user, isLoading: false });
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role_id, roles!role_id(name)')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!error && data && (data as any).roles) {
        // @ts-ignore
        set({ role: (data as any).roles.name });
      } else {
        set({ role: 'COBRADOR' });
      }
    } catch {
      set({ role: 'COBRADOR' });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, role: null });
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
            .select('role_id, roles!role_id(name)')
            .eq('id', session.user.id)
            .maybeSingle(); // maybeSingle() returns null instead of error when no row found

          if (!error && data && (data as any).roles) {
            // @ts-ignore - PostgREST embedded response typing
            set({ role: data.roles.name });
          } else {
            // User row may not exist in custom users table yet; default to COBRADOR
            set({ role: 'COBRADOR' });
          }
        } catch {
          set({ role: 'COBRADOR' });
        }
      }
    } catch (error) {
      console.error('Session check failed', error);
      set({ isLoading: false });
    }
  }
}));
