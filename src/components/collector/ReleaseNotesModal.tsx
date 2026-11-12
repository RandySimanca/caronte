import { Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { WEEKDAYS, WEEKDAY_STYLES } from '@/lib/collectionSchedule';
import type { ReleaseNotes } from '@/lib/releaseNotes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  notes: ReleaseNotes;
  /** Muestra la leyenda de colores por día (solo tiene sentido en el aviso de frecuencia de cobro). */
  showWeekdayLegend?: boolean;
}

export function ReleaseNotesModal({ isOpen, onClose, notes, showWeekdayLegend = false }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          {/* El fondo NO cierra el aviso: se cierra con "Entendido" o con la X, para que se lea */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-notes-title"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
          >
            <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-5 pt-5 pb-5 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 rounded-xl p-2">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <h2 id="release-notes-title" className="text-white font-black text-lg leading-tight">{notes.title}</h2>
                </div>
                <button onClick={onClose} aria-label="Cerrar" className="p-1.5 -mr-1.5 text-white/80 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-blue-50 text-sm mt-3">{notes.intro}</p>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3">
              {notes.items.map((item, i) => (
                <div key={i} className="flex gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.title}</p>
                    <p className="text-sm text-slate-600 leading-snug">{item.text}</p>
                  </div>
                </div>
              ))}

              {showWeekdayLegend && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Color de cada día</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.filter(d => d.value !== 0).map(d => (
                      <span
                        key={d.value}
                        className={cn('inline-flex items-center rounded border px-2 py-1 text-[11px] font-bold', WEEKDAY_STYLES[d.value].chip)}
                      >
                        {d.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-2 shrink-0">
              <button
                onClick={onClose}
                className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-all text-white font-bold py-3.5 rounded-xl shadow-md shadow-brand-500/30"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
