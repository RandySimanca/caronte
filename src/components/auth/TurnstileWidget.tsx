import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * CAPTCHA de Cloudflare Turnstile para el login.
 *
 * - Si VITE_TURNSTILE_SITE_KEY no está definida, TURNSTILE_ENABLED es false y el
 *   login funciona sin CAPTCHA (así se puede desplegar este cambio ANTES de activar
 *   el CAPTCHA en Supabase).
 * - El token es de un solo uso: después de cada intento de login hay que llamar
 *   a reset() para pedir uno nuevo.
 * - Solo se usa al iniciar sesión (que necesita internet). La sesión offline del
 *   cobrador no depende de este componente.
 */

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';
export const TURNSTILE_ENABLED = SITE_KEY.length > 0;

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve() : reject(new Error('turnstile-no-disponible')));
    script.onerror = () => {
      script.remove();
      scriptPromise = null; // permite reintentar
      reject(new Error('turnstile-no-cargo'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface TurnstileHandle {
  /** Pide un token nuevo (el anterior ya no sirve después de usarlo). */
  reset: () => void;
}

interface Props {
  /** Recibe el token cuando el usuario pasa la verificación, o null si venció / falló. */
  onToken: (token: string | null) => void;
}

type Estado = 'cargando' | 'listo' | 'error';

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { onToken },
  ref
) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          /* el widget ya no existe */
        }
      }
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelado = false;
    setEstado('cargando');
    onTokenRef.current(null);

    loadTurnstileScript()
      .then(() => {
        if (cancelado || !contenedorRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(contenedorRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          language: 'es',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'timeout-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            onTokenRef.current(null);
            if (!cancelado) setEstado('error');
          },
        });
        setEstado('listo');
      })
      .catch(() => {
        if (!cancelado) setEstado('error');
      });

    return () => {
      cancelado = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ya fue removido */
        }
      }
      widgetIdRef.current = null;
    };
  }, [intento]);

  const reintentar = useCallback(() => setIntento(n => n + 1), []);

  if (!TURNSTILE_ENABLED) return null;

  return (
    <div className="flex flex-col items-center">
      <div ref={contenedorRef} className="min-h-[65px] flex items-center justify-center" />
      {estado === 'cargando' && (
        <p className="text-xs text-slate-400 mt-1">Verificando seguridad...</p>
      )}
      {estado === 'error' && (
        <div className="text-center mt-1">
          <p className="text-xs text-red-600">
            No se pudo cargar la verificación. Revisa tu conexión a internet.
          </p>
          <button
            type="button"
            onClick={reintentar}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 underline mt-1"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
});
