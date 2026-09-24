import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, Menu, User, MapPin, Plus, Trophy } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { NavLink } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { format } from 'date-fns';
import { applyLotteryDrawLocally, isLotteryWinnerLoan, parseLotteryLastDraw } from '@/lib/lottery';

export function RouteClientList() {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Real data from Dexie
  const clients = useLiveQuery(() => db.clients.toArray()) || [];
  const loans = useLiveQuery(() => db.loans.toArray()) || [];
  const installments = useLiveQuery(() => db.installments.toArray()) || [];
  const lotterySetting = useLiveQuery(() => db.settings.get('lottery_last_draw'));

  const today = format(new Date(), 'yyyy-MM-dd');
  const lotteryDraw = parseLotteryLastDraw(lotterySetting?.value);

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

      if (winnerLoan && !activeLoan) {
        status = 'GANADOR';
      } else if (loan) {
        todayQuota = loan.start_date > today ? 0 : loan.daily_installment;
        
        const loanInstallments = installments.filter(i => i.loan_id === loan.id);
        
        const arrearsInstallments = loanInstallments.filter(i => 
          i.scheduled_date < today && 
          ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status)
        );
        arrears = arrearsInstallments.reduce((sum, i) => sum + i.balance, 0);

        const todayInstallment = loanInstallments.find(i => i.scheduled_date === today);
        const isTodayPaid = todayInstallment && ['PAGADA', 'PAGADA_ANTICIPADAMENTE'].includes(todayInstallment.status);
        const isFutureStart = loan.start_date > today;

        if (isFutureStart) {
          status = 'NUEVO';
        } else if (isTodayPaid && arrears === 0) {
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
        raffleNumber: winnerLoan?.raffle_number ?? loan?.raffle_number,
        avatarUrl: client.photo_face_url
      };
    }).filter(c => c.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [clients, loans, installments, searchTerm, today, lotteryDraw]);

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
          <button className="p-2 -mr-2 text-slate-600">
            <Filter className="w-5 h-5" />
          </button>
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
        <ul className="divide-y divide-slate-100">
          {enrichedClients.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <p>No hay clientes para mostrar</p>
            </div>
          ) : enrichedClients.map((client) => (
            <li key={client.id} className="bg-white hover:bg-slate-50 transition-colors">
              <NavLink 
                to={`/client/${client.id}`} 
                className="flex items-center p-4 active:bg-slate-100"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0 mr-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full overflow-hidden border-2",
                    client.status === 'GANADOR' ? 'border-amber-400' :
                    client.status === 'VISITADO' ? 'border-emerald-500 opacity-50' : 
                    client.status === 'ATRASADO' ? 'border-rose-400' : 
                    client.status === 'NUEVO' ? 'border-blue-400' : 'border-transparent'
                  )}>
                    {client.avatarUrl ? (
                      <img src={client.avatarUrl} alt={client.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400">
                        <User className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  {client.status === 'GANADOR' && (
                    <div className="absolute -bottom-1 -right-1 bg-amber-400 text-white rounded-full p-0.5 border-2 border-white">
                      <Trophy className="w-3 h-3" />
                    </div>
                  )}
                  {client.status === 'VISITADO' && (
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 border-2 border-white">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {client.status === 'NUEVO' && (
                    <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-0.5 border-2 border-white">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-semibold truncate",
                    client.status === 'VISITADO' ? "text-slate-400" :
                    client.status === 'GANADOR' ? "text-amber-800" : "text-slate-800"
                  )}>
                    {client.full_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center truncate">
                    <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                    {client.address}
                  </p>
                </div>

                {/* Money */}
                <div className="text-right ml-3">
                  {client.status === 'GANADOR' ? (
                    <>
                      <p className="text-xs font-bold text-amber-600">Ganó boleta</p>
                      {client.raffleNumber && (
                        <p className="text-[10px] text-amber-700 font-semibold mt-0.5 bg-amber-50 inline-block px-1.5 py-0.5 rounded">
                          No. {client.raffleNumber}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                  <p className={cn(
                    "text-xs font-medium",
                    client.status === 'VISITADO' ? "text-slate-400" : "text-slate-600"
                  )}>
                    Hoy: <span className="font-semibold">{formatCurrency(client.todayQuota)}</span>
                  </p>
                  {client.arrears > 0 ? (
                    <p className="text-[10px] text-rose-500 font-semibold mt-0.5 bg-rose-50 inline-block px-1.5 py-0.5 rounded">
                      Atraso: {formatCurrency(client.arrears)}
                    </p>
                  ) : client.status === 'VISITADO' ? (
                    <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">Pagado</p>
                  ) : client.status === 'NUEVO' ? (
                    <p className="text-[10px] text-blue-500 font-semibold mt-0.5 bg-blue-50 inline-block px-1.5 py-0.5 rounded">Nuevo</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5">Al día</p>
                  )}
                    </>
                  )}
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* Floating Action Button */}
      <NavLink
        to="/loan/new"
        className="absolute bottom-20 right-4 w-14 h-14 bg-brand-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-brand-500/40 hover:bg-brand-700 active:scale-95 transition-all z-20"
      >
        <Plus className="w-7 h-7" />
      </NavLink>
    </div>
  );
}
