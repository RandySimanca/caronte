import React, { useState } from 'react';
import { Fuel, Wrench, Coffee, MoreHorizontal } from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { useSyncStore } from '@/stores/syncStore';

export function ExpensesPage() {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  // Obtener viático configurado desde Dexie (settings)
  const settings = useLiveQuery(() => db.settings.toArray(), []);
  const viaticumSetting = settings?.find(s => s.key === 'default_viaticum');
  const viaticum = viaticumSetting ? Number(viaticumSetting.value) : 0;

  // Obtener categorías desde settings
  const catSetting = settings?.find(s => s.key === 'expense_categories');
  const dbCategories = catSetting?.value || [];

  // Obtener gastos de hoy
  const expenses = useLiveQuery(
    () => db.expenses.where('expense_date').equals(today).toArray(),
    [today]
  ) || [];

  const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  const categories = dbCategories.length > 0 
    ? dbCategories.map((c: any) => ({
        id: c.id,
        name: c.name,
        icon: c.name === 'Combustible' ? Fuel : c.name === 'Reparación' ? Wrench : Coffee,
        color: c.name === 'Combustible' ? 'text-rose-500' : c.name === 'Reparación' ? 'text-blue-500' : 'text-amber-500',
        bg: c.name === 'Combustible' ? 'bg-rose-50' : c.name === 'Reparación' ? 'bg-blue-50' : 'bg-amber-50'
      }))
    : [
        { id: 'viaticos', name: 'Viáticos', icon: Coffee, color: 'text-amber-500', bg: 'bg-amber-50' },
        { id: 'combustible', name: 'Combustible', icon: Fuel, color: 'text-rose-500', bg: 'bg-rose-50' },
        { id: 'reparacion', name: 'Reparación', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
        { id: 'otro', name: 'Otro', icon: MoreHorizontal, color: 'text-slate-500', bg: 'bg-slate-50' },
      ];

  const handleNewExpense = async () => {
    if (!amount || Number(amount) <= 0) {
      toast.error('Ingresa un valor válido');
      return;
    }
    if (!category) {
      toast.error('Selecciona una categoría');
      return;
    }

    const categoryDef = categories.find((c: any) => c.id === category);
    
    try {
      const expenseId = uuidv4();
      const expenseDate = format(new Date(), 'yyyy-MM-dd');
      
      const newExpense = {
        id: expenseId,
        category_id: category,
        category_name: categoryDef?.name || 'Otro',
        description: `Gasto de ${categoryDef?.name || 'Otro'}`,
        amount: Number(amount),
        expense_date: expenseDate,
        route_id: 'local', // Se resuelve en SyncService
        sync_status: 'pending' as const
      };

      await db.expenses.add(newExpense);

      await db.syncQueue.add({
        operation_id: expenseId,
        operation_type: 'EXPENSE',
        payload: newExpense,
        status: 'pending',
        local_timestamp: new Date().toISOString(),
        retry_count: 0
      });

      toast.success('Gasto registrado');
      setAmount('');
      setCategory(null);
      
      // Intentar sincronizar en background
      useSyncStore.getState().setPendingCount(await db.syncQueue.where('status').anyOf(['pending', 'failed']).count());
      if (useSyncStore.getState().isOnline) {
        import('@/services/SyncService').then(m => m.SyncService.pushPendingOperations());
      }
    } catch (e: any) {
      toast.error('Error al registrar el gasto');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="bg-white px-4 py-4 border-b border-slate-100 sticky top-0 z-10 text-center">
        <h1 className="text-lg font-bold text-slate-800">Gastos del Día</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] uppercase font-semibold text-brand-600 mb-1">Viáticos asignados</p>
            <p className="text-xl font-bold text-slate-800">{formatCurrency(viaticum)}</p>
            <p className="text-xs text-slate-500 mt-1">Suyo para el día</p>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] uppercase font-semibold text-rose-500 mb-1">Total gastos</p>
            <p className="text-xl font-bold text-rose-600">{formatCurrency(totalExpenses)}</p>
            <p className="text-xs text-rose-500 mt-1">{expenses.length} gastos registrados</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Registrar gasto</h2>
          
          <div className="grid grid-cols-4 gap-2 mb-4">
          {categories.map((cat: { id: string; name: string; icon: React.ElementType; color: string }) => (
              <button 
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                  category === cat.id ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <cat.icon className={`w-5 h-5 mb-1 ${cat.color}`} />
                <span className="text-[9px] font-semibold text-slate-600">{cat.name}</span>
              </button>
            ))}
          </div>

          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatNumberInput(amount)}
              onChange={(e) => setAmount(parseNumberInput(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl py-3 pl-8 pr-4 font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="0"
            />
          </div>

          <button 
            onClick={handleNewExpense}
            className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-transform text-white font-bold py-3 rounded-xl shadow-md shadow-brand-500/30"
          >
            Nuevo Gasto
          </button>
        </div>

        {/* List */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-3 px-1">Gastos registrados</h3>
          <ul className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
            {expenses.map((expense) => {
              const catDef = categories.find((c: any) => c.name === expense.category_name) || categories[categories.length - 1];
              return (
                <li key={expense.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${catDef.bg}`}>
                      <catDef.icon className={`w-5 h-5 ${catDef.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{format(new Date(expense.expense_date), 'dd MMM', { locale: es })} - {expense.description}</p>
                      <p className="text-xs text-slate-500 font-medium">{expense.category_name}</p>
                    </div>
                  </div>
                  <span className="font-bold text-slate-800">{formatCurrency(expense.amount)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
