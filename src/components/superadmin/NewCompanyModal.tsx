import { useState } from 'react';
import { X, Building2, UserCheck, Shield, Sparkles } from 'lucide-react';
import { SuperAdminService, CreateCompanyInput } from '@/services/SuperAdminService';
import type { CompanyPlan } from '@/lib/database.types';
import toast from 'react-hot-toast';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewCompanyModal({ isOpen, onClose, onSuccess }: NewCompanyModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  // Company State
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<CompanyPlan>('PRO');
  const [maxCollectors, setMaxCollectors] = useState(10);
  const [maxRoutes, setMaxRoutes] = useState(10);
  const [expirationDate, setExpirationDate] = useState('');
  const [notes, setNotes] = useState('');

  // Admin User State
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPhone, setAdminPhone] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ownerName || !email || !adminFullName || !adminEmail) {
      toast.error('Por favor completa todos los campos obligatorios (*)');
      return;
    }

    setIsLoading(true);
    try {
      const payload: CreateCompanyInput = {
        name,
        owner_name: ownerName,
        email,
        phone: phone || undefined,
        plan,
        max_collectors: Number(maxCollectors),
        max_routes: Number(maxRoutes),
        subscription_expires_at: expirationDate ? new Date(expirationDate).toISOString() : undefined,
        notes: notes || undefined,
        admin_full_name: adminFullName,
        admin_email: adminEmail,
        admin_password: adminPassword || undefined,
        admin_phone: adminPhone || undefined,
      };

      await SuperAdminService.createCompany(payload);
      toast.success(`Empresa "${name}" creada exitosamente`);
      onSuccess();
      onClose();

      // Reset
      setName('');
      setOwnerName('');
      setPhone('');
      setEmail('');
      setAdminFullName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminPhone('');
      setNotes('');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error al crear la empresa');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all my-8 text-slate-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Nuevo Prestamista / Empresa</h3>
              <p className="text-xs text-slate-400">Registra un cliente SaaS y provisiona su usuario administrador</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* SECCIÓN 1: DATOS DE LA EMPRESA */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h4 className="text-sm font-bold uppercase tracking-wider text-indigo-400">1. Datos del Prestamista</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre Comercial / Empresa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Inversiones CrediYa"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre del Representante *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Correo Electrónico Empresa *</label>
                <input
                  type="email"
                  required
                  placeholder="contacto@crediya.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Teléfono Móvil / WhatsApp</label>
                <input
                  type="tel"
                  placeholder="+57 300 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Plan de Suscripción</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as CompanyPlan)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="BASIC">BASIC (Hasta 3 cobradores)</option>
                  <option value="PRO">PRO (Hasta 10 cobradores)</option>
                  <option value="ENTERPRISE">ENTERPRISE (Ilimitado)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Vencimiento Suscripción</label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Máx. Cobradores</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={maxCollectors}
                  onChange={(e) => setMaxCollectors(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Máx. Rutas</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={maxRoutes}
                  onChange={(e) => setMaxRoutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: ADMINISTRADOR INICIAL */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <h4 className="text-sm font-bold uppercase tracking-wider text-purple-400">2. Credenciales del Administrador Principal</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre Completo Admin *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Mendoza (Admin)"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Correo de Login Admin *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@crediya.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Contraseña (opcional)</label>
                <input
                  type="password"
                  placeholder="Dejar en blanco para por defecto"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Teléfono Admin</label>
                <input
                  type="tel"
                  placeholder="+57 311 000 0000"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: NOTAS */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notas / Observaciones Internas</label>
            <textarea
              rows={2}
              placeholder="Acuerdos de pago, referencias de contacto..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 active:scale-95"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Provisionando Empresa...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Crear Prestamista</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
