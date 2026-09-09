// ============================================================
// TIPOS TypeScript — Sistema PWA de Préstamos
// Generados manualmente para alinearse con el schema SQL.
// En producción: usar `supabase gen types typescript` para auto-generar.
// ============================================================

// ─── ENUMS ────────────────────────────────────────────────
export type LoanStatus = 'ACTIVO' | 'VENCIDO' | 'EN_GRACIA' | 'CLAVO' | 'REFINANCIADO' | 'CANCELADO'
export type InstallmentStatus = 'PENDIENTE' | 'PAGADA' | 'PAGADA_ANTICIPADAMENTE' | 'PARCIAL' | 'ATRASADA'
export type DayType = 'NORMAL' | 'DOMINGO' | 'FESTIVO' | 'DOMINGO_FESTIVO'
export type AllocationType = 'DIA_ACTUAL' | 'ATRASO' | 'ADELANTO' | 'PARCIAL'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'
export type PaymentFrequency = 'DIARIO' | 'SEMANAL' | 'QUINCENAL'
export type ClientStatus = 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO'
export type ExpenseStatus = 'PENDIENTE' | 'REVISADO' | 'RECHAZADO'
export type UserRole = 'ADMINISTRADOR' | 'COBRADOR' | 'SUPERVISOR'

// ─── ENTIDADES DE BASE DE DATOS ───────────────────────────

export interface Role {
  id: string
  name: UserRole
  permissions: Record<string, boolean | string>
  description: string | null
  active: boolean
  created_at: string
}

export interface User {
  id: string
  full_name: string
  phone: string | null
  role_id: string
  active: boolean
  created_at: string
  updated_at: string
  // Relations
  role?: Role
}

export interface Route {
  id: string
  name: string
  description: string | null
  zones: string[]
  active: boolean
  created_by: string | null
  created_at: string
}

export interface RouteAssignment {
  id: string
  route_id: string
  collector_id: string
  date_start: string
  date_end: string | null
  assigned_by: string
  assigned_at: string
  observation: string | null
  // Relations
  route?: Route
  collector?: User
}

export interface Client {
  id: string
  full_name: string
  document_id: string
  phone: string | null
  address: string | null
  neighborhood: string | null
  municipality: string | null
  route_id: string | null
  photo_face_url: string | null
  photo_doc_url: string | null
  personal_references: string | null
  status: ClientStatus
  created_by: string | null
  created_at: string
  updated_at: string
  // Relations
  route?: Route
}

export interface Loan {
  id: string
  client_id: string
  route_id: string
  collector_id: string
  // Financieros originales (INMUTABLES)
  amount_requested: number
  interest_rate: number
  interest_amount: number
  initial_obligation: number
  term_days: 30 | 40 | 45 | 60
  daily_installment: number        // EXACTO sin redondeo
  frequency: PaymentFrequency
  // Domingos prepagados
  sundays_prepaid_count: number
  sundays_prepaid_amount: number
  // Boleta
  receipt_fee: number
  // Lotería / Boleta de sorteo
  wants_raffle: boolean
  raffle_number: string | null
  // Dinero entregado
  amount_delivered: number
  // Saldo actual
  current_balance: number
  // Fechas
  disbursement_date: string
  start_date: string
  end_date: string
  grace_end_date: string
  // Estado
  status: LoanStatus
  refinanced_from_loan_id: string | null
  created_by: string | null
  created_at: string
  // Relations
  client?: Client
  installments?: LoanInstallment[]
}

export interface LoanInstallment {
  id: string
  loan_id: string
  installment_number: number
  scheduled_date: string
  scheduled_amount: number
  paid_amount: number
  balance: number
  status: InstallmentStatus
  day_type: DayType
  is_prepaid: boolean
  is_sunday: boolean
  is_holiday: boolean
  paid_date: string | null
  created_at: string
}

