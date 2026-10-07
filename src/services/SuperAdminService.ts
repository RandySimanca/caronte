import { supabase } from '@/lib/supabase';
import type { Company, CompanyStatus, CompanyPlan } from '@/lib/database.types';

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
   * Obtiene métricas globales de la plataforma SaaS para el Super Admin.
   * Usa consultas directas a tablas sin depender de RPCs opcionales.
   */
  static async getGlobalMetrics(): Promise<GlobalSaaSMetrics> {
    // Empresas
    const { data: companies } = await supabase
      .from('companies')
      .select('id, status');

    const total_companies = companies?.length || 0;
    const active_companies = companies?.filter(c => c.status === 'ACTIVE').length || 0;
    const suspended_companies = companies?.filter(c => c.status === 'SUSPENDED').length || 0;

    // Cobradores totales
    const { count: total_collectors } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Rutas totales
    const { count: total_routes } = await supabase
      .from('routes')
      .select('*', { count: 'exact', head: true });

    // Préstamos activos y cartera
    const { data: loans } = await supabase
      .from('loans')
      .select('current_balance, status')
      .eq('status', 'ACTIVO');

    const total_loans_active = loans?.length || 0;
    const total_active_portfolio = loans?.reduce((acc, l) => acc + (l.current_balance || 0), 0) || 0;

    // Recaudo de hoy global
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: payments } = await supabase
      .from('payments')
      .select('total_amount')
      .gte('collected_at', `${todayStr}T00:00:00`)
      .lte('collected_at', `${todayStr}T23:59:59`);

    const total_collected_today = payments?.reduce((acc, p) => acc + (p.total_amount || 0), 0) || 0;

    return {
      total_companies,
      active_companies,
      suspended_companies,
      total_collectors: total_collectors || 0,
      total_routes: total_routes || 0,
      total_loans_active,
      total_active_portfolio,
      total_collected_today,
    };
  }

  /**
   * Obtiene listado de todas las empresas con estadísticas calculadas en cliente.
   */
  static async getCompanies(): Promise<CompanyWithStats[]> {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Datos relacionados para calcular estadísticas por empresa
    const { data: users } = await supabase
      .from('users')
      .select('id, company_id, role_id, roles!role_id(name)');

    const { data: routes } = await supabase
      .from('routes')
      .select('id, company_id');

    const { data: loans } = await supabase
      .from('loans')
      .select('id, route_id, current_balance, status, routes!route_id(company_id)');

    const { data: clients } = await supabase
      .from('clients')
      .select('id, route_id, routes!route_id(company_id)');

    return (companies || []).map(company => {
      const compUsers = users?.filter(u => u.company_id === company.id) || [];
      const collectors_count = compUsers.filter(u => (u.roles as any)?.name === 'COBRADOR').length;

      const compRoutes = routes?.filter(r => r.company_id === company.id) || [];
      const routes_count = compRoutes.length;

      const compClients = clients?.filter(c => (c.routes as any)?.company_id === company.id) || [];
      const clients_count = compClients.length;

      const compLoans = loans?.filter(l => (l.routes as any)?.company_id === company.id && l.status === 'ACTIVO') || [];
      const loans_count = compLoans.length;
      const active_portfolio = compLoans.reduce((sum, l) => sum + (l.current_balance || 0), 0);

      return {
        ...company,
        collectors_count,
        routes_count,
        clients_count,
        loans_count,
        active_portfolio,
      };
    });
  }

  /**
   * Crea una nueva empresa / prestamista y provisiona su usuario Administrador inicial.
   * Usa consultas directas sin Edge Functions.
   */
  static async createCompany(input: CreateCompanyInput): Promise<Company> {
    if (!navigator.onLine) {
      throw new Error('No hay conexión a internet. La creación de empresas requiere conexión.');
    }

    // Generar slug único con sufijo aleatorio
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const baseSlug = input.slug
      ? input.slug.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : input.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${randomSuffix}`;

    // 1. Insertar la empresa
    const { data: company, error: compError } = await supabase
      .from('companies')
      .insert({
        name: input.name,
        slug,
        owner_name: input.owner_name,
        email: input.email,
        phone: input.phone || null,
        plan: input.plan || 'PRO',
        max_collectors: input.max_collectors || 10,
        max_routes: input.max_routes || 10,
        subscription_expires_at: input.subscription_expires_at || null,
        notes: input.notes || null,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (compError) throw compError;

    // 2. Obtener id del rol ADMINISTRADOR
    const { data: roleData } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'ADMINISTRADOR')
      .single();

    if (roleData) {
      try {
        // 3. Crear el usuario administrador usando la función RPC existente
        const { data: newUserId, error: userError } = await supabase.rpc('admin_create_user', {
          p_email: input.admin_email,
          p_password: input.admin_password || null,
          p_full_name: input.admin_full_name,
          p_phone: input.admin_phone || null,
          p_role_id: roleData.id,
        });

        if (!userError && newUserId) {
          // 4. Asignar company_id al nuevo administrador
          await supabase
            .from('users')
            .update({ company_id: company.id })
            .eq('id', newUserId);
        } else if (userError) {
          console.error('Error provisioning admin user:', userError);
        }
      } catch (err) {
        console.error('Error provisioning initial admin user for company:', err);
      }
    }

    return company;
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
   * Elimina un usuario de la empresa (solo SUPER_ADMIN).
   * Desactiva el usuario en lugar de borrarlo físicamente para preservar auditoría.
   */
  static async deleteUser(userId: string): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No hay conexión a internet. La eliminación de usuarios requiere conexión.');
    }

    const { error } = await supabase
      .from('users')
      .update({ active: false })
      .eq('id', userId);

    if (error) throw new Error(error.message || 'Error al desactivar usuario');
  }

  /**
   * Elimina / desactiva una empresa (solo SUPER_ADMIN).
   * Cambia el estado a INACTIVE en lugar de borrar físicamente.
   */
  static async deleteCompany(companyId: string): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('No hay conexión a internet. La eliminación de empresas requiere conexión.');
    }

    const { error } = await supabase
      .from('companies')
      .update({ status: 'INACTIVE', updated_at: new Date().toISOString() })
      .eq('id', companyId);

    if (error) throw new Error(error.message || 'Error al desactivar empresa');
  }

  /**
   * Obtiene detalles completos de una empresa específica (usuarios, rutas)
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
