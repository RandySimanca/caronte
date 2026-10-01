import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Search, Filter, Menu, Plus, Settings2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavLink } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import toast from 'react-hot-toast';
import { SortableClientItem } from './SortableClientItem';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { format } from 'date-fns';
import { applyLotteryDrawLocally, isLotteryWinnerLoan, parseLotteryLastDraw } from '@/lib/lottery';
import { v4 as uuidv4 } from 'uuid';
import { useSyncStore } from '@/stores/syncStore';
import { SyncService } from '@/services/SyncService';

// Posición del scroll de la lista: se guarda por día para volver "por donde vas" después de cobrar
const SCROLL_KEY = 'route_list_scroll';

/** Primer ancestro que realmente hace scroll (depende del layout: puede ser la lista o el <main>). */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function RouteClientList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [orderedClients, setOrderedClients] = useState<any[]>([]);
  const { isOnline } = useSyncStore();
  
  // Real data from Dexie
  const clients = useLiveQuery(() => db.clients.toArray()) || [];
  const loans = useLiveQuery(() => db.loans.toArray()) || [];
  const installments = useLiveQuery(() => db.installments.toArray()) || [];
  const lotterySetting = useLiveQuery(() => db.settings.get('lottery_last_draw'));

  const today = format(new Date(), 'yyyy-MM-dd');
  const lotteryDraw = parseLotteryLastDraw(lotterySetting?.value);

  const listRef = useRef<HTMLUListElement | null>(null);
  const scrollRestoredRef = useRef(false);

  // Guardar la posición mientras haces scroll (el evento no burbujea: se escucha en captura)
  useEffect(() => {
    const onScroll = (e: Event) => {
      const list = listRef.current;
      const target = e.target;
      if (!list || !scrollRestoredRef.current) return;
      if (!(target instanceof HTMLElement) || !target.contains(list)) return;
      try {
        localStorage.setItem(SCROLL_KEY, JSON.stringify({ date: today, top: target.scrollTop }));
      } catch { /* sin almacenamiento: no pasa nada */ }
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [today]);

  // Al volver a la lista (o abrir la app el mismo día), restaurar la posición guardada
  useLayoutEffect(() => {
    if (scrollRestoredRef.current || orderedClients.length === 0) return;
    scrollRestoredRef.current = true;

    let saved: { date?: string; top?: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(SCROLL_KEY) || 'null'); } catch { saved = null; }
    if (!saved || saved.date !== today || !saved.top) return; // otro día o sin posición: arranca en el primero

    const top = saved.top;
    const apply = () => {
      const scroller = getScrollParent(listRef.current);
      if (scroller) scroller.scrollTop = top;
    };
    apply();
    requestAnimationFrame(apply); // por si el layout termina de acomodarse después
  }, [orderedClients.length, today]);

  useEffect(() => {
    if (lotteryDraw) applyLotteryDrawLocally(lotteryDraw).catch(() => {});
  }, [lotterySetting?.value]);

  // Compute stats and enrich clients with financial data
  const enrichedClients = useMemo(() => {
    return clients.map(client => {
      const winnerLoan = loans.find(l => l.client_id === client.id && isLotteryWinnerLoan(l, lotteryDraw));
      const activeLoan = loans.find(l => l.client_id === client.id && l.status === 'ACTIVO' && !isLotteryWinnerLoan(l, lotteryDraw));
      const loan = activeLoan ?? winnerLoan;
      
      let todayQuota = 0;
      let arrears = 0;
      let status = 'AL_DIA';
      let isTodayPaid = false;

      if (winnerLoan && !activeLoan) {
        status = 'GANADOR';
      } else if (loan) {
        const loanInstallments = installments.filter(i => i.loan_id === loan.id);

        const arrearsInstallments = loanInstallments.filter(i =>
          i.scheduled_date < today &&
          ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status)
        );
        arrears = arrearsInstallments.reduce((sum, i) => sum + Number(i.balance || 0), 0);

        const todayInstallment = loanInstallments.find(i => i.scheduled_date === today);
        const loanEnded = loan.end_date && loan.end_date < today;
        // Usar el balance real de la cuota; si no hay cuota y el préstamo ya terminó, mostrar 0.
        todayQuota = loan.start_date > today
          ? 0
          : (todayInstallment ? Number(todayInstallment.balance || 0) : (loanEnded ? 0 : Number(loan.daily_installment || 0)));
        
        isTodayPaid = !!(todayInstallment && ['PAGADA', 'PAGADA_ANTICIPADAMENTE'].includes(todayInstallment.status));
        const isFutureStart = loan.start_date > today;

        if (isFutureStart) {
          status = 'NUEVO';
        } else if (isTodayPaid) {
          status = 'VISITADO';
        } else if (arrears > 0) {
          status = 'ATRASADO';
        }
      }

      return {
        ...client,
        todayQuota,
        arrears,
        status,
        isTodayPaid,
        raffleNumber: winnerLoan?.raffle_number ?? loan?.raffle_number,
        avatarUrl: client.photo_face_url
      };
    })
    .sort((a, b) => (a.route_order || 0) - (b.route_order || 0) || a.full_name.localeCompare(b.full_name))
    .filter(c => c.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [clients, loans, installments, searchTerm, today, lotteryDraw]);

  useEffect(() => {
    if (!isReordering) {
      setOrderedClients(enrichedClients);
    }
  }, [enrichedClients, isReordering]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedClients((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  async function saveOrder() {
    try {
      // Solo los clientes cuya posición cambió (menos datos que sincronizar)
      const updates = orderedClients
        .map((c, i) => ({ id: c.id, route_order: i, changed: (c.route_order || 0) !== i }))
        .filter(u => u.changed)
        .map(({ id, route_order }) => ({ id, route_order }));
      if (updates.length === 0) {
        setIsReordering(false);
        return;
      }

      await db.transaction('rw', db.clients, db.syncQueue, async () => {
        for (const update of updates) {
          await db.clients.update(update.id, { route_order: update.route_order });
        }
        
        await db.syncQueue.add({
          operation_id: uuidv4(),
          operation_type: 'UPDATE_CLIENT_ORDERS' as any,
          payload: { updates },
          status: 'pending',
          local_timestamp: new Date().toISOString(),
          retry_count: 0
        });
      });
      
      setIsReordering(false);
      toast.success('Orden guardado');
      if (isOnline) {
        SyncService.pushPendingOperations().catch(console.error);
      }
    } catch (e) {
      toast.error('Error al guardar el orden');
    }
  }

  const totalClients = enrichedClients.length;
  const visitedCount = enrichedClients.filter(c => c.status === 'VISITADO').length;
  const arrearsCount = enrichedClients.filter(c => c.status === 'ATRASADO').length;
  const newCount = enrichedClients.filter(c => c.status === 'NUEVO').length;
  const winnerCount = enrichedClients.filter(c => c.status === 'GANADOR').length;
  const pendingCount = totalClients - visitedCount - newCount - winnerCount;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="bg-white px-4 py-3 border-b border-slate-100 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <button className="p-2 -ml-2 text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-slate-800">Mi Ruta</h1>
          <div className="flex -mr-2">
            {isReordering ? (
              <button onClick={saveOrder} className="p-2 text-brand-600 flex items-center">
                <Save className="w-5 h-5 mr-1" />
                <span className="text-sm font-semibold">Guardar</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  if (searchTerm) {
                    toast('Borra la búsqueda para ordenar la ruta completa');
                    return;
                  }
                  setIsReordering(true);
                }}
                className="p-2 text-slate-600"
                title="Ordenar ruta"
              >
                <Settings2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border-none rounded-xl bg-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
            placeholder="Buscar cliente..."
          />
        </div>
      </header>

      {/* Stats row */}
      <div className="flex justify-between px-4 py-3 bg-white border-b border-slate-100">
        <div className="text-center">
          <p className="text-brand-600 font-bold text-lg leading-none">{totalClients}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Clientes</p>
        </div>
        <div className="w-px h-8 bg-slate-100"></div>
        <div className="text-center">
          <p className="text-emerald-500 font-bold text-lg leading-none">{visitedCount}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Visitados</p>
        </div>
        <div className="w-px h-8 bg-slate-100"></div>
        <div className="text-center">
          <p className="text-orange-400 font-bold text-lg leading-none">{pendingCount}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Pendientes</p>
        </div>
        <div className="w-px h-8 bg-slate-100"></div>
        <div className="text-center">
          <p className="text-rose-500 font-bold text-lg leading-none">{arrearsCount}</p>
          <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Con atraso</p>
        </div>
      </div>

      {/* Client List */}
      <div className="flex-1 overflow-y-auto">
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <ul ref={listRef} className="divide-y divide-slate-100 pb-20">
            {orderedClients.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <p>No hay clientes para mostrar</p>
              </div>
            ) : (
              <SortableContext 
                items={orderedClients.map(c => c.id)} 
                strategy={verticalListSortingStrategy}
              >
                {orderedClients.map((client) => (
                  <SortableClientItem 
                    key={client.id} 
                    client={client} 
                    isReordering={isReordering} 
                  />
                ))}
              </SortableContext>
            )}
          </ul>
        </DndContext>
      </div>

      {/* Floating Action Button */}
      {/* Fijo respecto a la pantalla (no al contenido) y por encima del menú inferior (~81px) + zona segura */}
      <NavLink
        to="/loan/new"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed right-4 w-14 h-14 bg-brand-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-brand-500/40 hover:bg-brand-700 active:scale-95 transition-all z-20"
      >
        <Plus className="w-7 h-7" />
      </NavLink>
    </div>
  );
}
