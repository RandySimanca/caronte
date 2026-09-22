import { supabase } from '@/lib/supabase';
import type { User, Role } from '@/lib/database.types';

export interface UserWithRole extends User {
  roles: {
    name: string;
  };
}

export class AdminService {
  /**
   * Obtiene todos los usuarios del sistema junto con su rol.
   */
  static async getUsers(): Promise<UserWithRole[]> {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        roles (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as unknown) as UserWithRole[];
  }

  /**
   * Obtiene todos los roles disponibles (para el formulario de creación).
   */
  static async getRoles(): Promise<Role[]> {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    return data as unknown as Role[];
  }

  /**
   * Llama a la función RPC de PostgreSQL para crear un nuevo usuario
   * @param payload Datos del nuevo usuario
   */
  static async createUser(payload: {
    email: string;
    password?: string;
    full_name: string;
    phone?: string;
    role_id: string;
  }) {
    // Check connection first
    if (!navigator.onLine) {
      throw new Error('No hay conexión a internet. La creación de usuarios requiere conexión.');
    }

    const { data, error } = await supabase.rpc('admin_create_user', {
      p_email: payload.email,
      p_password: payload.password || null,
      p_full_name: payload.full_name,
      p_phone: payload.phone || null,
      p_role_id: payload.role_id
    });

    if (error) {
      throw new Error(error.message || 'Error desconocido al crear usuario');
    }

    return data;
  }

  // ─── GESTIÓN DE RUTAS ────────────────────────────────────────────────────────

  /**
   * Obtiene todas las rutas y su asignación activa (si la hay).
   */
  static async getRoutes() {
    const { data, error } = await supabase
      .from('routes')
      .select(`
        *,
        assignments:route_assignments (
          id,
          collector_id,
          date_start,
          date_end,
          collector:users!route_assignments_collector_id_fkey (
            full_name
          )
        )
      `)
      .order('name');

    if (error) throw error;

    // Mapear para facilitar el uso en UI
    return data.map((route: any) => {
      // Filtrar la asignación activa (date_end is null)
      const activeAssignment = route.assignments?.find((a: any) => !a.date_end) || null;
      return {
        ...route,
        activeAssignment
      };
    });
  }

