import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Options {
  /** Tablas de public a vigilar (deben estar en la publicación supabase_realtime, ver migración 033). */
  tables: string[];
  /** Agrupa ráfagas: un celular sincronizando manda muchos eventos seguidos y solo queremos 1 recarga. */
  debounceMs?: number;
  /** Red de seguridad: recarga cada tanto (solo con la pestaña visible) por si el realtime no está activo o se cayó. 0 = desactivado. */
  fallbackPollMs?: number;
  enabled?: boolean;
}

/**
 * Llama a `onChange` cuando cambia algo en las tablas indicadas (p. ej. un cobrador sube un cobro desde el celular),
 * para que el PC se actualice solo sin recargar la página.
 *
 * Devuelve true cuando la conexión en tiempo real está activa.
 * Además recarga al volver a la pestaña, al recuperar internet y al reconectar el canal
 * (mientras estuvo caído pudo perder eventos).
 */
export function useRealtimeRefresh(
  onChange: () => void,
  { tables, debounceMs = 1500, fallbackPollMs = 90_000, enabled = true }: Options,
): boolean {
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  });

  const [live, setLive] = useState(false);
  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callbackRef.current();
      }, debounceMs);
    };

    const channel = supabase.channel(`rt-refresh-${tablesKey}-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of tablesKey.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, trigger);
    }

    let hadConnection = false;
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        setLive(true);
        if (hadConnection) trigger(); // reconexión: se pudieron perder eventos
        hadConnection = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setLive(false);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', trigger);

    const poll = fallbackPollMs > 0
      ? setInterval(() => {
          if (document.visibilityState === 'visible') callbackRef.current();
        }, fallbackPollMs)
      : null;

    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', trigger);
      supabase.removeChannel(channel);
      setLive(false);
    };
  }, [tablesKey, debounceMs, fallbackPollMs, enabled]);

  return live;
}
