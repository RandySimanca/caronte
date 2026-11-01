import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { KIND_LABELS, isOutflow, type CapitalKind } from '@/lib/capitalMovements';

export interface CapitalLine {
  kind: CapitalKind;
  amount: number;
  movement_date: string;
  beneficiary_name?: string | null;
}

interface Props {
  /** Último cierre aprobado de la ruta (null si aún no tiene). */
  prev: { date: string; amount: number } | null;
  lines: CapitalLine[];
  /** Cuánto se pasaron los retiros de lo disponible (la base queda en 0). */
  shortfall?: number;
  title?: string;
}

/** Muestra de dónde sale la base: lo entregado en el último cierre más los aportes y menos los retiros. */
export function CapitalBreakdown({ prev, lines, shortfall = 0, title = 'Cómo se armó la base' }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1.5">
      <p className="font-bold text-slate-600">{title}</p>

      {prev && (
        <div className="flex justify-between gap-3 text-slate-600">
          <span>Entregado en el cierre del {prev.date}</span>
          <span className="font-bold text-slate-800 shrink-0">{formatCurrency(prev.amount)}</span>
        </div>
      )}

      {lines.map((line, i) => {
        const out = isOutflow(line.kind);
        return (
          <div key={`${line.kind}-${line.movement_date}-${i}`} className="flex justify-between gap-3 text-slate-600">
            <span className="min-w-0 break-words">
              {KIND_LABELS[line.kind]}
              {line.beneficiary_name ? ` · ${line.beneficiary_name}` : ''}
              <span className="text-slate-400"> · {line.movement_date}</span>
            </span>
            <span className={`font-bold shrink-0 ${out ? 'text-rose-600' : 'text-emerald-600'}`}>
              {out ? '−' : '+'} {formatCurrency(line.amount)}
            </span>
          </div>
        );
      })}

      {shortfall > 0 && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-800 font-medium rounded-lg p-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Los retiros superan el dinero disponible en la ruta por {formatCurrency(shortfall)}. La base queda en $0.
          </span>
        </div>
      )}
    </div>
  );
}
