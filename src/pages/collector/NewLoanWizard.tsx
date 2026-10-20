import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Camera, Image, CheckCircle2, X, UserCheck, AlertCircle, Search } from 'lucide-react';
import type { LocalClient } from '@/db/schema';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatCurrency, cn, formatNumberInput, parseNumberInput } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, isSunday } from 'date-fns';
import toast from 'react-hot-toast';
import { useSyncStore } from '@/stores/syncStore';
import { useAuthStore } from '@/stores/authStore';
import { loanFinancials } from '@/lib/money';
import { SyncService } from '@/services/SyncService';
import { getLastCollectedToday, insertAfterLastCollected, markLastCollected } from '@/lib/routeOrder';
import { confirmAction } from '@/lib/swal';
import { supabase } from '@/lib/supabase';

export function NewLoanWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const { isOnline } = useSyncStore();

  // Step 1: Client Data
  const [clientName, setClientName] = useState(() => localStorage.getItem('nlw_clientName') || '');
  const [document, setDocument] = useState(() => localStorage.getItem('nlw_document') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('nlw_phone') || '');
  const [address, setAddress] = useState(() => localStorage.getItem('nlw_address') || '');
  // No guardamos la foto en localStorage porque el Base64 puede superar los 5MB de cuota
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Cliente existente encontrado por cédula en Dexie
  const [existingClient, setExistingClient] = useState<LocalClient | null>(null);
  // true si el cliente encontrado ya tiene un préstamo ACTIVO (bloquea avance)
  const [existingClientHasActiveLoan, setExistingClientHasActiveLoan] = useState(false);

  // Aplica un cliente existente al formulario (pre-llena datos y revisa si tiene préstamo activo)
  const applyExistingClient = useCallback(async (found: LocalClient, hasActiveLoan: boolean) => {
    setExistingClient(found);
    setExistingClientHasActiveLoan(hasActiveLoan);
    setDocument(found.document_id);
    setClientName(found.full_name);
    setPhone(found.phone || '');
    setAddress(found.address || '');
  }, []);

  // Buscar cliente por cédula: primero en el celular (Dexie) y, si no está y hay internet,
  // en el servidor (clientes inactivados que el celular ya borró). Así nunca se duplica la cédula.
  const lookupClientByDocument = useCallback(async (docValue: string) => {
    const trimmed = docValue.trim();
    if (!trimmed) {
      setExistingClient(null);
      setExistingClientHasActiveLoan(false);
      return;
    }
    const found = await db.clients
      .where('document_id')
      .equals(trimmed)
      .first();
    if (found) {
      const activeLoan = await db.loans
        .where('client_id')
        .equals(found.id)
        .filter(l => l.status === 'ACTIVO')
        .first();
      await applyExistingClient(found, !!activeLoan);
      return;
    }

    if (navigator.onLine) {
      try {
        const { data: remote } = await supabase
          .from('clients')
          .select('*')
          .eq('document_id', trimmed)
          .maybeSingle();
        if (remote) {
          if ((remote as any).status === 'BLOQUEADO') {
            toast.error('Este cliente está bloqueado. Consulta con el administrador.');
            setExistingClient(null);
            setExistingClientHasActiveLoan(false);
            return;
          }
          const { data: remoteActive } = await supabase
            .from('loans')
            .select('id')
            .eq('client_id', (remote as any).id)
            .eq('status', 'ACTIVO')
            .limit(1);
          await applyExistingClient(
            { ...(remote as any), sync_status: 'synced' } as LocalClient,
            !!(remoteActive && remoteActive.length > 0),
          );
          return;
        }
      } catch (e) {
        console.warn('[NewLoanWizard] Búsqueda de cliente en servidor falló:', e);
      }
    }

    setExistingClient(null);
    setExistingClientHasActiveLoan(false);
  }, [applyExistingClient]);

  // --- Selector de clientes anteriores (terminaron su préstamo y ya no salen en la ruta) ---
  const [searchParams] = useSearchParams();
  const [pastQuery, setPastQuery] = useState('');
  const [pastClients, setPastClients] = useState<LocalClient[]>([]);

  useEffect(() => {
    const q = pastQuery.trim().toLowerCase();
    if (q.length < 2) {
      setPastClients([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [allClients, activeLoans] = await Promise.all([
        db.clients.toArray(),
        db.loans.where('status').equals('ACTIVO').toArray(),
      ]);
      const withActive = new Set(activeLoans.map(l => l.client_id));
      const matches = allClients
        .filter(c => !withActive.has(c.id))
        .filter(c => c.full_name.toLowerCase().includes(q) || (c.document_id || '').includes(q))
        .slice(0, 8);
      if (!cancelled) setPastClients(matches);
    })();
    return () => { cancelled = true; };
  }, [pastQuery]);

  const selectPastClient = async (c: LocalClient) => {
    setPastQuery('');
    setPastClients([]);
    await lookupClientByDocument(c.document_id);
  };

  // Entrada directa: /loan/new?client=<id> (por ejemplo desde el detalle del cliente)
  useEffect(() => {
    const clientParam = searchParams.get('client');
    if (!clientParam) return;
    (async () => {
      const c = await db.clients.get(clientParam);
      if (c) await lookupClientByDocument(c.document_id);
    })();
  }, [searchParams, lookupClientByDocument]);

  const handleDocumentChange = (value: string) => {
    setDocument(value);
    // Si cambia la cédula del cliente ya seleccionado, se suelta ese cliente para no mezclar datos
    if (existingClient && value.trim() !== existingClient.document_id) {
      setExistingClient(null);
      setExistingClientHasActiveLoan(false);
      setClientName('');
      setPhone('');
      setAddress('');
    }
    if (!value.trim()) {
      setExistingClient(null);
      setExistingClientHasActiveLoan(false);
    }
  };

  const handleDocumentBlur = () => {
    lookupClientByDocument(document);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const original = ev.target?.result as string;
      // Reducir la foto (máx. 1024 px, JPEG 0.7): pasa de varios MB a ~100-200 KB,
      // así se guarda más liviana en el celular y sube rápido con datos móviles.
      const img = new window.Image();
      img.onload = () => {
        try {
          const MAX = 1024;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.7));
        } catch {
          setPhotoDataUrl(original);
        }
      };
      img.onerror = () => setPhotoDataUrl(original);
      img.src = original;
    };
    reader.readAsDataURL(file);
  };

  // Step 2: Loan Data
  const [amount, setAmount] = useState(() => localStorage.getItem('nlw_amount') || '');
  const [term, setTerm] = useState<number>(() => Number(localStorage.getItem('nlw_term')) || 40);
  const [interestRate, setInterestRate] = useState<0.20 | 0.30>(() => (Number(localStorage.getItem('nlw_interestRate')) as any) || 0.20);
  const [sundays, setSundays] = useState(() => Number(localStorage.getItem('nlw_sundays')) || 0);
  const [receiptFee, setReceiptFee] = useState(() => Number(localStorage.getItem('nlw_receiptFee')) || 0);
  const [wantsRaffle, setWantsRaffle] = useState(() => localStorage.getItem('nlw_wantsRaffle') === 'true');
  const [confirmed, setConfirmed] = useState(false);

  // Auto-save draft
  useEffect(() => {
    localStorage.setItem('nlw_clientName', clientName);
    localStorage.setItem('nlw_document', document);
    localStorage.setItem('nlw_phone', phone);
    localStorage.setItem('nlw_address', address);
    localStorage.setItem('nlw_amount', amount);
    localStorage.setItem('nlw_term', term.toString());
    localStorage.setItem('nlw_interestRate', interestRate.toString());
    localStorage.setItem('nlw_sundays', sundays.toString());
    localStorage.setItem('nlw_receiptFee', receiptFee.toString());
    localStorage.setItem('nlw_wantsRaffle', wantsRaffle.toString());
  }, [clientName, document, phone, address, amount, term, interestRate, sundays, receiptFee, wantsRaffle]);

  // Calculations (Rule 1: exact, no rounding)
  const numAmount = parseFloat(amount) || 0;
  const obligation = numAmount * (1 + interestRate);
  const dailyQuota = term > 0 ? obligation / term : 0;
  const totalSundaysDiscount = dailyQuota * sundays;
  const delivered = numAmount - totalSundaysDiscount - receiptFee;

  const handleNext = () => { if (step < 3) setStep(step + 1); };
  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else navigate(-1);
  };

  const handleCreate = async () => {
    if (!confirmed || numAmount <= 0) return;

    const swalConfirmed = await confirmAction({
      title: '¿Crear este préstamo?',
      html: `Cliente: <strong>${clientName}</strong><br/>Monto: <strong>${formatCurrency(numAmount)}</strong>`,
      confirmText: 'Sí, crear préstamo',
    });
    if (!swalConfirmed) return;

    setIsSaving(true);

    try {
      // Si el cliente ya existe en Dexie, reutilizar su ID para no crear un duplicado
      // y no romper el historial de préstamos anteriores.
      const clientId = existingClient ? existingClient.id : uuidv4();
      const loanId = uuidv4();
      const operationId = uuidv4();
      const today = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      const endDate = format(addDays(new Date(), term), 'yyyy-MM-dd');
      const graceEndDate = format(addDays(new Date(), term + 7), 'yyyy-MM-dd');
      const userId = useAuthStore.getState().user?.id;
      const currentUserId = userId || 'local-user';
      const routes = await db.routes.toArray();
      const routeId = routes[0]?.id ?? null;
      if (!routeId) {
        toast.error('No hay ruta en este celular. Conéctate una vez para descargar tu ruta y luego puedes crear préstamos offline.');
        return;
      }

      const money = loanFinancials(numAmount, interestRate, term, sundays, receiptFee);

      // Generate installment calendar locally
      // Cuota 0 = mañana (i+1 días desde hoy), para que el primer cobro sea el día siguiente al desembolso
      const installments: any[] = [];
      let sundaysUsed = 0;
      for (let i = 0; i < term; i++) {
        const date = addDays(new Date(), i + 1);   // i=0 → mañana, i=1 → pasado, …
        const dateStr = format(date, 'yyyy-MM-dd');
        const isSun = isSunday(date);
        const isPrepaid = isSun && sundaysUsed < sundays;
        if (isPrepaid) sundaysUsed++;

        installments.push({
          id: uuidv4(),
          loan_id: loanId,
          installment_number: i + 1,
          scheduled_date: dateStr,
          scheduled_amount: money.daily_installment,
          paid_amount: isPrepaid ? money.daily_installment : 0,
          balance: isPrepaid ? 0 : money.daily_installment,
          status: isPrepaid ? 'PAGADA_ANTICIPADAMENTE' : 'PENDIENTE',
          day_type: isSun ? 'DOMINGO' : 'NORMAL',
          is_prepaid: isPrepaid,
          is_sunday: isSun,
          is_holiday: false,
          paid_date: isPrepaid ? today : null,
        });
      }

      await db.transaction('rw', db.clients, db.loans, db.installments, db.syncQueue, db.settings, async () => {
        // Posición en la ruta: justo después del último cliente cobrado hoy
        const routeClients = (await db.clients.toArray()).filter(c => c.route_id === routeId);
        const lastCollectedId = await getLastCollectedToday(today);
        const { newClientOrder, updates: orderUpdates } = insertAfterLastCollected(routeClients, lastCollectedId);

        // -----------------------------------------------------------------------
        // Cliente: reutilizar el existente o crear uno nuevo
        // Si el cliente ya existe en Dexie (terminó de pagar un préstamo anterior),
        // NO se toca su registro — solo se reactiva su status y se le asigna el
        // nuevo position en la ruta. Así se preserva todo el historial contable.
        // -----------------------------------------------------------------------
        const clientData = existingClient
          ? {
              ...existingClient,
              // Reactivar y reposicionar en la ruta
              status: 'ACTIVO' as const,
              route_order: newClientOrder,
              updated_at: new Date().toISOString(),
              sync_status: 'synced' as const, // ya existe en el servidor
            }
          : {
              id: clientId,
              full_name: clientName,
              document_id: document,
              phone: phone || null,
              address: address || null,
              neighborhood: null,
              municipality: null,
              route_id: routeId,
              photo_face_url: photoDataUrl || null,
              photo_doc_url: null,
              personal_references: null,
              status: 'ACTIVO' as const,
              route_order: newClientOrder,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              sync_status: 'pending' as const,
            };

        // Asignar número de boleta localmente (offline-first)
        let generatedRaffleNumber: string | null = null;
        if (wantsRaffle) {
          const activeLoans = await db.loans.where('status').equals('ACTIVO').toArray();
          const usedNumbers = new Set(activeLoans.map(l => l.raffle_number).filter(Boolean));
          let possibleNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          for (let i = 0; i < 100; i++) {
            if (!usedNumbers.has(possibleNum)) break;
            possibleNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          }
          generatedRaffleNumber = possibleNum;
        }

        const loanData = {
          id: loanId,
          client_id: clientId,
          route_id: routeId,
          collector_id: currentUserId,
          amount_requested: money.amount_requested,
          interest_rate: money.interest_rate,
          interest_amount: money.interest_amount,
          initial_obligation: money.initial_obligation,
          term_days: term,
          daily_installment: money.daily_installment,
          frequency: 'DIARIO',
          sundays_prepaid_count: sundays,
          sundays_prepaid_amount: money.sundays_prepaid_amount,
          receipt_fee: receiptFee,
          amount_delivered: money.amount_delivered,
          current_balance: money.current_balance,
          disbursement_date: today,
          start_date: startDate,
          end_date: endDate,
          grace_end_date: graceEndDate,
          status: 'ACTIVO',
          refinanced_from_loan_id: null,
          wants_raffle: wantsRaffle,
          raffle_number: generatedRaffleNumber,
          created_at: new Date().toISOString(),
          sync_status: 'pending' as const,
        };

        // Correr un puesto a los clientes que quedan después del nuevo (local + cola de sync)
        for (const u of orderUpdates) {
          await db.clients.update(u.id, { route_order: u.route_order });
        }
        if (orderUpdates.length > 0) {
          await db.syncQueue.add({
            operation_id: uuidv4(),
            operation_type: 'UPDATE_CLIENT_ORDERS',
            payload: { updates: orderUpdates },
            status: 'pending',
            local_timestamp: new Date().toISOString(),
            retry_count: 0,
          });
        }

        if (existingClient) {
          // Cliente existente: reactivar y reposicionar en Dexie. Si venía del servidor
          // (el celular ya lo había borrado por inactivo) se vuelve a guardar completo.
          await db.clients.put(clientData as any);
        } else {
          // Cliente nuevo: insertar por primera vez
          await db.clients.add(clientData as any);
        }

        // El cliente pasa a ser "por donde va la ruta"
        await markLastCollected(clientId, today);

        // Guardar préstamo e installments
        await db.loans.add(loanData as any);
        await db.installments.bulkAdd(installments as any);

        if (existingClient) {
          // Cliente ya existe en el servidor: solo sincronizar el préstamo nuevo.
          // Usamos NEW_LOAN_BUNDLE con los datos del cliente existente; la RPC
          // sync_new_loan_bundle hace upsert del cliente (no crea duplicado) y
          // crea el préstamo. El historial del cliente queda intacto en el servidor.
          await db.syncQueue.add({
            operation_id: operationId,
            operation_type: 'NEW_LOAN_BUNDLE',
            payload: {
              client: clientData,
              loan: loanData,
              installments: installments,
            },
            status: 'pending',
            local_timestamp: new Date().toISOString(),
            retry_count: 0,
          });
        } else {
          // Cliente nuevo: bundle completo (cliente + préstamo + cuotas)
          await db.syncQueue.add({
            operation_id: operationId,
            operation_type: 'NEW_LOAN_BUNDLE',
            payload: {
              client: clientData,
              loan: loanData,
              installments: installments,
            },
            status: 'pending',
            local_timestamp: new Date().toISOString(),
            retry_count: 0,
          });
        }
      });

      // Clear draft upon successful creation
      ['nlw_clientName', 'nlw_document', 'nlw_phone', 'nlw_address', 'nlw_amount', 'nlw_term', 'nlw_interestRate', 'nlw_sundays', 'nlw_receiptFee', 'nlw_wantsRaffle'].forEach(key => localStorage.removeItem(key));

      toast.success(`Préstamo de ${formatCurrency(numAmount)} creado para ${clientName}${isOnline ? '' : ' (se sincronizará en línea)'}`);
      if (isOnline && userId) {
        SyncService.fullSync(userId).catch((e) => console.error('Sync after new loan failed:', e));
      }
      navigate('/route');
    } catch (error: any) {
      console.error('Error creating loan:', error);
      toast.error('Error al crear el préstamo. Verifica los datos.');
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { num: 1, label: 'Cliente' },
    { num: 2, label: 'Préstamo' },
    { num: 3, label: 'Resumen' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      {/* Header */}
      <header className="bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
        <button onClick={handleBack} className="p-2 -ml-2 text-slate-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-800">Nuevo Préstamo</h1>
        <div className="w-10"></div>
      </header>

      {/* Stepper */}
      <div className="bg-white px-6 py-4 border-b border-slate-100">
        <div className="flex justify-between items-center relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-100 z-0"></div>
          {steps.map((s) => (
            <div key={s.num} className="relative z-10 flex flex-col items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                step >= s.num ? "bg-brand-600 text-white shadow-md shadow-brand-500/30" : "bg-white border-2 border-slate-200 text-slate-400"
              )}>
                {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.num}
              </div>
              <span className={cn("text-[10px] mt-1 font-semibold", step >= s.num ? "text-brand-600" : "text-slate-400")}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-x-hidden p-4">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }} className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Datos del cliente</h2>

              {/* Selector de clientes anteriores (ya no aparecen en la ruta) */}
              {!existingClient && (
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">¿Cliente anterior? Búscalo por nombre o cédula</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={pastQuery}
                      onChange={e => setPastQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                      placeholder="Buscar cliente que ya terminó de pagar"
                    />
                  </div>
                  {pastClients.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                      {pastClients.map(c => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => selectPastClient(c)}
                            className="w-full text-left px-3 py-2.5 active:bg-slate-100"
                          >
                            <p className="text-sm font-semibold text-slate-800">{c.full_name}</p>
                            <p className="text-xs text-slate-500">C.C. {c.document_id}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Banner: cliente con préstamo activo (bloquea avance) */}
              {existingClient && existingClientHasActiveLoan && (
                <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-rose-700">{existingClient.full_name}</p>
                    <p className="text-xs text-rose-600 mt-0.5">Ya tiene un préstamo activo. Debe terminarlo antes de crear uno nuevo.</p>
                  </div>
                </div>
              )}

              {/* Banner: cliente existente sin préstamo activo (reutilizar) */}
              {existingClient && !existingClientHasActiveLoan && (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                  <UserCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-700">Cliente encontrado: {existingClient.full_name}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Se reutilizará su registro. El historial anterior se conserva.</p>
                  </div>
                </div>
              )}

              <div className="space-y-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                {/* Cédula va PRIMERO para que la búsqueda ocurra antes de llenar el nombre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={document}
                    onChange={e => handleDocumentChange(e.target.value)}
                    onBlur={handleDocumentBlur}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    placeholder="1.098.765.432"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    // Si el cliente ya existe, bloquear el nombre para no crear inconsistencias
                    readOnly={!!existingClient && !existingClientHasActiveLoan}
                    className={cn(
                      "w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none",
                      existingClient && !existingClientHasActiveLoan
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-not-allowed"
                        : "bg-slate-50 border-slate-200"
                    )}
                    placeholder="Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} readOnly={!!existingClient && !existingClientHasActiveLoan} className={cn("w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none", existingClient && !existingClientHasActiveLoan ? "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-not-allowed" : "bg-slate-50 border-slate-200")} placeholder="300 987 6543" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)} readOnly={!!existingClient && !existingClientHasActiveLoan} className={cn("w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none", existingClient && !existingClientHasActiveLoan ? "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-not-allowed" : "bg-slate-50 border-slate-200")} placeholder="Calle 5 # 12-34" />
                </div>

                {/* Photo capture */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Foto del cliente</label>
                  {photoDataUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={photoDataUrl}
                        alt="Foto del cliente"
                        className="w-24 h-24 rounded-2xl object-cover border-2 border-brand-200 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoDataUrl(null)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex space-x-3">
                      {/* Camera button — opens front/back camera on mobile */}
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex-1 flex flex-col items-center justify-center py-4 bg-brand-50 border-2 border-dashed border-brand-200 rounded-xl hover:bg-brand-100 active:scale-[0.98] transition-all"
                      >
                        <Camera className="w-7 h-7 text-brand-500 mb-1" />
                        <span className="text-xs font-semibold text-brand-600">Tomar foto</span>
                      </button>
                      {/* Gallery button — opens file picker */}
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="flex-1 flex flex-col items-center justify-center py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-100 active:scale-[0.98] transition-all"
                      >
                        <Image className="w-7 h-7 text-slate-400 mb-1" />
                        <span className="text-xs font-semibold text-slate-500">Galería</span>
                      </button>
                    </div>
                  )}
                  {/* Hidden inputs for camera and gallery */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }} className="space-y-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Monto solicitado *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                    <input type="text" inputMode="numeric" value={formatNumberInput(amount)} onChange={e => setAmount(parseNumberInput(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-3 text-lg font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none" placeholder="1000000" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Tasa de interés</label>
                  <div className="flex space-x-2">
                    {([0.20, 0.30] as const).map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setInterestRate(r)}
                        className={cn(
                          'flex-1 py-2 rounded-xl text-sm font-bold transition-all border',
                          interestRate === r
                            ? r === 0.20
                              ? 'bg-brand-600 text-white border-brand-600 shadow-md shadow-brand-500/20'
                              : 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        )}
                      >
                        {(r * 100).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Plazo (días calendario) *</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={term === 0 ? '' : term}
                      onChange={e => setTerm(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
                      placeholder="Ej: 40"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">días</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Domingos a descontar</label>
                  <input type="text" inputMode="numeric" value={sundays === 0 ? '' : sundays} onChange={e => setSundays(parseInt(parseNumberInput(e.target.value)) || 0)} className="w-16 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center text-sm font-bold focus:outline-none" placeholder="0" />
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                  <label className="text-sm font-semibold text-slate-700">Valor de Boleta (opcional)</label>
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <input type="text" inputMode="numeric" value={receiptFee === 0 ? '' : formatNumberInput(receiptFee)} onChange={e => setReceiptFee(parseInt(parseNumberInput(e.target.value)) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-2 py-2 text-right text-sm font-bold focus:outline-none" placeholder="0" />
                  </div>
                </div>
                <label className="flex items-start bg-slate-50 border border-slate-200 p-4 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={wantsRaffle} onChange={e => setWantsRaffle(e.target.checked)} className="mt-0.5 w-5 h-5 rounded text-brand-600 focus:ring-brand-500 border-slate-300" />
                  <span className="ml-3 text-sm text-slate-700 font-semibold">Participar en Sorteo de Lotería (Asignar número)</span>
                </label>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Obligación total (+{(interestRate * 100).toFixed(0)}%)</span>
                    <span className="font-bold text-slate-800">{formatCurrency(obligation)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Dinero entregado</span>
                    <span className="font-bold text-emerald-600 text-lg">{formatCurrency(delivered)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Cuota diaria exacta</span>
                    <span className="font-bold text-brand-600">{formatCurrency(dailyQuota)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }} className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Resumen del préstamo</h2>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Cliente</span><span className="font-bold text-slate-800">{clientName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Cédula</span><span className="font-bold text-slate-800">{document}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Monto solicitado</span><span className="font-bold text-slate-800">{formatCurrency(numAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Obligación total (+{(interestRate * 100).toFixed(0)}%)</span><span className="font-bold text-slate-800">{formatCurrency(obligation)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Plazo</span><span className="font-bold text-slate-800">{term} días</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Cuota diaria exacta</span><span className="font-bold text-brand-600">{formatCurrency(dailyQuota)}</span></div>
                {sundays > 0 && <div className="flex justify-between text-sm text-rose-600"><span>Domingos descontados</span><span className="font-semibold">{sundays} (-{formatCurrency(totalSundaysDiscount)})</span></div>}
                {receiptFee > 0 && <div className="flex justify-between text-sm text-rose-600"><span>Boleta</span><span className="font-semibold">-{formatCurrency(receiptFee)}</span></div>}
                <div className="flex justify-between text-lg pt-2 border-t border-slate-100">
                  <span className="text-slate-700 font-bold">Dinero entregado</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(delivered)}</span>
                </div>
              </div>
              <label className="flex items-start bg-blue-50 border border-blue-100 p-4 rounded-xl cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 w-5 h-5 rounded text-brand-600 focus:ring-brand-500 border-slate-300" />
                <span className="ml-3 text-sm text-slate-700">Confirmo que la información es correcta y el cliente recibió el dinero exacto.</span>
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Action */}
      <div className="p-4 bg-white border-t border-slate-100">
        {step < 3 ? (
          <button
            onClick={handleNext}
            disabled={
              (step === 1 && (!clientName || !document)) ||
              // Bloquear avance si el cliente encontrado ya tiene préstamo activo
              (step === 1 && existingClientHasActiveLoan)
            }
            className={cn(
              "w-full font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98]",
              ((step === 1 && (!clientName || !document)) || (step === 1 && existingClientHasActiveLoan))
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/30"
            )}
          >
            Siguiente
          </button>
        ) : (
          <button
            disabled={!confirmed || isSaving || numAmount <= 0}
            onClick={handleCreate}
            className={cn(
              "w-full font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98]",
              confirmed && !isSaving && numAmount > 0 ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30" : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {isSaving ? 'Creando préstamo...' : 'Crear Préstamo'}
          </button>
        )}
      </div>
    </div>
  );
}
