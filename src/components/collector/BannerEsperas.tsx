import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Clock, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAhora,
  avisarEsperaVencida,
  quitarClienteDeEspera,
  formatearCuentaRegresiva,
  formatearHoraRegreso,
  ETIQUETA_MOTIVO,
  type ClienteEnEspera,
} from '@/lib/clientesEnEspera';

// Esperas ya avisadas en esta sesión (para no vibrar cada vez que se vuelve a la lista)
const esperasAvisadas = new Set<string>();

/** Banner de la lista de ruta: muestra a quién hay que volver a visitar y cuánto falta. */
export function BannerEsperas({ esperas }: { esperas: ClienteEnEspera[] }) {
  const ahora = useAhora(esperas.length > 0);

  useEffect(() => {
    for (const espera of esperas) {
      const clave = `${espera.clienteId}:${espera.hasta}`;
      if (ahora >= espera.hasta && !esperasAvisadas.has(clave)) {
        esperasAvisadas.add(clave);
        avisarEsperaVencida();
      }
    }
  }, [ahora, esperas]);

  if (esperas.length === 0) return null;

  const ordenadas = [...esperas].sort((a, b) => a.hasta - b.hasta);
  const vencidas = ordenadas.filter(e => ahora >= e.hasta);
  const principal = vencidas[0] ?? ordenadas[0];
  const estaVencida = ahora >= principal.hasta;
  const otras = ordenadas.length - 1;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b',
        estaVencida ? 'bg-rose-600 border-rose-700 text-white animate-pulse' : 'bg-amber-50 border-amber-200 text-amber-900'
      )}
      role="status"
    >
      <Clock className={cn('w-6 h-6 flex-shrink-0', estaVencida ? 'text-white' : 'text-amber-500')} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">
          {estaVencida ? `Ya es hora de volver donde ${principal.nombreCliente}` : `Volver donde ${principal.nombreCliente}`}
        </p>
        <p className={cn('text-[11px] truncate', estaVencida ? 'text-rose-100' : 'text-amber-700')}>
          {ETIQUETA_MOTIVO[principal.motivo]} · a las {formatearHoraRegreso(principal.hasta)}
          {otras > 0 && ` · +${otras} en espera`}
        </p>
      </div>

      <span className="text-lg font-black tabular-nums flex-shrink-0">
        {estaVencida ? '¡Ya!' : formatearCuentaRegresiva(principal.hasta - ahora)}
      </span>

      <NavLink
        to={`/client/${principal.clienteId}`}
        className={cn(
          'p-1.5 rounded-lg flex-shrink-0',
          estaVencida ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-800'
        )}
        aria-label={`Ir a ${principal.nombreCliente}`}
      >
        <ChevronRight className="w-5 h-5" />
      </NavLink>
      <button
        type="button"
        onClick={() => quitarClienteDeEspera(principal.clienteId)}
        className={cn('p-1.5 rounded-lg flex-shrink-0', estaVencida ? 'text-rose-100' : 'text-amber-600')}
        aria-label="Quitar de espera"
        title="Quitar de espera"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

/** Insignia pequeña para cada cliente de la lista que está en espera. */
export function InsigniaEspera({ hasta }: { hasta: number }) {
  const ahora = useAhora(true);
  const estaVencida = ahora >= hasta;

  return (
    <span
      className={cn(
        'mt-1 ml-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums',
        estaVencida
          ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
          : 'bg-amber-100 text-amber-800 border-amber-300'
      )}
    >
      <Clock className="w-3 h-3" />
      {estaVencida ? 'Volver ya' : formatearCuentaRegresiva(hasta - ahora)}
    </span>
  );
}
