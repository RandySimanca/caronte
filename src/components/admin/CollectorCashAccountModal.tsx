import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Wallet, AlertTriangle, HandCoins, Search, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdminService } from '@/services/AdminService';
import { CashLedgerService } from '@/services/CashLedgerService';
import { useAuthStore } from '@/stores/authStore';
import { colombiaToday } from '@/lib/dailyCollection';
import { confirmAction, confirmDanger } from '@/lib/swal';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import {
  KIND_LABELS,
  MANUAL_KINDS,
  DEFAULT_LATE_CLARIFICATION_DAYS,
  computeBalances,
  daysBetween,
  isLateClarification,
  pendingSobrantes,
  type LedgerEntry,
} from '@/lib/cashLedger';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  collectorId: string | null;
  collectorName: string;
  /** Se llama cada vez que cambia la cuenta, para que la pantalla de afuera se refresque. */
  onChanged?: () => void;
}

type FormState =
  | { type: 'repay' }
  | { type: 'condone' }
  | { type: 'clarify'; sobranteId: string }
  | { type: 'return'; sobranteId: string }
  | { type: 'compensate'; sobranteId: string }
  | { type: 'void'; entryId: string }
  | null;

const inputCls =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-brand-500 outline-none';

function kindTone(kind: LedgerEntry['kind']): string {
  if (kind === 'FALTANTE') return 'text-rose-600';
  if (kind === 'SOBRANTE') return 'text-amber-600';
  return 'text-emerald-600';
}

