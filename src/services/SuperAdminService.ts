import { supabase } from '@/lib/supabase';
import type { Company, CompanyStatus, CompanyPlan, User, Route } from '@/lib/database.types';

export interface CreateCompanyInput {
  name: string;
  slug?: string;
  owner_name: string;
  email: string;
  phone?: string;
  plan?: CompanyPlan;
  max_collectors?: number;
  max_routes?: number;
  subscription_expires_at?: string;
  notes?: string;
  // Initial Admin credentials
  admin_full_name: string;
  admin_email: string;
  admin_password?: string;
  admin_phone?: string;
}

export interface CompanyWithStats extends Company {
  collectors_count: number;
  routes_count: number;
  clients_count: number;
  loans_count: number;
  active_portfolio: number;
}

export interface GlobalSaaSMetrics {
  total_companies: number;
  active_companies: number;
  suspended_companies: number;
  total_collectors: number;
  total_routes: number;
  total_loans_active: number;
  total_active_portfolio: number;
  total_collected_today: number;
}

export class SuperAdminService {
  /**
   * Obtiene métricas globales de la plataforma SaaS para el Super Admin
   * Usa la función RPC superadmin_company_stats para evitar descargar colecciones completas
   */
  static async getGlobalMetrics(): Promise<GlobalSaaSMetrics> {
    // Usar la función de agregación para obtener métricas por empresa
    const { data: companyStats, error: statsError } = await supabase
      .rpc('superadmin_company_stats');

    if (statsError) {
      console.error('Error fetching company stats:', statsError);
      throw statsError;
    }

    const stats = companyStats || [];

    // Calcular totales globales
    const total_companies = stats.length;
    const active_companies = stats.filter((s: any) => s.is_active).length;
    const suspended_companies = stats.filter((s: any) => !s.is_active).length;

    const total_collectors = stats.reduce((sum: number, s: any) => sum + (s.collectors_count || 0), 0);
    const total_routes = stats.reduce((sum: number, s: any) => sum + (s.routes_count || 0), 0);
    const total_loans_active = stats.reduce((sum: number, s: any) => sum + (s.loans_count || 0), 0);
    const total_active_portfolio = stats.reduce((sum: number, s: any) => sum + (s.active_portfolio || 0), 0);

    // Recaudo de hoy global (usar count exact para no truncar)
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: paymentsSum } = await supabase
      .from('payments')
      .select('total_amount', { count: 'exact', head: true })
      .gte('collected_at', `${todayStr}T00:00:00`)
      .lte('collected_at', `${todayStr}T23:59:59`);

    // Usar agregación SQL para suma exacta
    const { data: totalCollected } = await supabase
      .rpc('sum_total_collected_today', {
        p_start_date: `${todayStr}T00:00:00`,
        p_end_date: `${todayStr}T23:59:59`
      });

    const total_collected_today = totalCollected || 0;

    return {
      total_companies,
      active_companies,
      suspended_companies,
      total_collectors,
      total_routes,
      total_loans_active,
      total_active_portfolio,
      total_collected_today,
    };
  }

  /**
   * Obtiene listado de todas las empresas/prestamistas con sus estadísticas
   * Usa la función RPC superadmin_company_stats para evitar descargar colecciones completas
   */
  static async getCompanies(): Promise<CompanyWithStats[]> {
    // Usar la función de agregación para obtener métricas por empresa
    const { data: companyStats, error: statsError } = await supabase
      .rpc('superadmin_company_stats');

    if (statsError) {
      console.error('Error fetching company stats:', statsError);
      throw statsError;
    }

    // La función ya devuelve todos los datos necesarios
    return (companyStats || []).map((stat: any) => ({
      id: stat.company_id,
      name: stat.company_name,
      collectors_count: stat.collectors_count,
      routes_count: stat.routes_count,
      clients_count: stat.clients_count,
      loans_count: stat.loans_count,
      active_portfolio: stat.active_portfolio,
      is_active: stat.is_active,
      // Campos adicionales que podemos necesitar (null por ahora, la función podría expandirse)
      slug: null,
      owner_name: null,
      email: null,
      phone: null,
      status: stat.is_active ? 'ACTIVE' : 'INACTIVE',
      plan: null,
      max_collectors: null,
      max_routes: null,
      subscription_expires_at: null,
      notes: null,
      created_at: null,
      updated_at: null,
    }));
  }

  /**
   * Crea una nueva empresa / prestamista y provisiona su usuario Administrador inicial
   * Usa la edge function create-company
   */
  static async createCompany(input: CreateCompanyInput): Promise<Company> {
    // Check connection first
    if (!navigator.onLine) {
      throw new Error('No hay conexión a internet. La creación de empresas requiere conexión.');
    }

    const { data, error } = await supabase.functions.invoke('create-company', {
      body: input
    });

    if (error) {
      throw new Error(error.message || 'Error desconocido al crear empresa');
    }

    return data.company;
  }

  /**
   * Cambia el estado de una empresa (ACTIVE, SUSPENDED, EXPIRED, INACTIVE)
   */
  static async updateCompanyStatus(companyId: string, status: CompanyStatus): Promise<void> {
    const { error } = await supabase
      .from('companies')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', companyId);

    if (error) throw error;
  }

  /**
   * Actualiza los datos de configuración de una empresa
   */
  static async updateCompany(companyId: string, updates: Partial<Company>): Promise<void> {
    const { error } = await supabase
      .from('companies')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', companyId);

    if (error) throw error;
  }

  /**
   * Obtiene detalles completos de una empresa específica (usuarios, rutas, métricas)
   */
  static async getCompanyDetails(companyId: string) {
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (compErr) throw compErr;

    const { data: users } = await supabase
      .from('users')
      .select('*, roles!role_id(name)')
      .eq('company_id', companyId);

    const { data: routes } = await supabase
      .from('routes')
      .select('*')
      .eq('company_id', companyId);

    return {
      company,
      users: users || [],
      routes: routes || [],
    };
  }
}
