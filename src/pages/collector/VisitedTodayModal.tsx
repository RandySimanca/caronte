import { X, Users, User } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { formatCurrency } from '@/lib/utils';

/** Cliente que el cobrador visitó hoy (le cobró algo hoy o terminó su préstamo hoy). */
export interface VisitedClientEntry {
    clientId: string;
    clientName: string;
    /** Total cobrado hoy a este cliente */
    amount: number;
    /** ISO del último cobro de hoy ('' si no se conoce la hora) */
    lastAt: string;
    /** Terminó hoy su préstamo pagando todo */
    paidAll?: boolean;
    /** Terminó hoy su préstamo refinanciando */
    refinanced?: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    clients: VisitedClientEntry[];
}

const timeLabel = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
};

export function VisitedTodayModal({ isOpen, onClose, clients }: Props) {
    if (!isOpen) return null;

    const total = clients.reduce((s, c) => s + c.amount, 0);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden z-10"
                >
                    <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-5 pt-5 pb-6">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white leading-tight">Clientes visitados</h2>
                                    <p className="text-brand-100 text-xs">Los que visitaste hoy (sin pagos adelantados)</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                                aria-label="Cerrar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <div className="bg-white/15 rounded-xl px-3 py-1.5 flex-1">
                                <p className="text-brand-100 text-[10px] uppercase font-bold tracking-wider">Visitados</p>
                                <p className="text-white text-xl font-black">{clients.length}</p>
                            </div>
                            <div className="bg-white/15 rounded-xl px-3 py-1.5 flex-1">
                                <p className="text-brand-100 text-[10px] uppercase font-bold tracking-wider">Cobrado</p>
                                <p className="text-white text-xl font-black">{formatCurrency(total)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                        {clients.length === 0 ? (
                            <div className="py-10 text-center text-slate-400">
                                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-medium">Aún no has visitado a nadie hoy</p>
                            </div>
                        ) : (
                            clients.map((c) => (
                                <NavLink
                                    key={c.clientId}
                                    to={`/client/${c.clientId}`}
                                    onClick={onClose}
                                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-slate-50"
                                >
                                    <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                                        <User className="w-4 h-4 text-brand-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 text-sm truncate">{c.clientName}</p>
                                        <p className="text-xs text-slate-400">
                                            {timeLabel(c.lastAt) || 'Hoy'}
                                            {c.paidAll ? ' · Pagó todo' : c.refinanced ? ' · Refinanció' : ''}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-black text-brand-600">
                                        {c.amount > 0 ? formatCurrency(c.amount) : '—'}
                                    </p>
                                </NavLink>
                            ))
                        )}
                    </div>

                    <div className="px-5 py-4 border-t border-slate-100">
                        <button
                            onClick={onClose}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl py-3 transition-colors text-sm"
                        >
                            Cerrar
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}