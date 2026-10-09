import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Busca la clave donde supabase-js guarda la sesión en localStorage
 * (formato `sb-<project-ref>-auth-token`).
 */
function findSupabaseStorageKey(): string | null {
    try {
        const url = import.meta.env.VITE_SUPABASE_URL as string;
        const ref = new URL(url).hostname.split('.')[0];
        const expected = `sb-${ref}-auth-token`;
        if (localStorage.getItem(expected)) return expected;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && /^sb-.+-auth-token$/.test(key)) return key;
        }
    } catch {
        /* localStorage no disponible */
    }
    return null;
}

/**
 * Lee la sesión que supabase-js dejó guardada en el dispositivo, SIN pasar por la red.
 *
 * Por qué existe: `supabase.auth.getSession()` devuelve `null` cuando el access token
 * ya venció (dura ~1 h) y no hay internet para refrescarlo, aunque el refresh token
 * siga guardado y sea válido. Con esto la app puede seguir abierta para cobrar offline
 * y supabase-js renueva el token solo cuando vuelva la señal.
 */
export function readStoredSession(): Session | null {
    try {
        const key = findSupabaseStorageKey();
        if (!key) return null;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.user?.id && parsed?.refresh_token) return parsed as Session;
    } catch {
        /* JSON corrupto o storage bloqueado */
    }
    return null;
}

/**
 * Intenta renovar el token (si ya venció) antes de sincronizar.
 * Nunca lanza error: si no hay red simplemente no hace nada.
 */
export async function ensureFreshSession(): Promise<void> {
    try {
        await supabase.auth.getSession();
    } catch {
        /* sin red: se reintentará en el siguiente ciclo */
    }
}
