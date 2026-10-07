import { useState, useEffect } from 'react';
import { 
  SuperAdminService, 
  CompanyWithStats, 
  GlobalSaaSMetrics 
} from '@/services/SuperAdminService';
import { NewCompanyModal } from '@/components/superadmin/NewCompanyModal';
import { formatMoney } from '@/lib/money';
import type { CompanyStatus } from '@/lib/database.types';
import {
  Building2,
  Users,
  Compass,
  DollarSign,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Power,
  Edit3,
  Eye,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Phone,
  Mail,
  Calendar,
  X,
  Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState<GlobalSaaSMetrics | null>(null);
  const [companies, setCompanies] = useState<CompanyWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  
  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithStats | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [companyDetails, setCompanyDetails] = useState<any>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [m, c] = await Promise.all([
        SuperAdminService.getGlobalMetrics(),
        SuperAdminService.getCompanies()
      ]);
      setMetrics(m);
      setCompanies(c);
    } catch (error) {
      console.error(error);
      toast.error('Error cargando información de la plataforma SaaS');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleStatus = async (company: CompanyWithStats) => {
    const newStatus: CompanyStatus = company.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await SuperAdminService.updateCompanyStatus(company.id, newStatus);
      toast.success(`Estado de "${company.name}" actualizado a ${newStatus === 'ACTIVE' ? 'ACTIVA' : 'SUSPENDIDA'}`);
      fetchData();
    } catch (error) {
      toast.error('Error al actualizar el estado de la empresa');
    }
  };

  const handleViewDetails = async (company: CompanyWithStats) => {
    setSelectedCompany(company);
    setIsDetailOpen(true);
    try {
      const details = await SuperAdminService.getCompanyDetails(company.id);
      setCompanyDetails(details);
    } catch (error) {
      toast.error('Error cargando detalles del prestamista');
    }
  };

  const handleDeleteCompany = async (company: CompanyWithStats) => {
    if (!confirm(`¿Estás seguro de eliminar la empresa "${company.name}"?\n\nEsta acción eliminará permanentemente:\n- Todos los usuarios de la empresa\n- Todas las rutas\n- Todos los clientes\n- Todos los préstamos y pagos\n- Todos los datos históricos\n\nEsta acción NO se puede deshacer.`)) {
      return;
    }

    try {
      await SuperAdminService.deleteCompany(company.id);
      toast.success(`Empresa "${company.name}" desactivada exitosamente`);
      fetchData();
      setIsDetailOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar empresa');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario "${userName}"?\n\nEsta acción eliminará permanentemente:\n- El usuario y su perfil\n- Todos sus datos asignados\n- Su cuenta de autenticación\n\nEsta acción NO se puede deshacer.`)) {
      return;
    }

    try {
      await SuperAdminService.deleteUser(userId);
      toast.success(`Usuario "${userName}" desactivado exitosamente`);
      // Refresh company details
      if (selectedCompany) {
        const details = await SuperAdminService.getCompanyDetails(selectedCompany.id);
        setCompanyDetails(details);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar usuario');
    }
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = 
      company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.owner_name && company.owner_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (company.email && company.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesFilter = statusFilter === 'ALL' || company.status === statusFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl border border-slate-800/80 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Control Global de Prestamistas SaaS
            </h1>
          </div>
          <p className="text-sm text-slate-400">
            Administración centralizada de licencias, carteras globales y prestamistas activos
          </p>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/25 transition-all duration-200 active:scale-95 text-sm"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Nuevo Prestamista</span>
        </button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Prestamistas / Empresas</span>
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">
            {isLoading ? '...' : metrics?.total_companies || 0}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="text-emerald-400 font-bold">{metrics?.active_companies || 0} activas</span>
            <span>•</span>
            <span className="text-amber-400">{metrics?.suspended_companies || 0} suspendidas</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cartera Global Activa</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
            {isLoading ? '...' : formatMoney(metrics?.total_active_portfolio || 0)}
          </div>
          <p className="mt-2 text-xs text-slate-400 font-medium">
            {metrics?.total_loans_active || 0} préstamos activos en el sistema
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recaudo Global Hoy</span>
            <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-300 tracking-tight">
            {isLoading ? '...' : formatMoney(metrics?.total_collected_today || 0)}
          </div>
          <p className="mt-2 text-xs text-slate-400 font-medium">
            Suma total de cobros realizados hoy
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Infraestructura SaaS</span>
            <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-white tracking-tight">
            {isLoading ? '...' : `${metrics?.total_collectors || 0} / ${metrics?.total_routes || 0}`}
          </div>
          <p className="mt-2 text-xs text-slate-400 font-medium">
            Cobradores y Rutas registradas en total
          </p>
        </div>
      </div>

      {/* PRESTAMISTAS LIST SECTION */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar prestamista por nombre, dueño o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
            {['ALL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {status === 'ALL' && 'Todos'}
                {status === 'ACTIVE' && 'Activas'}
                {status === 'SUSPENDED' && 'Suspendidas'}
                {status === 'EXPIRED' && 'Vencidas'}
              </button>
            ))}
          </div>
        </div>

        {/* Company Cards Grid */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Cargando prestamistas de la plataforma...</p>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="p-12 text-center bg-slate-950/50 rounded-2xl border border-slate-800/50">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-300">No se encontraron prestamistas</h3>
            <p className="text-xs text-slate-500 mt-1">Prueba cambiando los términos de búsqueda o registra una nueva empresa.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompanies.map((company) => (
              <div 
                key={company.id}
                className="bg-slate-950/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 shadow-xl transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Top Card Bar */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 border ${
                        company.plan === 'ENTERPRISE' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' :
                        company.plan === 'PRO' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' :
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        Plan {company.plan}
                      </span>
                      <h3 className="text-lg font-black text-white group-hover:text-indigo-400 transition-colors">
                        {company.name}
                      </h3>
                    </div>

                    <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                      company.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      company.status === 'SUSPENDED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                      'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${company.status === 'ACTIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      {company.status === 'ACTIVE' ? 'Activa' : company.status === 'SUSPENDED' ? 'Suspendida' : 'Inactiva'}
                    </span>
                  </div>

                  {/* Owner & Contact details */}
                  <div className="space-y-1.5 text-xs text-slate-400 mb-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                    <p className="font-semibold text-slate-200 flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{company.owner_name || 'Sin Representante'}</span>
                    </p>
                    {company.email && (
                      <p className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate">{company.email}</span>
                      </p>
                    )}
                    {company.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{company.phone}</span>
                      </p>
                    )}
                  </div>

                  {/* Metrics Badges */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Cobradores</p>
                      <p className="font-black text-white text-sm mt-0.5">
                        {company.collectors_count} / <span className="text-slate-500 text-xs">{company.max_collectors}</span>
                      </p>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Rutas</p>
                      <p className="font-black text-white text-sm mt-0.5">
                        {company.routes_count} / <span className="text-slate-500 text-xs">{company.max_routes}</span>
                      </p>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">Cartera Activa</p>
                      <p className="font-black text-emerald-400 text-xs mt-1 truncate">
                        {formatMoney(company.active_portfolio)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => handleViewDetails(company)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs border border-slate-800 transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver Detalle</span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(company)}
                    className={`flex items-center justify-center p-2 rounded-xl border transition-all ${
                      company.status === 'ACTIVE'
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}
                    title={company.status === 'ACTIVE' ? 'Suspender Empresa' : 'Activar Empresa'}
                  >
                    <Power className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteCompany(company)}
                    className="flex items-center justify-center p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all"
                    title="Eliminar Empresa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NEW COMPANY MODAL */}
      <NewCompanyModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => fetchData()}
      />

      {/* COMPANY DETAIL MODAL */}
      {isDetailOpen && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsDetailOpen(false)} />
          
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden p-6 space-y-6 text-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Detalle de Empresa SaaS
                </span>
                <h3 className="text-xl font-black text-white mt-1">{selectedCompany.name}</h3>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content info */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <p className="text-slate-500 font-bold uppercase">Representante / Dueño</p>
                <p className="font-bold text-white text-sm">{selectedCompany.owner_name || '—'}</p>
                <p className="text-slate-400">{selectedCompany.email}</p>
                <p className="text-slate-400">{selectedCompany.phone}</p>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <p className="text-slate-500 font-bold uppercase">Plan & Licencia</p>
                <p className="font-bold text-indigo-400 text-sm">Plan {selectedCompany.plan}</p>
                <p className="text-slate-400">Estado: <span className="font-bold text-emerald-400">{selectedCompany.status}</span></p>
                <p className="text-slate-400">
                  Creada: {format(new Date(selectedCompany.created_at), 'dd MMM yyyy', { locale: es })}
                </p>
              </div>
            </div>

            {/* Users in company */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Equipo Registrado</h4>
              {!companyDetails ? (
                <p className="text-xs text-slate-500">Cargando usuarios...</p>
              ) : companyDetails.users.length === 0 ? (
                <p className="text-xs text-slate-500">No hay usuarios asignados a esta empresa.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {companyDetails.users.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs">
                      <div>
                        <p className="font-bold text-white">{u.full_name}</p>
                        <p className="text-slate-400 text-[11px]">{u.phone || 'Sin teléfono'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {u.roles?.name}
                        </span>
                        {u.roles?.name !== 'SUPER_ADMIN' && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.full_name)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all"
                            title="Eliminar Usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-between">
              <button
                onClick={() => handleDeleteCompany(selectedCompany)}
                className="px-5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-xl text-xs border border-red-500/30 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Empresa</span>
              </button>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
