import { useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EsperaClienteModal } from './EsperaClienteModal';
import {
  useClientesEnEspera,
  useAhora,
  quitarClienteDeEspera,
  formatearCuentaRegresiva,
  formatearHoraRegreso,
  ETIQUETA_MOTIVO,
} from '@/lib/clientesEnEspera';

/** En el detalle del cliente: botón para ponerlo en espera, o la tarjeta con el cronómetro si ya lo está. */
export function EsperaClienteDetalle({ clienteId, nombreCliente }: { clienteId: string; nombreCliente: string }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const esperas = useClientesEnEspera();
  const espera = esperas.find(e => e.clienteId === clienteId);
  const ahora = useAhora(!!espera);

  const estaVencida = !!espera && ahora >= espera.hasta;

  return (
    <div className="mt-3">
      {espera ? (
        <div
          className={cn(
            'rounded-xl border p-3',
            estaVencida ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-200'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={cn('text-xs font-bold uppercase', estaVencida ? 'text-rose-700' : 'text-amber-700')}>
                {estaVencida ? 'Ya es hora de volver' : 'En espera'}
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {ETIQUETA_MOTIVO[espera.motivo]} · volver a las {formatearHoraRegreso(espera.hasta)}
              </p>
            </div>
            <span className={cn('text-xl font-black tabular-nums', estaVencida ? 'text-rose-600' : 'text-amber-700')}>
              {estaVencida ? '¡Ya!' : formatearCuentaRegresiva(espera.hasta - ahora)}
            </span>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="flex-1 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold"
            >
              Cambiar tiempo
            </button>
            <button
              type="button"
              onClick={() => quitarClienteDeEspera(clienteId)}
              className="flex-1 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold"
            >
              Quitar espera
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-sm transition-colors"
        >
          <Clock className="w-4 h-4" />
          No está / no tiene el dinero: poner en espera
        </button>
      )}

      <EsperaClienteModal
        estaAbierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        clienteId={clienteId}
        nombreCliente={nombreCliente}
      />
    </div>
  );
}
