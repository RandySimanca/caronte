import { useState, useEffect } from 'react';
import { Settings2, Save } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

//Diccionario para la traduccion de los parametros
const SETTING_LABELS: Record<string, string> = {
  allowed_frequencies: 'Frecuencias Permitidas',
  allowed_terms: 'Plazos Permitidos',
  commercial_refinancing_values: 'Valores de Refinanciación',
  default_receipt_fee: 'Valor por Defecto de Boleta',
  default_salary: 'Salario Mensual por Defecto',
  default_viaticum: 'Viático por Defecto',
  grace_days: 'Días de Gracia',
  interest_rate: 'Tasa de Interés',
  lottery_mode: 'Modo de Boletas',
  require_client_photo: 'Requiere Foto de Cliente',
  working_days: 'Días Laborales',
};


export function SystemSettingsTab() {
  const [settings, setSettings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const currentUser = useAuthStore(state => state.user);

  // Form states map
  const [values, setValues] = useState<Record<string, any>>({});

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await AdminService.getSystemSettings();
      setSettings(data);

      const newValues: Record<string, any> = {};
      data.forEach((s: any) => {
        newValues[s.key] = s.value;
      });
      setValues(newValues);
    } catch (error: any) {
      toast.error('Error cargando parámetros');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (key: string, value: any) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      // Solo actualizamos los que han cambiado
      for (const setting of settings) {
        if (JSON.stringify(setting.value) !== JSON.stringify(values[setting.key])) {
          await AdminService.updateSystemSetting(setting.key, values[setting.key], currentUser.id);
        }
      }
      toast.success('Configuraciones guardadas');
      await loadSettings();
    } catch (error: any) {
      toast.error('Error al guardar configuraciones');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-brand-500" />
            Parámetros de Préstamos
          </h3>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Guardar Cambios
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {settings.map(setting => (
            <div key={setting.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block font-bold text-slate-800 mb-1">
                {SETTING_LABELS[setting.key] ?? setting.key.replace(/_/g, ' ').toUpperCase()}
              </label>
              <p className="text-sm text-slate-500 mb-3">{setting.description}</p>

              {typeof values[setting.key] === 'number' ? (
                <input
                  type="number"
                  value={values[setting.key]}
                  onChange={(e) => handleChange(setting.key, parseFloat(e.target.value))}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-medium"
                />
              ) : typeof values[setting.key] === 'boolean' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChange(setting.key, !values[setting.key])}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${values[setting.key] ? 'bg-brand-500' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${values[setting.key] ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                  </button>
                  <span className="text-sm font-semibold">{values[setting.key] ? 'Activado' : 'Desactivado'}</span>
                </div>
              ) : setting.key === 'lottery_mode' ? (
                <select
                  value={values[setting.key] || 'OPCIONAL'}
                  onChange={(e) => handleChange(setting.key, e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-medium"
                >
                  <option value="OPCIONAL">Opcional</option>
                  <option value="OBLIGATORIA">Obligatoria</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={values[setting.key] || ''}
                  onChange={(e) => handleChange(setting.key, e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none font-medium"
                />
              )}
            </div>
          ))}
          {settings.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-500">
              No se encontraron parámetros globales en el sistema.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
