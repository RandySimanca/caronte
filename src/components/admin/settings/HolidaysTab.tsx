import { useState, useEffect } from 'react';
import { Calendar, Plus, CalendarOff, AlertCircle } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';

export function HolidaysTab() {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const loadHolidays = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getHolidays();
      setHolidays(data);
    } catch (error: any) {
      toast.error('Error cargando feriados');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name) return;

    try {
      await AdminService.upsertHoliday({
        holiday_date: date,
        name,
        country_code: 'CO',
        active: true,
      });
      toast.success('Feriado registrado exitosamente');
      setDate('');
      setName('');
      loadHolidays();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar feriado');
    }
  };

  const handleToggle = async (holiday: any) => {
    try {
      await AdminService.upsertHoliday({
        ...holiday,
        active: !holiday.active
      });
      loadHolidays();
    } catch (error: any) {
      toast.error('Error al actualizar feriado');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-brand-50 p-4 rounded-xl border border-brand-100 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-brand-600 mt-0.5" />
        <div>
          <h4 className="font-bold text-brand-900">¿Cómo funcionan los feriados?</h4>
          <p className="text-sm text-brand-700 mt-1">
            Al registrar un feriado, el sistema asumirá que no se hacen cobros en esa fecha y los omitirá
            en la proyección de cuotas. Esto evitará que los clientes caigan en mora injustificadamente.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-brand-500" />
          Registrar Nuevo Feriado
        </h3>
        
        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Descripción / Nombre</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Día del Trabajador"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Guardar Feriado
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
              <th className="py-3 px-4 font-semibold w-1/4">Fecha</th>
              <th className="py-3 px-4 font-semibold w-1/2">Nombre</th>
              <th className="py-3 px-4 font-semibold text-right">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-slate-400">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto"></div>
                  </div>
                </td>
              </tr>
            ) : holidays.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center">
                  <CalendarOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No hay feriados registrados</p>
                </td>
              </tr>
            ) : (
              holidays.map(holiday => (
                <tr key={holiday.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {new Date(holiday.holiday_date).toLocaleDateString('es-CO', {
                      timeZone: 'UTC',
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </td>
                  <td className="py-3 px-4 text-slate-600">{holiday.name}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleToggle(holiday)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        holiday.active ? 'bg-brand-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          holiday.active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
