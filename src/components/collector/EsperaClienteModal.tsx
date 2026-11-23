import { useState } from 'react';
import { Clock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import {
  ponerClienteEnEspera,
  ETIQUETA_MOTIVO,
  formatearHoraRegreso,
  type MotivoEspera,
} from '@/lib/clientesEnEspera';

const OPCIONES_TIEMPO = [
  { minutos: 15, etiqueta: '15 min' },
  { minutos: 30, etiqueta: '30 min' },
  { minutos: 60, etiqueta: '1 hora' },
  { minutos: 120, etiqueta: '2 horas' },
  { minutos: 180, etiqueta: '3 horas' },
];

interface Props {
  estaAbierto: boolean;
  alCerrar: () => void;
  clienteId: string;
  nombreCliente: string;
}

export function EsperaClienteModal({ estaAbierto, alCerrar, clienteId, nombreCliente }: Props) {
  const [minutosElegidos, setMinutosElegidos] = useState<number>(30);
  const [minutosPersonalizados, setMinutosPersonalizados] = useState('');
  const [motivo, setMotivo] = useState<MotivoEspera>('AUSENTE');

  if (!estaAbierto) return null;

  const usaPersonalizado = minutosPersonalizados.trim() !== '';
  const minutosFinales = usaPersonalizado ? parseInt(minutosPersonalizados, 10) : minutosElegidos;
  const minutosValidos = Number.isFinite(minutosFinales) && minutosFinales >= 1 && minutosFinales <= 720;

  function confirmar() {
    if (!minutosValidos) {
      toast.error('Escribe un tiempo entre 1 y 720 minutos');
      return;
    }
    ponerClienteEnEspera({ clienteId, nombreCliente, minutos: minutosFinales, motivo });
    toast.success(`Volver donde ${nombreCliente} a las ${formatearHoraRegreso(Date.now() + minutosFinales * 60_000)}`);
    alCerrar();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={alCerrar} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Poner en espera
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">{nombreCliente}</p>
          </div>
          <button type="button" onClick={alCerrar} className="p-2 -mr-2 -mt-2 text-slate-400" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[11px] uppercase font-bold text-slate-500 mb-2">¿Qué pasó?</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(Object.keys(ETIQUETA_MOTIVO) as MotivoEspera[]).map(clave => (
            <button
              key={clave}
              type="button"
              onClick={() => setMotivo(clave)}
              className={cn(
                'py-2.5 rounded-xl border text-sm font-semibold transition-colors',
                motivo === clave
                  ? 'bg-amber-100 border-amber-400 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              )}
            >
              {ETIQUETA_MOTIVO[clave]}
            </button>
          ))}
        </div>

        <p className="text-[11px] uppercase font-bold text-slate-500 mb-2">Recordarme volver en</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {OPCIONES_TIEMPO.map(opcion => (
            <button
              key={opcion.minutos}
              type="button"
              onClick={() => { setMinutosElegidos(opcion.minutos); setMinutosPersonalizados(''); }}
              className={cn(
                'py-2.5 rounded-xl border text-sm font-bold transition-colors',
                !usaPersonalizado && minutosElegidos === opcion.minutos
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              )}
            >
              {opcion.etiqueta}
            </button>
          ))}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            value={minutosPersonalizados}
            onChange={e => setMinutosPersonalizados(e.target.value.replace(/\D/g, ''))}
            placeholder="Otro (min)"
            className={cn(
              'py-2.5 px-2 rounded-xl border text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-brand-500',
              usaPersonalizado ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-700'
            )}
          />
        </div>

        {minutosValidos && (
          <p className="text-xs text-slate-500 mb-4">
            Te avisaremos a las{' '}
            <span className="font-bold text-slate-700">{formatearHoraRegreso(Date.now() + minutosFinales * 60_000)}</span>.
          </p>
        )}

        <button
          type="button"
          onClick={confirmar}
          className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] transition-all text-white font-bold shadow-md shadow-amber-500/30"
        >
          Poner en espera
        </button>
      </div>
    </div>
  );
}