export interface Payment {
  id: string
  operation_id: string            // UUID generado en dispositivo
  device_id: string
  loan_id: string
  collector_id: string
  route_id: string
  total_amount: number
  day_installment_amount: number
  arrears_amount: number
  advance_amount: number
  auto_observation: string | null  // generada automáticamente por el sistema
  collector_observation: string | null
  is_partial_payment: boolean
  is_advance_payment: boolean
  is_above_expected: boolean
  sync_status: SyncStatus
  collected_at: string
  synced_at: string | null
  created_by: string | null
  created_at: string
  // Relations
  allocations?: PaymentAllocation[]
}

export interface PaymentAllocation {
  id: string
  payment_id: string
  installment_id: string
  allocated_amount: number
  allocation_type: AllocationType
  created_at: string
}

export interface Expense {
  id: string
  collector_id: string
  route_id: string
  expense_date: string
  expense_time: string
  category_id: string
  amount: number
  description: string
  observation: string | null
  receipt_photo_url: string | null
  status: ExpenseStatus
  reviewed_by: string | null
  reviewed_at: string | null
  operation_id: string | null
  sync_status: SyncStatus
  created_at: string
  // Relations
  category?: ExpenseCategory
}

export interface ExpenseCategory {
  id: string
  name: string
  description: string | null
  active: boolean
  is_system: boolean
}