export function CollectorCashAccountModal({ isOpen, onClose, collectorId, collectorName, onChanged }: Props) {
  const adminId = useAuthStore(state => state.user?.id);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [lateDays, setLateDays] = useState(DEFAULT_LATE_CLARIFICATION_DAYS);
  const [form, setForm] = useState<FormState>(null);

  // Campos del formulario abierto
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO');
  const [payDate, setPayDate] = useState('');
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [selectedLoanId, setSelectedLoanId] = useState('');

  // El padre suele pasar `onClose` como función nueva en cada render: se guarda en un ref para que
  // recargar la cuenta (o cerrar el formulario abierto) no dependa de eso.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const today = colombiaToday();
  const balances = useMemo(() => computeBalances(entries), [entries]);
  const pending = useMemo(() => pendingSobrantes(entries), [entries]);
  const amount = Number(parseNumberInput(amountStr)) || 0;

  const load = useCallback(async () => {
    if (!collectorId) return;
    setIsLoading(true);
    try {
      const [list, days] = await Promise.all([
        CashLedgerService.getEntries(collectorId),
        CashLedgerService.getLateClarificationDays(),
      ]);
      setEntries(list);
      setLateDays(days);
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar la cuenta de efectivo');
      onCloseRef.current();
    } finally {
      setIsLoading(false);
    }
  }, [collectorId]);

  useEffect(() => {
    if (isOpen && collectorId) {
      setForm(null);
      load();
    }
  }, [isOpen, collectorId, load]);

  const resetFields = () => {
    setAmountStr('');
    setNote('');
    setMethod('EFECTIVO');
    setPayDate('');
    setSearch('');
    setClients([]);
    setSelectedClient(null);
    setSelectedLoanId('');
  };

  const openForm = (next: FormState, defaultAmount = 0) => {
    resetFields();
    if (defaultAmount > 0) setAmountStr(formatNumberInput(String(defaultAmount)));
    setForm(next);
  };

  const openClarify = async (sobrante: LedgerEntry, pendingAmount: number) => {
    openForm({ type: 'clarify', sobranteId: sobrante.id }, pendingAmount);
    setPayDate(sobrante.movement_date.slice(0, 10));
    setClientsLoading(true);
    try {
      const data = await AdminService.getClients({ routeId: sobrante.route_id || 'all', onlyActiveLoan: true });
      setClients(data as any[]);
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar clientes');
    } finally {
      setClientsLoading(false);
    }
  };

  const sobranteOf = (id: string) => entries.find(e => e.id === id) || null;
  const pendingOf = (id: string) => pending.find(p => p.entry.id === id)?.pending ?? 0;

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return clients
      .filter(c =>
        c.full_name?.toLowerCase().includes(term) ||
        c.document_id?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term))
      .slice(0, 6);
  }, [clients, search]);

  const clarifySobrante = form?.type === 'clarify' ? sobranteOf(form.sobranteId) : null;
  const clarifyLoans = useMemo(() => {
    if (!selectedClient || !clarifySobrante) return [];
    return (selectedClient.loans || []).filter(
      (l: any) => l.status === 'ACTIVO' && (!clarifySobrante.route_id || l.route_id === clarifySobrante.route_id),
    );
  }, [selectedClient, clarifySobrante]);
  const selectedLoan = clarifyLoans.find((l: any) => l.id === selectedLoanId) || null;

  const clarifyIsLate = clarifySobrante ? isLateClarification(clarifySobrante.movement_date.slice(0, 10), today, lateDays) : false;

  const submit = async () => {
    if (!form || !collectorId || !adminId) return;
    setIsBusy(true);
    try {
      if (form.type === 'repay') {
        const ok = await confirmAction({
          title: '¿Registrar la reposición?',
          html: `<strong>${collectorName}</strong> repone <strong>${formatCurrency(amount)}</strong> (${method === 'EFECTIVO' ? 'efectivo' : 'transferencia'}).`,
          confirmText: 'Sí, registrar',
        });
        if (!ok) return;
        await CashLedgerService.registerRepayment({ collectorId, amount, method, note, adminId });
        toast.success('Reposición registrada');
      } else if (form.type === 'condone') {
        const ok = await confirmDanger({
          title: '¿Condonar este faltante?',
          html: `Se perdonan <strong>${formatCurrency(amount)}</strong> a <strong>${collectorName}</strong>. Es una pérdida para la empresa y queda registrada.`,
          confirmText: 'Sí, condonar',
        });
        if (!ok) return;
        await CashLedgerService.condoneDebt({ collectorId, amount, note, adminId });
        toast.success('Faltante condonado');
      } else if (form.type === 'return') {
        const ok = await confirmAction({
          title: '¿Devolver el sobrante al cobrador?',
          html: `Se le devuelven <strong>${formatCurrency(amount)}</strong> a <strong>${collectorName}</strong>.`,
          confirmText: 'Sí, devolver',
        });
        if (!ok) return;
        await CashLedgerService.returnSobrante({ sobranteId: form.sobranteId, amount, note, adminId });
        toast.success('Sobrante devuelto');
      } else if (form.type === 'compensate') {
        const ok = await confirmAction({
          title: '¿Compensar con el faltante?',
          html: `El sobrante cubre <strong>${formatCurrency(amount)}</strong> del faltante de <strong>${collectorName}</strong>.`,
          confirmText: 'Sí, compensar',
        });
        if (!ok) return;
        await CashLedgerService.compensate({ sobranteId: form.sobranteId, amount, note, adminId });
        toast.success('Compensación registrada');
      } else if (form.type === 'clarify') {
        if (!selectedLoan) throw new Error('Elige el cliente y el préstamo que pagó.');
        const ok = await confirmAction({
          title: '¿Aclarar el sobrante con este cobro?',
          html: `Se registra un cobro de <strong>${formatCurrency(amount)}</strong> de <strong>${selectedClient?.full_name}</strong> con fecha <strong>${payDate}</strong>.<br/>
                 <span style="color:#64748b;font-size:0.85em">El cierre ya aprobado no cambia y este cobro no suma a la entrega del cobrador.</span>`,
          confirmText: 'Sí, aclarar',
        });
        if (!ok) return;
        await CashLedgerService.clarifySobrante({
          sobranteId: form.sobranteId, loanId: selectedLoan.id, amount, paymentDate: payDate, note, adminId,
        });
        toast.success('Sobrante aclarado con el cobro del cliente');
      } else if (form.type === 'void') {
        const entry = entries.find(e => e.id === form.entryId);
        const ok = await confirmDanger({
          title: '¿Anular este movimiento?',
          html: entry?.kind === 'APLICACION_SOBRANTE'
            ? 'También se borra el cobro tardío del cliente y el sobrante vuelve a quedar pendiente.'
            : 'El saldo del cobrador se recalcula sin este movimiento.',
          confirmText: 'Sí, anular',
        });
        if (!ok) return;
        await CashLedgerService.voidMovement({ entryId: form.entryId, reason: note, adminId });
        toast.success('Movimiento anulado');
      }
      setForm(null);
      resetFields();
      await load();
      onChanged?.();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo completar la operación');
    } finally {
      setIsBusy(false);
    }
  };

  if (!isOpen || !collectorId) return null;

  const noteRequired =
    form?.type === 'condone' || form?.type === 'compensate' || form?.type === 'return' || form?.type === 'void' ||
    (form?.type === 'clarify' && clarifyIsLate);

  const formTitle: Record<string, string> = {
    repay: 'Registrar reposición del cobrador',
    condone: 'Condonar faltante',
    clarify: 'Aclarar sobrante con cobro de un cliente',
    return: 'Devolver sobrante al cobrador',
    compensate: 'Compensar sobrante con faltante',
    void: 'Anular movimiento',
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl sm:rounded-3xl shadow-xl w-full max-w-2xl max-h-[min(92dvh,920px)] flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-800 truncate">Cuenta de efectivo</h3>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 truncate">{collectorName}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Saldos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-2xl p-4 border ${balances.debt > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-xs font-bold text-slate-500">Faltante por reponer</p>
                  <p className={`text-2xl font-black ${balances.debt > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{formatCurrency(balances.debt)}</p>
                  {balances.debt > 0 && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => openForm({ type: 'repay' }, balances.debt)} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg">
                        Registrar reposición
                      </button>
                      <button onClick={() => openForm({ type: 'condone' })} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-100">
                        Condonar
                      </button>
                    </div>
                  )}
                </div>
                <div className={`rounded-2xl p-4 border ${balances.surplus > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-xs font-bold text-slate-500">Sobrante por aclarar</p>
                  <p className={`text-2xl font-black ${balances.surplus > 0 ? 'text-amber-600' : 'text-slate-700'}`}>{formatCurrency(balances.surplus)}</p>
                  <p className="text-xs text-slate-500 mt-1">Puede ser un cobro que el cobrador recibió y no digitó.</p>
                </div>
              </div>

              {/* Sobrantes pendientes */}
              {pending.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-black text-slate-700">Sobrantes pendientes</h4>
                  {pending.map(({ entry, pending: left }) => {
                    const age = daysBetween(entry.movement_date.slice(0, 10), today);
                    const late = age > lateDays;
                    return (
                      <div key={entry.id} className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-black text-slate-800">{formatCurrency(left)} <span className="text-xs font-semibold text-slate-500">de {formatCurrency(entry.amount)}</span></p>
                            <p className="text-xs text-slate-500">
                              Cierre del {entry.movement_date.slice(0, 10)} · hace {age} {age === 1 ? 'día' : 'días'}
                              {late && <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">Fuera de plazo ({lateDays} d)</span>}
                            </p>
                            {entry.note && <p className="text-xs text-slate-500 mt-0.5 break-words">“{entry.note}”</p>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openClarify(entry, left)} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg">
                            Aclarar con cobro de cliente
                          </button>
                          <button onClick={() => openForm({ type: 'return', sobranteId: entry.id }, left)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100">
                            Devolver al cobrador
                          </button>
                          {balances.debt > 0 && (
                            <button onClick={() => openForm({ type: 'compensate', sobranteId: entry.id }, Math.min(left, balances.debt))} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100">
                              Compensar con faltante
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Formulario */}
              {form && (
                <div className="border-2 border-brand-200 bg-brand-50/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-800 flex items-center gap-2"><HandCoins className="w-4 h-4 text-brand-600" />{formTitle[form.type]}</h4>
                    <button onClick={() => { setForm(null); resetFields(); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
                  </div>

                  {form.type === 'clarify' && (
                    <>
                      {clarifyIsLate && clarifySobrante && (
                        <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-lg p-2.5">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>Pasaron más de {lateDays} días desde el sobrante. Quedará marcado como tardío y la nota es obligatoria.</span>
                        </div>
                      )}
                      {!selectedClient ? (
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-600">Cliente que pagó</label>
                          <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={clientsLoading ? 'Cargando clientes…' : 'Nombre, documento o teléfono'} className={`${inputCls} pl-9`} />
                          </div>
                          {filteredClients.map(c => (
                            <button key={c.id} onClick={() => { setSelectedClient(c); setSearch(''); }} className="w-full text-left px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-brand-50 text-sm">
                              <span className="font-bold text-slate-800">{c.full_name}</span>
                              <span className="text-slate-500"> · {c.document_id || 'sin documento'}</span>
                            </button>
                          ))}
                          {search.trim() && !clientsLoading && filteredClients.length === 0 && (
                            <p className="text-xs text-slate-500">Sin resultados con préstamo activo en esa ruta.</p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <span className="text-sm font-bold text-slate-800">{selectedClient.full_name}</span>
                            <button onClick={() => { setSelectedClient(null); setSelectedLoanId(''); }} className="text-xs font-bold text-brand-600">Cambiar</button>
                          </div>
                          {clarifyLoans.length === 0 ? (
                            <p className="text-xs text-rose-600">Este cliente no tiene un préstamo activo en la ruta del sobrante.</p>
                          ) : (
                            <select value={selectedLoanId} onChange={e => {
                              setSelectedLoanId(e.target.value);
                              const loan = clarifyLoans.find((l: any) => l.id === e.target.value);
                              if (loan && form.type === 'clarify') {
                                const left = pendingOf(form.sobranteId);
                                setAmountStr(formatNumberInput(String(Math.min(left, Math.round(Number(loan.current_balance || 0))))));
                              }
                            }} className={inputCls}>
                              <option value="">Elige el préstamo…</option>
                              {clarifyLoans.map((l: any) => (
                                <option key={l.id} value={l.id}>
                                  Desembolso {String(l.disbursement_date).slice(0, 10)} · saldo {formatCurrency(Number(l.current_balance || 0))}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                      <div>
                        <label className="text-xs font-bold text-slate-600">Fecha en que el cliente pagó</label>
                        <input type="date" value={payDate} max={clarifySobrante?.movement_date.slice(0, 10)} onChange={e => setPayDate(e.target.value)} className={inputCls} />
                      </div>
                    </>
                  )}

                  {form.type !== 'void' && (
                    <div>
                      <label className="text-xs font-bold text-slate-600">Monto</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                        <input value={amountStr} inputMode="numeric" onChange={e => setAmountStr(formatNumberInput(e.target.value))} className={`${inputCls} pl-7 text-right font-bold`} placeholder="0" />
                      </div>
                    </div>
                  )}

                  {form.type === 'repay' && (
                    <div>
                      <label className="text-xs font-bold text-slate-600">Cómo repuso</label>
                      <select value={method} onChange={e => setMethod(e.target.value as 'EFECTIVO' | 'TRANSFERENCIA')} className={inputCls}>
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-slate-600">
                      {form.type === 'void' ? 'Motivo de la anulación (obligatorio)' : noteRequired ? 'Nota (obligatoria)' : 'Nota (opcional)'}
                    </label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls} />
                  </div>

                  <button
                    onClick={submit}
                    disabled={isBusy || (form.type !== 'void' && amount <= 0) || (form.type === 'clarify' && (!selectedLoan || !payDate))}
                    className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm"
                  >
                    {isBusy ? 'Guardando…' : 'Confirmar'}
                  </button>
                </div>
              )}

              {/* Historial */}
              <div className="space-y-2">
                <h4 className="text-sm font-black text-slate-700">Movimientos</h4>
                {entries.length === 0 ? (
                  <p className="text-sm text-slate-500">Este cobrador aún no tiene movimientos.</p>
                ) : (
                  <ul className="border border-slate-100 rounded-xl divide-y divide-slate-100">
                    {entries.map(e => (
                      <li key={e.id} className={`p-3 flex items-start justify-between gap-3 ${e.voided_at ? 'opacity-50' : ''}`}>
                        <div className="min-w-0 text-sm">
                          <p className="font-bold text-slate-800">
                            {KIND_LABELS[e.kind]}
                            {e.is_late && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">TARDÍO</span>}
                            {e.voided_at && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">ANULADO</span>}
                          </p>
                          <p className="text-xs text-slate-500">
                            {e.movement_date.slice(0, 10)}
                            {e.method && ` · ${e.method === 'EFECTIVO' ? 'efectivo' : 'transferencia'}`}
                            {e.client_name && ` · ${e.client_name}`}
                            {e.creator_name && ` · ${e.creator_name}`}
                          </p>
                          {e.note && <p className="text-xs text-slate-500 break-words">“{e.note}”</p>}
                          {e.voided_at && e.void_reason && <p className="text-xs text-slate-500 break-words">Anulado: {e.void_reason}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-black ${kindTone(e.kind)}`}>{formatCurrency(e.amount)}</p>
                          {!e.voided_at && MANUAL_KINDS.includes(e.kind) && (
                            <button onClick={() => openForm({ type: 'void', entryId: e.id })} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-600">
                              <Ban className="w-3 h-3" /> Anular
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
