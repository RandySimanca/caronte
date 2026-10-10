import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NavLink } from 'react-router-dom';
import { User, MapPin, Trophy, GripVertical } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

export function SortableClientItem({ client, isReordering }: { client: any, isReordering: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: client.id, disabled: !isReordering });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
  };

  const Content = (
    <div className={cn("flex items-center p-4", isReordering ? "bg-white border shadow-sm rounded-lg my-1 mx-2" : "active:bg-slate-100", isDragging && "shadow-md ring-2 ring-brand-500 opacity-90")}>
      {isReordering && (
        <div 
          {...attributes} 
          {...listeners}
          className="mr-3 text-slate-400 touch-none flex items-center justify-center p-2 -ml-2"
        >
          <GripVertical className="w-6 h-6" />
        </div>
      )}
      
      {/* Avatar */}
      <div className="relative flex-shrink-0 mr-4">
        <div className={cn(
          "w-12 h-12 rounded-full overflow-hidden border-2",
          client.status === 'GANADOR' ? 'border-amber-400' :
          client.status === 'VISITADO' ? (client.isAbono ? 'border-emerald-500 opacity-90' : 'border-emerald-500 opacity-50') : 
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
          client.status === 'VISITADO' && !client.isAbono ? "text-slate-400" :
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
      {!isReordering && (
      <div className="text-right ml-3">
        {client.status === 'GANADOR' ? (
          <>
            <p className="text-xs font-bold text-amber-700">¡Ganó la lotería!</p>
            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Infórmale al cliente</p>
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
          client.isTodayPaid ? "text-slate-400 line-through" : "text-slate-600"
        )}>
          Hoy: <span className="font-semibold">{formatCurrency(client.todayQuota)}</span>
        </p>
        <div className="flex flex-col items-end gap-1 mt-0.5">
          {client.isAbono ? (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold leading-none">
              Abonó hoy: {formatCurrency(client.todayPaidAmount)}
            </span>
          ) : client.isTodayPaid ? (
            <p className="text-[10px] text-emerald-500 font-semibold leading-none">Pagado hoy</p>
          ) : null}
          {client.arrears > 0 ? (
            <p className="text-[10px] text-rose-500 font-semibold bg-rose-50 px-1.5 py-0.5 rounded leading-none">
              Atraso: {formatCurrency(client.arrears)}
            </p>
          ) : client.status === 'NUEVO' ? (
            <p className="text-[10px] text-blue-500 font-semibold bg-blue-50 px-1.5 py-0.5 rounded leading-none">Nuevo</p>
          ) : !client.isTodayPaid && !client.isAbono ? (
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">Al día</p>
          ) : null}
        </div>
          </>
        )}
      </div>
      )}
    </div>
  );

  return (
    <li ref={setNodeRef} style={style} className={cn("bg-white transition-colors", !isReordering && "hover:bg-slate-50")}>
      {isReordering ? (
        Content
      ) : (
        <NavLink to={`/client/${client.id}`} className="block">
          {Content}
        </NavLink>
      )}
    </li>
  );
}
