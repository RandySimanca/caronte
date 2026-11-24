import { NavLink } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAhora,
  quitarClienteDeEspera,
  formatearCuentaRegresiva,
  formatearHoraRegreso,
  ETIQUETA_MOTIVO,
  type ClienteEnEspera,
} from '@/lib/clientesEnEspera';

interface Props {
  estaAbierta: boolean;
  alCerrar: () => void;
  esperas: ClienteEnEspera[];
}

/** Lista de todos los clientes a los que hay que volver, del más urgente al menos urgente. */
export function ListaEsperasModal({ estaAbierta, alCerrar, esperas }: Props) {
  const ahora = useAhora(estaAbierta);

  if (!estaAbierta) return null;

  const ordenadas = [...esperas].sort((a, b) => a.hasta - b.hasta);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={alCerrar} />
      <div className="relative w-full max-w-md max-h-[80vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-xl">
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Clientes por volver a visitar
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {ordenadas.length} {ordenadas.length === 1 ? 'cliente en espera' : 'clientes en espera'}
            </p>
          </div>
          <button type="button" onClick={alCerrar} className="p-2 -mr-2 -mt-2 text-slate-400" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {ordenadas.map(espera => {
            const estaVencida = ahora >= espera.hasta;
            return (
              <li
                key={espera.clienteId}
                className={cn(
                  'rounded-xl border p-3',
                  estaVencida ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-200'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{espera.nombreCliente}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {ETIQUETA_MOTIVO[espera.motivo]} · volver a las {formatearHoraRegreso(espera.hasta)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-lg font-black tabular-nums flex-shrink-0',
                      estaVencida ? 'text-rose-600' : 'text-amber-700'
                    )}
                  >
                    {estaVencida ? '¡Ya!' : formatearCuentaRegresiva(espera.hasta - ahora)}
                  </span>
                </div>
                <div className="flex gap-2 mt-3">
                  <NavLink
                    to={`/client/${espera.clienteId}`}
                    onClick={alCerrar}
                    className="flex-1 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold text-center"
                  >
                    Ir al cliente
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => quitarClienteDeEspera(espera.clienteId)}
                    className="flex-1 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Quitar espera
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