export interface DailyClosing {
  id: string
  route_id: string
  collector_id: string
  closing_date: string
  // Cobro
  expected_amount: number
  arrears_amount: number
  arrears_recovered: number
  total_collected: number
  partial_payments: number
  advance_payments: number
  above_expected_payments: number
  // Viático
  viaticum_assigned: number
  // Gastos
  fuel_expenses: number
  oil_expenses: number
  repair_expenses: number
  tire_expenses: number
  chain_expenses: number
  other_expenses: number
  total_expenses: number
  // Liquidación
  expected_delivery: number
  actual_delivery: number
  difference: number
  // Estado
  observations: string | null
  is_closed: boolean
  has_pending_sync: boolean
  closed_by: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface Refinancing {
  id: string
  original_loan_id: string
  new_loan_id: string
  pending_balance: number
  commercial_value: number
  net_delivered: number
  authorized_by: string
  created_at: string
}

export interface Holiday {
  id: string
  holiday_date: string
  name: string
  country_code: string
  active: boolean
}

export interface SystemSetting {
  id: string
  key: string
  value: unknown
  description: string | null
  updated_by: string | null
  updated_at: string
}

// ─── TIPOS DE DOMINIO (UI / CÁLCULOS) ─────────────────────

/**
 * Visión financiera del cliente en un momento dado.
 * Calculada por el sistema antes de cada cobro.
 */
export interface FinancialSnapshot {
  clientId: string
  loanId: string
  referenceDate: Date
  // Cuotas
  totalInstallmentsDue: number          // cuotas que deberían estar cubiertas hasta hoy
  totalDueAmount: number                // total que debería estar cubierto
  totalCoveredAmount: number            // total efectivamente cubierto
  pendingBalance: number                // totalDueAmount - totalCoveredAmount
  // Estado
  isOnTime: boolean
  isInArrears: boolean
  hasAdvance: boolean
  // Sugerencia de cobro
  todayInstallmentAmount: number
  arrearsAmount: number
  suggestedCollectionAmount: number     // todayInstallment + arrearsAmount
  // Cuotas adelantadas
  advanceInstallmentsCount: number
}

/**
 * Cómo distribuirá el sistema un pago recibido.
 * Mostrado al cobrador en la pantalla de confirmación.
 */
export interface PaymentDistributionPreview {
  totalReceived: number
  expectedAmount: number
  surplus: number
  isSurplus: boolean
  allocations: Array<{
    installmentId: string
    installmentDate: string
    installmentNumber: number
    allocationType: AllocationType
    allocatedAmount: number
    remainingBalance: number
  }>
  fullDaysCovered: number               // días completos cubiertos (para auto_observation)
  autoObservation: string | null
}

/**
 * Datos necesarios para crear un préstamo nuevo.
 */
export interface CreateLoanInput {
  clientId: string
  routeId: string
  collectorId: string
  amountRequested: number
  termDays: 30 | 40 | 45 | 60
  frequency: PaymentFrequency
  sundaysPrepaidCount: number
  receiptFee: number
  disbursementDate: string
}

/**
 * Datos para registrar un pago desde el dispositivo.
 */
export interface RegisterPaymentInput {
  operationId: string                   // UUID v4 generado en dispositivo
  deviceId: string
  loanId: string
  collectorId: string
  routeId: string
  totalAmount: number
  collectorObservation?: string
  collectedAt: string                   // ISO timestamp del dispositivo
}

export interface LotteryDraw {
  id: string
  draw_date: string
  winning_number: string
  processed_by: string | null
  created_at: string
}

export interface LotteryWinner {
  id: string
  draw_id: string
  loan_id: string
  prize_amount: number
  created_at: string
}

// ─── DATABASE TYPE (para tipado Supabase) ─────────────────
// Se usará con: createClient<Database>
// En producción generar con: supabase gen types typescript --local > src/lib/database.types.ts
export type Database = {
  public: {
    Tables: {
      roles: { Row: Role; Insert: Omit<Role, 'id' | 'created_at'>; Update: Partial<Role> }
      users: { Row: User; Insert: Omit<User, 'created_at' | 'updated_at'>; Update: Partial<User> }
      routes: { Row: Route; Insert: Omit<Route, 'id' | 'created_at'>; Update: Partial<Route> }
      route_assignments: { Row: RouteAssignment; Insert: Omit<RouteAssignment, 'id' | 'assigned_at'>; Update: Partial<RouteAssignment> }
      clients: { Row: Client; Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Client> }
      loans: { Row: Loan; Insert: Omit<Loan, 'id' | 'created_at'>; Update: Partial<Loan> }
      loan_installments: { Row: LoanInstallment; Insert: Omit<LoanInstallment, 'id' | 'created_at'>; Update: Partial<LoanInstallment> }
      payments: { Row: Payment; Insert: Omit<Payment, 'id' | 'created_at'>; Update: Partial<Payment> }
      payment_allocations: { Row: PaymentAllocation; Insert: Omit<PaymentAllocation, 'id' | 'created_at'>; Update: Partial<PaymentAllocation> }
      expenses: { Row: Expense; Insert: Omit<Expense, 'id' | 'created_at'>; Update: Partial<Expense> }
      expense_categories: { Row: ExpenseCategory; Insert: Omit<ExpenseCategory, 'id'>; Update: Partial<ExpenseCategory> }
      daily_closings: {
        Row: DailyClosing
        Insert: Partial<DailyClosing> & Pick<DailyClosing, 'route_id' | 'collector_id' | 'closing_date'>
        Update: Partial<DailyClosing>
      }
      refinancing: { Row: Refinancing; Insert: Omit<Refinancing, 'id' | 'created_at'>; Update: Partial<Refinancing> }
      holidays: { Row: Holiday; Insert: Partial<Holiday> & Pick<Holiday, 'holiday_date' | 'name' | 'country_code'>; Update: Partial<Holiday> }
      system_settings: {
        Row: SystemSetting
        Insert: Partial<SystemSetting> & Pick<SystemSetting, 'key'>
        Update: Partial<SystemSetting>
      }
      lottery_draws: { Row: LotteryDraw; Insert: Omit<LotteryDraw, 'id' | 'created_at'>; Update: Partial<LotteryDraw> }
      lottery_winners: { Row: LotteryWinner; Insert: Omit<LotteryWinner, 'id' | 'created_at'>; Update: Partial<LotteryWinner> }
    }
    Functions: {
      admin_create_user: {
        Args: {
          p_email: string
          p_password: string | null
          p_full_name: string
          p_phone: string | null
          p_role_id: string
        }
        Returns: string
      }
      process_lottery_draw: {
        Args: {
          p_winning_number: string
          p_admin_id: string
        }
        Returns: unknown
      }
    }
  }
}

