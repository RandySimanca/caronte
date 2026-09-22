import { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, Briefcase } from 'lucide-react';
import { AdminService, UserWithRole } from '@/services/AdminService';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: UserWithRole | null;
}

export function UserPayrollModal({ isOpen, onClose, user }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [payrollData, setPayrollData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      // Al abrir el modal, calculamos la nómina del mes actual
      calculatePayroll(year, month);
    }
  }, [isOpen, user]);

  const calculatePayroll = async (y: number, m: number) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await AdminService.getWorkerPayroll(user.id, y, m);
      setPayrollData(data);
    } catch (error) {
      console.error(error);
      toast.error('Error calculando la nómina');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value);
    setMonth(newMonth);
    calculatePayroll(year, newMonth);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value);
    setYear(newYear);
    calculatePayroll(newYear, month);
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Nómina del Trabajador</h2>
              <p className="text-sm text-slate-500 font-medium">{user.full_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Selectores de fecha */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Mes
              </label>
              <select
                value={month}
                onChange={handleMonthChange}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-medium outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(0, m - 1).toLocaleString('es-ES', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-1/3">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Año
              </label>
              <select
                value={year}
                onChange={handleYearChange}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-medium outline-none"
              >
                {[year - 1, year, year + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : payrollData ? (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Días Laborados</p>
                    <p className="text-sm text-slate-400">En asignación de ruta</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-slate-800">
                    {payrollData.workedDays} <span className="text-sm font-semibold text-slate-500">/ {payrollData.daysInMonth}</span>
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Salario a Pagar</p>
                    <p className="text-sm text-slate-400">Base: ${(payrollData.workerSalary || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-emerald-600">
                    ${Math.round(payrollData.payrollAmount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Viáticos Acumulados</p>
                    <p className="text-sm text-slate-400">Día: ${(payrollData.workerViaticum || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-amber-600">
                    ${Math.round(payrollData.totalViaticum || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800 uppercase tracking-wider">Total a Pagar</p>
                  <p className="text-2xl font-black text-brand-600">
                    ${Math.round((payrollData.payrollAmount || 0) + (payrollData.totalViaticum || 0)).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              No hay datos disponibles
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