  /**
   * Crea una nueva ruta
   */
  static async createRoute(payload: { name: string; description: string; zones: string[] }) {
    const { data, error } = await supabase
      .from('routes')
      .insert([{
        name: payload.name,
        description: payload.description,
        zones: payload.zones,
        active: true
      } as any])
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  /**
   * Actualiza una ruta existente
   */
  static async updateRoute(id: string, payload: { name?: string; description?: string; zones?: string[]; active?: boolean }) {
    const { data, error } = await supabase
      .from('routes')
      .update(payload as any)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  /**
   * Obtiene todos los cobradores activos para poder asignarles una ruta
   */
  static async getActiveCollectors() {
    // Primero obtener el ID del rol de COBRADOR
    const { data: roleData } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'COBRADOR')
      .single();

    if (!roleData) return [];

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, phone')
      .eq('role_id', roleData.id)
      .eq('active', true)
      .order('full_name');

    if (error) throw error;
    return data as unknown as { id: string; full_name: string; phone: string | null }[];
  }

  /**
   * Asigna un cobrador a una ruta.
   * Si ya había uno activo, cierra esa asignación.
   * viaticum y salary son opcionales: si se omiten (null) se usan los valores globales del sistema.
   */
  static async assignRoute(
    routeId: string,
    collectorId: string | null,
    assignedBy: string,
    viaticum?: number | null,
    salary?: number | null
  ) {
    // 1. Cerrar asignación actual si existe
    await supabase
      .from('route_assignments')
      .update({ date_end: new Date().toISOString() })
      .eq('route_id', routeId)
      .is('date_end', null);

    // Si collectorId está vacío, significa que solo querían quitar la asignación (pausar la ruta)
    if (!collectorId) return null;

    // 2. Crear nueva asignación
    const { data, error } = await supabase
      .from('route_assignments')
      .insert([{
        route_id: routeId,
        collector_id: collectorId,
        date_start: new Date().toISOString(),
        assigned_by: assignedBy,
        viaticum: viaticum ?? null,
        salary: salary ?? null
      } as any])
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  // ─── CONFIGURACIONES Y PARÁMETROS ──────────────────────────────────────────

  /**
   * Obtiene todos los feriados
   */
  static async getHolidays() {
    const { data, error } = await supabase
      .from('holidays')
      .select('*')
      .order('holiday_date', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Crea o actualiza un feriado
   */
  static async upsertHoliday(payload: { holiday_date: string; name: string; country_code: string; active?: boolean; id?: string }) {
    const { data, error } = await supabase
      .from('holidays')
      .upsert(payload as any, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  /**
   * Obtiene las categorías de gastos
   */
  static async getExpenseCategories() {
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  }

  /**
   * Crea o actualiza una categoría de gastos
   */
  static async upsertExpenseCategory(payload: { name: string; description?: string; active?: boolean; is_system?: boolean; id?: string }) {
    const { data, error } = await supabase
      .from('expense_categories')
      .upsert(payload as any, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  /**
   * Obtiene los parámetros globales del sistema
   */
  static async getSystemSettings() {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .order('key');

    if (error) throw error;
    return data;
  }

  /**
   * Actualiza un parámetro del sistema
   */
  static async updateSystemSetting(key: string, value: any, updatedBy: string) {
    const { data, error } = await supabase
      .from('system_settings')
      .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() } as any)
      .eq('key', key)
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────

  /**
   * Obtiene las métricas globales para el dashboard principal, opcionalmente filtradas por ruta
   */
  static async getDashboardStats(routeId?: string) {
    // 1. Start of day and week for filters
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    // Today as YYYY-MM-DD (local date) — used to exclude loans whose first installment starts tomorrow
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday as first day
    const startOfWeek = new Date(now.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekStr = startOfWeek.toISOString();

    // 2. Fetch role COBRADOR and ADMINISTRADOR ids
    const { data: rolesData } = await supabase.from('roles').select('id, name').in('name', ['COBRADOR', 'ADMINISTRADOR']);
    const cobradorRoleId = rolesData?.find((r: any) => r.name === 'COBRADOR')?.id;
    const adminRoleId = rolesData?.find((r: any) => r.name === 'ADMINISTRADOR')?.id;

    // 3. Prepare queries
    let clientsQuery = supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVO');
    let loansQuery = supabase.from('loans').select('*', { count: 'exact', head: true }).gte('start_date', startOfWeekStr);
    // ── Recaudo (hoy) ────────────────────────────────────────────────────────
    // Calculado desde loan_installments (paid_date = hoy) para coincidir
    // exactamente con la lógica del cobrador: cuota del día + atrasos pagados
    // hoy + adelantos reales de cuotas futuras (excluyendo domingos pre-pagados).
    let recaudoInstQuery = supabase
      .from('loan_installments')
      .select('paid_amount, scheduled_date, is_prepaid, loan:loans!inner(route_id)')
      .eq('paid_date', todayStr)
      .gt('paid_amount', 0);

    // ── Esperado (hoy) ───────────────────────────────────────────────────────
    // Se suma el balance de las cuotas de HOY que aún tienen saldo pendiente.
    // Si un cliente adelantó la cuota de hoy en días anteriores, su balance = 0
    // y no suma al esperado → el cobrador no necesita cobrarle.
    let todayInstsQuery = supabase
      .from('loan_installments')
      .select('balance, loan:loans!inner(route_id)')
      .eq('scheduled_date', todayStr)
      .gt('balance', 0);

    // Cuotas vencidas pendientes (atrasos) — mismo cálculo que el cobrador
    let arrearsQuery = supabase
      .from('loan_installments')
      .select('balance, loan_id, loan:loans!inner(route_id)')
      .lt('scheduled_date', todayStr)
      .in('status', ['PENDIENTE', 'PARCIAL', 'ATRASADA'])
      .gt('balance', 0);

    // ── Adelantadas para hoy ─────────────────────────────────────────────────
    // Cuotas cuya fecha programada es hoy pero que ya fueron pagadas en días
    // anteriores (paid_date < hoy). Estas son las que reducen el esperado.
    let prepaidTodayQuery = supabase
      .from('loan_installments')
      .select(`
        loan_id,
        paid_date,
        scheduled_amount,
        loan:loans!inner(route_id, daily_installment, client:clients(full_name))
      `)
      .eq('scheduled_date', todayStr)
      .eq('status', 'PAGADA')
      .lt('paid_date', todayStr);
    
    let alertsQuery = supabase.from('payments').select(`
      id,
      loan_id,
      total_amount,
      advance_amount,
      collected_at,
      collector_observation,
      is_above_expected,
      collector:users!payments_collector_id_fkey(id, full_name, role_id),
      loan:loans!inner(route_id, client:clients(full_name))
    `)
    .gte('collected_at', startOfDay)
    .order('collected_at', { ascending: false });
    
    // Apply route filter if provided
    if (routeId && routeId !== 'all') {
      clientsQuery = clientsQuery.eq('route_id', routeId);
      loansQuery = loansQuery.eq('route_id', routeId);
      recaudoInstQuery = (recaudoInstQuery as any).eq('loan.route_id', routeId);
      todayInstsQuery = (todayInstsQuery as any).eq('loan.route_id', routeId);
      arrearsQuery = (arrearsQuery as any).eq('loan.route_id', routeId);
      prepaidTodayQuery = (prepaidTodayQuery as any).eq('loan.route_id', routeId);
      alertsQuery = (alertsQuery as any).eq('loan.route_id', routeId);
    }

    // 4. Parallel fetch for exact counts and sums
    const [
      clientsRes,
      usersRes,
      routesRes,
      loansRes,
      recaudoInstRes,
      todayInstsRes,
      arrearsRes,
      prepaidTodayRes,
      alertsRes
    ] = await Promise.all([
      clientsQuery,
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('active', true).eq('role_id', cobradorRoleId),
      supabase.from('routes').select('*', { count: 'exact', head: true }).eq('active', true),
      loansQuery,
      recaudoInstQuery,
      todayInstsQuery,
      arrearsQuery,
      prepaidTodayQuery,
      alertsQuery
    ]);

    // Recaudo: suma paid_amount de cuotas con paid_date=hoy, excluyendo domingos
    // pre-pagados al crear el préstamo (is_prepaid=true y scheduled_date > hoy).
    const recaudoHoy = (recaudoInstRes.data || []).reduce((sum: number, i: any) => {
      const isFuture = i.scheduled_date > todayStr;
      if (isFuture && i.is_prepaid) return sum;
      return sum + Number(i.paid_amount);
    }, 0);

    // Esperado: suma del balance de cuotas de hoy con saldo > 0 (descuenta adelantadas)
    // + saldo de atrasos vencidos pendientes
    const todayInstsTotal = (todayInstsRes.data || []).reduce((sum: number, i: any) => sum + Number(i.balance), 0);
    const arrearsTotal = (arrearsRes.data || []).reduce((sum: number, i: any) => sum + Number(i.balance), 0);
    const recaudoEsperado = todayInstsTotal + arrearsTotal;

    // Adelantadas para hoy: cuotas de hoy ya pagadas en días anteriores
    const prepaidTodayData = (prepaidTodayRes.data || []).map((i: any) => ({
      loanId: i.loan_id,
      clientName: (i.loan as any)?.client?.full_name || 'Cliente desconocido',
      amount: Number((i.loan as any)?.daily_installment || i.scheduled_amount),
      paidDate: i.paid_date as string,
    }));

    const alertsData = alertsRes.data || [];
    
    // Calcular recaudo en oficina (Admin)
    const recaudoOficina = alertsData
      .filter((p: any) => p.collector?.role_id === adminRoleId)
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    const enrichedAlerts = alertsData
      .filter((alert: any) => alert.is_above_expected || alert.advance_amount > 0 || (alert.collector_observation && alert.collector_observation.trim() !== ''))
      .map((alert: any) => ({
        id: alert.id,
        loanId: alert.loan_id,
        amount: Number(alert.total_amount),
        advance: Number(alert.advance_amount),
        time: alert.collected_at,
        clientName: alert.loan?.client?.full_name || 'Cliente desconocido',
        collectorName: alert.collector?.full_name || 'Cobrador desconocido',
        observation: alert.collector_observation || null,
        is_excess: alert.is_above_expected || Number(alert.advance_amount) > 0,
      }));

    return {
      clientes: clientsRes.count || 0,
      nuevos: loansRes.count || 0,
      recaudo: recaudoHoy,
      recaudoOficina,
      esperado: recaudoEsperado,
      cobradores: usersRes.count || 0,
      rutas: routesRes.count || 0,
      alerts: enrichedAlerts,
      prepaidToday: {
        count: prepaidTodayData.length,
        clients: prepaidTodayData,
      },
    };
  }

  /**
   * Obtiene el estado de las rutas y sus cobradores asignados
   */
  static async getRouteStates() {
    const { data, error } = await supabase
      .from('routes')
      .select(`
        id, 
        name,
        active,
        assignments:route_assignments (
          id,
          date_end,
          collector:users!route_assignments_collector_id_fkey(
            id,
            full_name
          )
        ),
        clients (id)
      `)
      .order('name');

    if (error) throw error;

    return data.map((route: any) => {
      const activeAssignment = route.assignments?.find((a: any) => !a.date_end) || null;
      const cobrador = activeAssignment?.collector?.full_name || 'Sin asignar';
      
      // Simulando estado de conexión por ahora (en el futuro se puede validar última sync del dispositivo)
      let estado = route.active ? (activeAssignment ? 'Activo' : 'Sin asignar') : 'Inactiva';
      
      return {
        id: route.id,
        ruta: route.name,
        cobrador,
        clientesCount: route.clients?.length || 0,
        estado
      };
    });
  }

  // ─── LIQUIDACIONES ────────────────────────────────────────────────────────

  /**
   * Obtiene la lista de rutas y su estado de liquidación para una fecha
   */
  static async getRouteLiquidations(dateStr: string) {
    // 1. Obtener todas las rutas activas con su cobrador actual
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select(`
        id, 
        name,
        assignments:route_assignments (
          id,
          date_end,
          collector:users!route_assignments_collector_id_fkey(
            id,
            full_name
          )
        )
      `)
      .eq('active', true)
      .order('name');
    if (routesError) throw routesError;

    // 2. Obtener cierres de caja para esa fecha
    const { data: closings, error: closingsError } = await supabase
      .from('daily_closings')
      .select('route_id, is_closed, total_collected, total_expenses, expected_delivery, actual_delivery')
      .eq('closing_date', dateStr);
    if (closingsError) throw closingsError;

    // 3. Mezclar la información
    return routes.map((route: any) => {
      const activeAssignment = route.assignments?.find((a: any) => !a.date_end);
      const closing = (closings as any[])?.find((c: any) => c.route_id === route.id);
      
      return {
        id: route.id,
        ruta: route.name,
        cobrador: activeAssignment?.collector?.full_name || 'Sin asignar',
        cobradorId: activeAssignment?.collector?.id,
        estado: closing?.is_closed ? 'Liquidado' : 'Pendiente',
        recaudado: closing?.total_collected || 0,
        aEntregar: closing?.expected_delivery || 0,
        closingData: closing || null
      };
    });
  }

  /**
   * Obtiene el detalle de ingresos, gastos y préstamos para liquidar una ruta
   */
  static async getRouteLiquidationDetail(routeId: string, dateStr: string) {
    const startOfDay = dateStr + 'T00:00:00.000Z';
    const endOfDay = dateStr + 'T23:59:59.999Z';

    // Obtener los IDs de administradores para excluirlos de la liquidación del cobrador
    const { data: roleData } = await supabase.from('roles').select('id').eq('name', 'ADMINISTRADOR').single();
    let adminUserIds = new Set<string>();
    if (roleData) {
      const { data: adminUsers } = await supabase.from('users').select('id').eq('role_id', roleData.id);
      adminUserIds = new Set(adminUsers?.map(u => u.id) || []);
    }

    const [paymentsRes, expensesRes, loansRes, settingsRes, salarySettingRes, assignmentRes] = await Promise.all([
      supabase.from('payments').select('total_amount, collector_id').eq('route_id', routeId).gte('collected_at', startOfDay).lte('collected_at', endOfDay),
      supabase.from('expenses').select('amount, category:expense_categories(name)').eq('route_id', routeId).eq('expense_date', dateStr),
      supabase.from('loans').select('amount_delivered, collector_id').eq('route_id', routeId).eq('disbursement_date', dateStr),
      supabase.from('system_settings').select('value').eq('key', 'default_viaticum').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'default_salary').maybeSingle(),
      // Obtener la asignación activa para leer overrides de viático y salario del cobrador
      supabase.from('route_assignments').select('viaticum, salary').eq('route_id', routeId).is('date_end', null).maybeSingle()
    ]);

    // Solo sumar pagos que no fueron hechos por el administrador
    const totalCobrado = paymentsRes.data?.filter(p => !adminUserIds.has(p.collector_id)).reduce((sum, p: any) => sum + Number(p.total_amount), 0) || 0;
    const totalGastos = expensesRes.data?.reduce((sum, e: any) => sum + Number(e.amount), 0) || 0;
    
    // Solo contar préstamos entregados por el cobrador
    const collectorLoans = loansRes.data?.filter(l => !adminUserIds.has(l.collector_id)) || [];
    const prestamosNuevos = collectorLoans.length;
    const totalPrestado = collectorLoans.reduce((sum, l: any) => sum + Number(l.amount_delivered), 0);

    // Viático: primero el override del cobrador, luego el global
    const assignmentData = assignmentRes.data as any;
    let viaticoDia = 0;
    if (assignmentData?.viaticum != null) {
      viaticoDia = Number(assignmentData.viaticum);
    } else if (settingsRes.data && (settingsRes.data as any).value) {
      viaticoDia = Number((settingsRes.data as any).value);
    }

    // Salario: primero el override del cobrador, luego el global
    let salarioCobrador = 0;
    if (assignmentData?.salary != null) {
      salarioCobrador = Number(assignmentData.salary);
    } else if (salarySettingRes.data && (salarySettingRes.data as any).value) {
      salarioCobrador = Number((salarySettingRes.data as any).value);
    }

    // El salario es un costo informativo (no se descuenta del monto a entregar diario)
    const totalEntregar = totalCobrado - totalGastos - viaticoDia - totalPrestado;

    return {
      totalCobrado,
      totalGastos,
      detalleGastos: expensesRes.data || [],
      viaticoDia,
      salarioCobrador,
      prestamosNuevos,
      totalPrestado,
      totalEntregar
    };
  }

  /**
   * Aprueba la liquidación y la guarda en la base de datos
   */
  static async approveLiquidation(payload: any) {
    const { data, error } = await supabase
      .from('daily_closings')
      .upsert({
        route_id: payload.routeId,
        collector_id: payload.collectorId,
        closing_date: payload.date,
        base_amount: payload.baseAmount || 0,
        total_collected: payload.totalCobrado,
        total_expenses: payload.totalGastos + (payload.totalPrestado || 0),
        viaticum_assigned: payload.viaticoDia,
        expected_delivery: payload.totalEntregar,
        actual_delivery: payload.totalEntregar,
        difference: 0,
        is_closed: true,
        has_pending_sync: false,
        closed_by: payload.adminId,
        closed_at: new Date().toISOString(),
        expected_amount: payload.totalCobrado,
        arrears_amount: 0,
        arrears_recovered: 0,
        partial_payments: 0,
        advance_payments: 0,
        above_expected_payments: 0,
        fuel_expenses: 0,
        oil_expenses: 0,
        repair_expenses: 0,
        tire_expenses: 0,
        chain_expenses: 0,
        other_expenses: payload.totalGastos + (payload.totalPrestado || 0)
      } as any, { onConflict: 'route_id,closing_date' })
      .select()
      .single();

    if (error) throw error;
    return data as any;
  }

  // ─── CLIENTES ────────────────────────────────────────────────────────

  static async updateClient(id: string, data: { full_name?: string; document_id?: string; phone?: string; address?: string }) {
    const { error } = await supabase
      .from('clients')
      .update(data as any)
      .eq('id', id);
    if (error) throw error;
  }

  // ─── CLIENTS & LOANS (Admin Modal) ────────────────────────────────────────────────────────

  /**
   * Obtiene clientes con filtros opcionales de ruta y fecha de creación.
   */
  static async getClients(filters?: { routeId?: string; onlyToday?: boolean; search?: string }) {
    let query = supabase
      .from('clients')
      .select(`
        id,
        full_name,
        document_id,
        phone,
        address,
        neighborhood,
        municipality,
        status,
        photo_face_url,
        photo_doc_url,
        created_at,
        route:routes(id, name),
        creator:users!clients_created_by_fkey(full_name),
        loans(
          id,
          amount_requested,
          amount_delivered,
          interest_amount,
          initial_obligation,
          term_days,
          daily_installment,
          disbursement_date,
          status,
          current_balance,
          sundays_prepaid_count,
          receipt_fee,
          raffle_number
        )
      `)
      .order('created_at', { ascending: false });

    if (filters?.routeId && filters.routeId !== 'all') {
      query = query.eq('route_id', filters.routeId);
    }

    if (filters?.onlyToday) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Client-side search filter (simple, avoids ilike complexity)
    if (filters?.search && filters.search.trim() !== '') {
      const term = filters.search.toLowerCase();
      return data.filter((c: any) =>
        c.full_name?.toLowerCase().includes(term) ||
        c.document_id?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term)
      );
    }

    return data;
  }

  /**
   * Obtiene las cuotas de un préstamo para visualizar la tarjeta de cobros
   */
  static async getLoanInstallments(loanId: string) {
    const { data, error } = await supabase
      .from('loan_installments')
      .select('*')
      .eq('loan_id', loanId)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * Elimina un cliente por su ID
   */
  static async deleteClient(clientId: string) {
    // Primero, obtener los préstamos del cliente para eliminar dependencias
    const { data: loans } = await supabase.from('loans').select('id').eq('client_id', clientId);
    
    if (loans && loans.length > 0) {
      const loanIds = (loans as unknown as { id: string }[]).map(l => l.id);
      
      // Eliminar cuotas
      await supabase.from('loan_installments').delete().in('loan_id', loanIds);
      // Eliminar pagos
      await supabase.from('payments').delete().in('loan_id', loanIds);
      // Eliminar los préstamos
      await supabase.from('loans').delete().in('id', loanIds);
    }

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);

    if (error) throw error;
  }

  // ─── LOTERÍA / BOLETAS ──────────────────────────────────────────────

  /**
   * Procesa un sorteo de boletas
   */
  static async processLotteryDraw(winningNumber: string, adminId: string) {
    const { data, error } = await supabase.rpc('process_lottery_draw', {
      p_winning_number: winningNumber,
      p_admin_id: adminId
    });

    if (error) throw error;

    // Persist the winning number in system_settings so SyncService.pullSettings()
    // distributes it to collectors on their next sync. Collectors use this to show
    // a winner notification banner in the payment modal.
    const drawDate = new Date().toISOString().split('T')[0];
    await supabase.from('system_settings').upsert(
      {
        key: 'lottery_last_draw',
        value: { winning_number: winningNumber, draw_date: drawDate, processed_at: new Date().toISOString() },
        description: 'Último sorteo procesado — usado para notificar al cobrador'
      } as any,
      { onConflict: 'key' }
    );

    return data;
  }

  /**
   * Obtiene el historial de sorteos y ganadores
   */
  static async getLotteryDraws() {
    const { data, error } = await supabase
      .from('lottery_draws')
      .select(`
        *,
        processed_by:users(full_name),
        winners:lottery_winners(
          prize_amount,
          loan:loans(
            id,
            client:clients(full_name, phone)
          )
        )
      `)
      .order('draw_date', { ascending: false });

    if (error) throw error;
    return data;
  }

  // ─── REPORTES ────────────────────────────────────────────────────────

  /**
   * Obtiene datos agregados para el módulo de reportes
   */
  static async getReportsData(startDate: string, endDate: string, routeId?: string) {
    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    // 1. Pagos (Recaudos)
    let paymentsQuery = supabase
      .from('payments')
      .select('total_amount, collected_at')
      .gte('collected_at', startIso)
      .lte('collected_at', endIso);

    // 2. Gastos
    let expensesQuery = supabase
      .from('expenses')
      .select('amount, expense_date, category:expense_categories(name)')
      .gte('expense_date', startDate)
      .lte('expense_date', endDate);

    // 3. Préstamos Nuevos
    let loansQuery = supabase
      .from('loans')
      .select('amount_delivered, amount_requested, interest_amount, disbursement_date, current_balance, status')
      .gte('disbursement_date', startDate)
      .lte('disbursement_date', endDate);

    // 4. Asignaciones de ruta activas en el periodo
    let assignmentsQuery = supabase
      .from('route_assignments')
      .select('date_start, date_end, viaticum, salary, route_id')
      .lte('date_start', endDate)
      .or(`date_end.is.null,date_end.gte.${startDate}`);

    const { data: activeAssignments } = await supabase
      .from('route_assignments')
      .select('route_id')
      .is('date_end', null);
    const activeRouteIds = activeAssignments?.map((a: any) => a.route_id) || [];

    if (routeId && routeId !== 'all') {
      if (!activeRouteIds.includes(routeId)) {
        // La ruta seleccionada está pausada, no devolver datos
        paymentsQuery = paymentsQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        expensesQuery = expensesQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        loansQuery = loansQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        assignmentsQuery = assignmentsQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
      } else {
        paymentsQuery = paymentsQuery.eq('route_id', routeId);
        expensesQuery = expensesQuery.eq('route_id', routeId);
        loansQuery = loansQuery.eq('route_id', routeId);
        assignmentsQuery = assignmentsQuery.eq('route_id', routeId);
      }
    } else {
      // Si es 'all', filtrar las rutas pausadas
      if (activeRouteIds.length > 0) {
        paymentsQuery = paymentsQuery.in('route_id', activeRouteIds);
        expensesQuery = expensesQuery.in('route_id', activeRouteIds);
        loansQuery = loansQuery.in('route_id', activeRouteIds);
        assignmentsQuery = assignmentsQuery.in('route_id', activeRouteIds);
      } else {
        paymentsQuery = paymentsQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        expensesQuery = expensesQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        loansQuery = loansQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        assignmentsQuery = assignmentsQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const [paymentsRes, expensesRes, loansRes, assignmentsRes] = await Promise.all([
      paymentsQuery,
      expensesQuery,
      loansQuery,
      assignmentsQuery
    ]);

    if (paymentsRes.error) throw paymentsRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (loansRes.error) throw loansRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    return {
      payments: paymentsRes.data || [],
      expenses: expensesRes.data || [],
      loans: loansRes.data || [],
      assignments: assignmentsRes.data || []
    };
  }

  /**
   * Obtiene el estado de la cartera (préstamos activos y morosidad)
   */
  static async getPortfolioState(routeId?: string) {
    let query = supabase.from('loans').select(`
      id,
      amount_requested,
      amount_delivered,
      initial_obligation,
      current_balance,
      status,
      route_id,
      route:routes(name),
      client:clients(full_name, phone)
    `).eq('status', 'ACTIVO');
    
    const { data: activeAssignments } = await supabase
      .from('route_assignments')
      .select('route_id')
      .is('date_end', null);
    const activeRouteIds = activeAssignments?.map((a: any) => a.route_id) || [];

    if (routeId && routeId !== 'all') {
      if (!activeRouteIds.includes(routeId)) {
        query = query.eq('route_id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = query.eq('route_id', routeId);
      }
    } else {
      if (activeRouteIds.length > 0) {
        query = query.in('route_id', activeRouteIds);
      } else {
        query = query.eq('route_id', '00000000-0000-0000-0000-000000000000');
      }
    }
    
    const { data: loans, error: loansError } = await query;
    if (loansError) throw loansError;
    
    if (!loans || loans.length === 0) {
      return { loans: [], arrearsInstallments: [] };
    }

    const loanIds = loans.map((l: any) => l.id);
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Split into chunks of 100 if there are many loans to avoid URL too long issues in Supabase/PostgREST
    const chunkSize = 100;
    let allInstallments: any[] = [];
    
    for (let i = 0; i < loanIds.length; i += chunkSize) {
      const chunk = loanIds.slice(i, i + chunkSize);
      const { data: installments, error: instError } = await supabase
        .from('loan_installments')
        .select('loan_id, balance, scheduled_date, status')
        .in('loan_id', chunk)
        .lt('scheduled_date', todayStr)
        .in('status', ['PENDIENTE', 'PARCIAL', 'ATRASADA']);
        
      if (instError) throw instError;
      if (installments) {
        allInstallments = [...allInstallments, ...installments];
      }
    }
    
    return { loans, arrearsInstallments: allInstallments };
  }

  /**
   * Obtiene el Libro Auxiliar de transacciones cronológico
   */
  static async getLedgerTransactions(startDate: string, endDate: string, routeId?: string) {
    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    let pQuery = supabase.from('payments').select('id, collected_at, total_amount, collector_observation, loan:loans(client:clients(full_name)), collector:users!payments_collector_id_fkey(full_name)').gte('collected_at', startIso).lte('collected_at', endIso);
    let eQuery = supabase.from('expenses').select('id, expense_date, amount, description, category:expense_categories(name), route:routes(name)').gte('expense_date', startDate).lte('expense_date', endDate);
    let lQuery = supabase.from('loans').select('id, disbursement_date, amount_delivered, client:clients(full_name), route:routes(name)').gte('disbursement_date', startDate).lte('disbursement_date', endDate);

    const { data: activeAssignments } = await supabase
      .from('route_assignments')
      .select('route_id')
      .is('date_end', null);
    const activeRouteIds = activeAssignments?.map((a: any) => a.route_id) || [];

    if (routeId && routeId !== 'all') {
      if (!activeRouteIds.includes(routeId)) {
        pQuery = pQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        eQuery = eQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        lQuery = lQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
      } else {
        pQuery = pQuery.eq('route_id', routeId);
        eQuery = eQuery.eq('route_id', routeId);
        lQuery = lQuery.eq('route_id', routeId);
      }
    } else {
      if (activeRouteIds.length > 0) {
        pQuery = pQuery.in('route_id', activeRouteIds);
        eQuery = eQuery.in('route_id', activeRouteIds);
        lQuery = lQuery.in('route_id', activeRouteIds);
      } else {
        pQuery = pQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        eQuery = eQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
        lQuery = lQuery.eq('route_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const [pRes, eRes, lRes] = await Promise.all([pQuery, eQuery, lQuery]);
    
    if (pRes.error) throw pRes.error;
    if (eRes.error) throw eRes.error;
    if (lRes.error) throw lRes.error;
    
    const transactions: any[] = [];
    
    pRes.data?.forEach((p: any) => transactions.push({
      id: `p_${p.id}`,
      date: p.collected_at,
      type: 'INGRESO',
      description: `Pago Cuota - ${p.loan?.client?.full_name || 'Desconocido'}`,
      amount: Number(p.total_amount),
      observation: p.collector_observation || ''
    }));
    
    eRes.data?.forEach((e: any) => transactions.push({
      id: `e_${e.id}`,
      date: `${e.expense_date}T12:00:00.000Z`, // Approximation
      type: 'GASTO',
      description: `Gasto: ${e.category?.name || 'Otros'} - ${e.description || ''}`,
      amount: -Number(e.amount),
      observation: ''
    }));
    
    lRes.data?.forEach((l: any) => transactions.push({
      id: `l_${l.id}`,
      date: `${l.disbursement_date}T08:00:00.000Z`, // Approximation
      type: 'DESEMBOLSO',
      description: `Desembolso - ${l.client?.full_name || 'Desconocido'}`,
      amount: -Number(l.amount_delivered),
      observation: ''
    }));
    
    return transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Obtiene las tasas de viático y salario por defecto del sistema
   * para el cálculo de costos de personal en reportes.
   */
  static async getPersonnelCostSettings(): Promise<{ viaticumRate: number; salaryMonthly: number }> {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['default_viaticum', 'default_salary']);

    if (error) throw error;

    let viaticumRate = 0;
    let salaryMonthly = 0;

    (data || []).forEach((s: any) => {
      if (s.key === 'default_viaticum') viaticumRate = Number(s.value) || 0;
      if (s.key === 'default_salary') salaryMonthly = Number(s.value) || 0;
    });

    return { viaticumRate, salaryMonthly };
  }

  // ─── ADMIN TRANSACTIONS ──────────────────────────────────────────────

  /**
   * Permite al administrador crear un préstamo y asignarlo a cualquier ruta.
   */
  static async createAdminLoan(payload: {
    clientId: string | null;
    clientData?: { full_name: string; document_id: string; phone: string; address: string };
    routeId: string;
    adminId: string;
    amountRequested: number;
    termDays: 30 | 40 | 45 | 60;
    sundaysPrepaidCount: number;
    receiptFee: number;
    wantsRaffle: boolean;
  }) {
    let clientId = payload.clientId;

    // 1. Create client if needed
    if (!clientId && payload.clientData) {
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert([{
          full_name: payload.clientData.full_name,
          document_id: payload.clientData.document_id,
          phone: payload.clientData.phone || null,
          address: payload.clientData.address || null,
          status: 'ACTIVO',
          route_id: payload.routeId,
          created_by: payload.adminId
        }] as any)
        .select('id')
        .single();
      
      if (clientError) throw clientError;
      clientId = newClient.id;
    }

    if (!clientId) throw new Error("Cliente no especificado");

    // 2. Calculations
    const numAmount = payload.amountRequested;
    const obligation = numAmount * 1.20;
    const dailyQuota = payload.termDays > 0 ? obligation / payload.termDays : 0;
    const totalSundaysDiscount = dailyQuota * payload.sundaysPrepaidCount;
    const delivered = numAmount - totalSundaysDiscount - payload.receiptFee;
    
    // Raffle number
    let raffleNumber = null;
    if (payload.wantsRaffle) {
      const { data: activeLoans } = await supabase.from('loans').select('raffle_number').eq('status', 'ACTIVO');
      const usedNumbers = new Set(activeLoans?.map(l => l.raffle_number).filter(Boolean) || []);
      let possibleNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      for (let i = 0; i < 100; i++) {
        if (!usedNumbers.has(possibleNum)) break;
        possibleNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      }
      raffleNumber = possibleNum;
    }

    // Dates
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const addDays = (date: Date, days: number) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    };
    
    const startDate = addDays(today, 1).toISOString().split('T')[0];
    const endDate = addDays(today, payload.termDays).toISOString().split('T')[0];
    const graceEndDate = addDays(today, payload.termDays + 7).toISOString().split('T')[0];

    // 3. Insert Loan
    const { data: newLoan, error: loanError } = await supabase
      .from('loans')
      .insert([{
        client_id: clientId,
        route_id: payload.routeId,
        collector_id: payload.adminId, // Admin as collector
        amount_requested: numAmount,
        interest_rate: 0.2,
        interest_amount: numAmount * 0.2,
        initial_obligation: obligation,
        term_days: payload.termDays,
        daily_installment: dailyQuota,
        frequency: 'DIARIO',
        sundays_prepaid_count: payload.sundaysPrepaidCount,
        sundays_prepaid_amount: totalSundaysDiscount,
        receipt_fee: payload.receiptFee,
        amount_delivered: delivered,
        current_balance: obligation - totalSundaysDiscount,
        disbursement_date: todayStr,
        start_date: startDate,
        end_date: endDate,
        grace_end_date: graceEndDate,
        status: 'ACTIVO',
        wants_raffle: payload.wantsRaffle,
        raffle_number: raffleNumber,
        created_by: payload.adminId
      }] as any)
      .select('id')
      .single();

    if (loanError) throw loanError;

    // 4. Generate Installments
    const installments = [];
    let sundaysUsed = 0;
    for (let i = 0; i < payload.termDays; i++) {
      const date = addDays(today, i + 1);
      const dateStr = date.toISOString().split('T')[0];
      const isSun = date.getDay() === 0;
      const isPrepaid = isSun && sundaysUsed < payload.sundaysPrepaidCount;
      if (isPrepaid) sundaysUsed++;

      installments.push({
        loan_id: newLoan.id,
        installment_number: i + 1,
        scheduled_date: dateStr,
        scheduled_amount: dailyQuota,
        paid_amount: isPrepaid ? dailyQuota : 0,
        balance: isPrepaid ? 0 : dailyQuota,
        status: isPrepaid ? 'PAGADA_ANTICIPADAMENTE' : 'PENDIENTE',
        day_type: isSun ? 'DOMINGO' : 'NORMAL',
        is_prepaid: isPrepaid,
        is_sunday: isSun,
        is_holiday: false,
        paid_date: isPrepaid ? todayStr : null
      });
    }

    const { error: instError } = await supabase.from('loan_installments').insert(installments as any);
    if (instError) throw instError;

    return newLoan;
  }

  /**
   * Permite al administrador registrar un pago de cualquier préstamo en la oficina.
   */
  static async registerAdminPayment(payload: {
    loanId: string;
    routeId: string;
    adminId: string;
    totalAmount: number;
    observation?: string;
  }) {
    // 1. Get loan to calculate distributions
    const { data: loan, error: loanErr } = await supabase.from('loans').select('*').eq('id', payload.loanId).single();
    if (loanErr) throw loanErr;

    // 2. Insert Payment
    const crypto = window.crypto;
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    const operationId = Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');

    const collectedAt = new Date().toISOString();

    const { error: paymentError } = await supabase
      .from('payments')
      .upsert([{
        operation_id: operationId,
        device_id: 'admin_panel',
        loan_id: payload.loanId,
        collector_id: payload.adminId,
        route_id: payload.routeId,
        total_amount: payload.totalAmount,
        day_installment_amount: 0,
        arrears_amount: 0,
        advance_amount: 0,
        collector_observation: payload.observation || 'Cobro en oficina',
        is_partial_payment: false,
        is_advance_payment: false,
        is_above_expected: false,
        sync_status: 'synced',
        collected_at: collectedAt,
        synced_at: collectedAt,
        created_by: payload.adminId
      }] as any);

    if (paymentError) throw paymentError;

    // 3. Process distributions
    let remainingToDistribute = payload.totalAmount;
    
    const { data: pendingInsts, error: instsErr } = await supabase
      .from('loan_installments')
      .select('*')
      .eq('loan_id', payload.loanId)
      .gt('balance', 0)
      .order('scheduled_date', { ascending: true });
    
    if (instsErr) throw instsErr;

    const allocations = [];
    const updatedInsts = [];

    const todayStr = new Date().toISOString().split('T')[0];

    for (const inst of (pendingInsts || [])) {
      if (remainingToDistribute <= 0) break;

      const balance = Number(inst.balance);
      const payAmount = Math.min(balance, remainingToDistribute);
      remainingToDistribute -= payAmount;

      const newPaidAmount = Number(inst.paid_amount) + payAmount;
      const newBalance = balance - payAmount;

      let newStatus = inst.status;
      if (newBalance === 0) {
        if (inst.scheduled_date > todayStr) {
          newStatus = 'PAGADA_ANTICIPADAMENTE';
        } else {
          newStatus = 'PAGADA';
        }
      } else if (newPaidAmount > 0) {
        newStatus = 'PARCIAL';
      }

      updatedInsts.push({
        id: inst.id,
        paid_amount: newPaidAmount,
        balance: newBalance,
        status: newStatus,
        paid_date: todayStr
      });

      let allocationType = 'DIA_ACTUAL';
      if (inst.scheduled_date < todayStr) allocationType = 'ATRASO';
      if (inst.scheduled_date > todayStr) allocationType = 'ADELANTO';
      if (newStatus === 'PARCIAL') allocationType = 'PARCIAL';

      allocations.push({
        payment_id: newPayment.id,
        installment_id: inst.id,
        allocated_amount: payAmount,
        allocation_type: allocationType
      });
    }

    for (const uInst of updatedInsts) {
      await supabase.from('loan_installments').update({
        paid_amount: uInst.paid_amount,
        balance: uInst.balance,
        status: uInst.status,
        paid_date: uInst.paid_date
      }).eq('id', uInst.id);
    }

    if (allocations.length > 0) {
      await supabase.from('payment_allocations').insert(allocations as any);
    }

    const newLoanBalance = Number(loan.current_balance) - payload.totalAmount;
    await supabase.from('loans').update({
      current_balance: Math.max(0, newLoanBalance),
      status: newLoanBalance <= 0 ? 'CANCELADO' : loan.status
    }).eq('id', payload.loanId);

    return newPayment;
  }

  /**
   * Calcula la nómina de un trabajador en un mes específico
   */
  static async getWorkerPayroll(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    
    // Obtener asignaciones
    const { data: assignments, error } = await supabase
      .from('route_assignments')
      .select('date_start, date_end, salary, viaticum')
      .eq('collector_id', userId)
      .lte('date_start', endDate.toISOString())
      .or(`date_end.is.null,date_end.gte.${startDate.toISOString()}`);
      
    if (error) throw error;
    
    // Obtener configuraciones globales de salario y viático
    const { viaticumRate, salaryMonthly } = await AdminService.getPersonnelCostSettings();
    
    // Para simplificar, calculamos día por día en el mes
    // si el trabajador estuvo asignado a *alguna* ruta.
    const daysInMonth = endDate.getDate();
    let workedDays = 0;
    
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Permitir contar el día de hoy completo
    
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month - 1, day);
      
      // No contar días en el futuro
      if (d > today) {
        continue;
      }

      // Usamos el locale local para armar el string ISO del día
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dayStr = `${yyyy}-${mm}-${dd}`;
      
      const wasAssigned = assignments?.some(a => {
        const start = a.date_start.split('T')[0];
        const end = a.date_end ? a.date_end.split('T')[0] : null;
        return dayStr >= start && (!end || dayStr <= end);
      });
      
      if (wasAssigned) {
        workedDays++;
      }
    }
    
    // ¿Cuál es el salario base de este trabajador?
    // Si la última asignación tiene un override, usar ese. Si no, global.
    const sortedAssignments = (assignments || []).sort((a, b) => 
      new Date(b.date_start).getTime() - new Date(a.date_start).getTime()
    );
    
    const latestAssignment = sortedAssignments[0];
    const workerSalary = latestAssignment?.salary ?? salaryMonthly;
    const workerViaticum = latestAssignment?.viaticum ?? viaticumRate;
    
    const payrollAmount = (workerSalary / 30) * workedDays;
    const totalViaticum = workerViaticum * workedDays;
    
    return {
      workedDays,
      workerSalary, // salario base mensual
      payrollAmount,
      totalViaticum,
      workerViaticum, // viatico base por dia
      daysInMonth
    };
  }
}

