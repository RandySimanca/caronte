import Dexie, { type Table } from 'dexie';
import type { 
  Client, 
  Loan, 
  LoanInstallment, 
  SyncStatus,
  Route
} from '../lib/database.types';

// Omitimos relations y campos que no necesitamos localmente o que manejamos de otra forma
export type LocalClient = Omit<Client, 'route' | 'created_by'>;
export type LocalLoan = Omit<Loan, 'client' | 'installments' | 'created_by'>;
export type LocalInstallment = Omit<LoanInstallment, 'created_at'>;
export type LocalRoute = Route;

export interface LocalExpense {
  id: string; // UUID
  category_id: string;
  category_name: string;
  description: string;
  amount: number;
  expense_date: string; // YYYY-MM-DD
  route_id: string;
  sync_status: 'pending' | 'synced';
}

export interface LocalSetting {
  key: string;
  value: any;
}

export interface SyncOperation {
  id?: number; // Auto-incrementado por Dexie localmente
  operation_id: string; // UUID v4 para idempotencia
  operation_type: 'PAYMENT' | 'EXPENSE' | 'CLIENT' | 'LOAN' | 'NEW_LOAN_BUNDLE' | 'PAYMENT_BUNDLE';
  payload: any;
  status: SyncStatus;
  local_timestamp: string;
  error_message?: string;
  retry_count: number;
}

export class CobraDiarioDB extends Dexie {
  clients!: Table<LocalClient, string>;
  loans!: Table<LocalLoan, string>;
  installments!: Table<LocalInstallment, string>;
  syncQueue!: Table<SyncOperation, number>;
  routes!: Table<LocalRoute, string>;
  expenses!: Table<LocalExpense, string>;
  settings!: Table<LocalSetting, string>;

  constructor() {
    super('CobraDiarioDB');
    
    this.version(2).stores({
      clients: 'id, route_id, status, document_id',
      loans: 'id, client_id, route_id, status',
      installments: 'id, loan_id, scheduled_date, status',
      syncQueue: '++id, operation_id, status, operation_type',
      routes: 'id',
      expenses: 'id, expense_date, sync_status',
      settings: 'key'
    });
  }
}

export const db = new CobraDiarioDB();
