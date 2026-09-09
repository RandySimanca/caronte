import { format } from 'date-fns';
import { db } from '@/db/schema';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/stores/syncStore';

export class SyncService {
  /**
   * Pushes all pending operations from Dexie to Supabase.
   */
  static async pushPendingOperations() {
    const isOnline = useSyncStore.getState().isOnline;
    if (!isOnline) return;

    useSyncStore.getState().setSyncing(true);

    try {
      const pendingOps = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'failed'])
        .toArray();

      for (const op of pendingOps) {
        try {
          // Update status to syncing
          await db.syncQueue.update(op.id!, { status: 'syncing' });

          const uploadBase64Image = async (dataUrl: string | null, path: string): Promise<string | null> => {
            if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
            try {
              const res = await fetch(dataUrl);
              const blob = await res.blob();
              const { error } = await supabase.storage.from('clients_photos').upload(path, blob, { contentType: blob.type, upsert: true });
              if (error) {
                console.error('Error uploading photo:', error);
                return null;
              }
              const { data: publicUrlData } = supabase.storage.from('clients_photos').getPublicUrl(path);
              return publicUrlData.publicUrl;
            } catch (e) {
              console.error('Failed to upload base64 image:', e);
              return null;
            }
          };

          if (op.operation_type === 'NEW_LOAN_BUNDLE') {
            const { client, loan, installments } = op.payload;
            
            // Fix route_id if null or local
            let activeRouteId = client.route_id;
            if (!activeRouteId || activeRouteId === 'local') {
               const routes = await db.routes.toArray();
               activeRouteId = routes.length > 0 ? routes[0].id : null;
            }
            client.route_id = activeRouteId;
            loan.route_id = activeRouteId;

            // Get user to satisfy RLS
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              client.created_by = user.id;
              loan.created_by = user.id;
            }

            // Upload photos if they are base64
            client.photo_face_url = await uploadBase64Image(client.photo_face_url, `faces/${client.id}-${Date.now()}.jpg`);
            client.photo_doc_url = await uploadBase64Image(client.photo_doc_url, `docs/${client.id}-${Date.now()}.jpg`);

            if (loan.collector_id === 'local-user' && user) {
              loan.collector_id = user.id;
            }

            const { error: clientError } = await supabase.from('clients').upsert(client as any);
            if (clientError && clientError.code !== '42501') throw clientError;

            const { error: loanError } = await supabase.from('loans').upsert(loan as any);
            if (loanError && loanError.code !== '42501') throw loanError;

            const { error: instError } = await supabase.from('loan_installments').upsert(installments as any[]);
            if (instError) throw instError;

          } else if (op.operation_type === 'PAYMENT_BUNDLE') {
            const { payment, loanId, newLoanBalance, updatedInstallments } = op.payload;
            
            const { data: { user } } = await supabase.auth.getUser();

            let activeRouteId = payment.routeId || payment.route_id;
            if (!activeRouteId || activeRouteId === 'local') {
               const routes = await db.routes.toArray();
               activeRouteId = routes.length > 0 ? routes[0].id : null;
            }

            const paymentDb = {
              operation_id: payment.operationId || payment.operation_id,
              device_id: payment.deviceId || payment.device_id,
              loan_id: payment.loanId || payment.loan_id,
              collector_id: (payment.collectorId === 'local-user' || payment.collector_id === 'local-user') && user ? user.id : (payment.collectorId || payment.collector_id),
              route_id: activeRouteId,
              total_amount: payment.totalAmount || payment.total_amount,
              day_installment_amount: payment.day_installment_amount,
              arrears_amount: payment.arrears_amount,
              advance_amount: payment.advance_amount,
              collector_observation: payment.collectorObservation || payment.collector_observation,
              is_partial_payment: payment.is_partial_payment,
              is_advance_payment: payment.is_advance_payment,
              is_above_expected: payment.is_above_expected,
              sync_status: 'synced',
              collected_at: payment.collectedAt || payment.collected_at,
              synced_at: new Date().toISOString(),
              created_by: user?.id || null
            };

            const { error: paymentError } = await supabase.from('payments').upsert(paymentDb as any);
            if (paymentError) throw paymentError;

            const { error: loanError } = await supabase.from('loans').update({ current_balance: newLoanBalance } as any).eq('id', loanId);
            if (loanError && loanError.code !== '42501') throw loanError;

            for (const inst of updatedInstallments) {
              const { id, ...updateData } = inst;
              const { error: instError } = await supabase.from('loan_installments').update(updateData as any).eq('id', id);
              if (instError && instError.code !== '42501') throw instError;
            }
          } else if (op.operation_type === 'LOAN') {
            const clientId = op.payload.clientId;
            const loanId = op.payload.loanId;
            const client = await db.clients.get(clientId);
            const loan = await db.loans.get(loanId);
            const installments = await db.installments.where('loan_id').equals(loanId).toArray();
            
            if (client && loan && installments.length > 0) {
               let activeRouteId = client.route_id;
               if (!activeRouteId || activeRouteId === 'local') {
                  const routes = await db.routes.toArray();
                  activeRouteId = routes.length > 0 ? routes[0].id : null;
               }
               client.route_id = activeRouteId;
               loan.route_id = activeRouteId;

               const { data: { user } } = await supabase.auth.getUser();
               if (user) {
                 (client as any).created_by = user.id;
                 (loan as any).created_by = user.id;
                 if (loan.collector_id === 'local-user') loan.collector_id = user.id;
               }

               // Upload photos if they are base64
               client.photo_face_url = await uploadBase64Image(client.photo_face_url, `faces/${client.id}-${Date.now()}.jpg`);
               client.photo_doc_url = await uploadBase64Image(client.photo_doc_url, `docs/${client.id}-${Date.now()}.jpg`);

               const { error: err1 } = await supabase.from('clients').upsert(client as any);
               if (err1 && err1.code !== '42501') throw err1;
               const { error: err2 } = await supabase.from('loans').upsert(loan as any);
               if (err2 && err2.code !== '42501') throw err2;
               const { error: err3 } = await supabase.from('loan_installments').upsert(installments as any[]);
               if (err3) throw err3;
            }
          } else if ((op.operation_type as string) === 'UPDATE_CLIENT') {
            const client = op.payload.client;
            
            // Re-upload photos if needed (though edit page doesn't edit photos yet)
            if (client.photo_face_url && client.photo_face_url.startsWith('data:image')) {
               client.photo_face_url = await uploadBase64Image(client.photo_face_url, `faces/${client.id}-${Date.now()}.jpg`);
            }
            if (client.photo_doc_url && client.photo_doc_url.startsWith('data:image')) {
               client.photo_doc_url = await uploadBase64Image(client.photo_doc_url, `docs/${client.id}-${Date.now()}.jpg`);
            }

            const { error: err } = await supabase.from('clients').update({
              full_name: client.full_name,
              phone: client.phone,
              address: client.address,
              photo_face_url: client.photo_face_url,
              photo_doc_url: client.photo_doc_url,
              updated_at: new Date().toISOString()
            } as any).eq('id', client.id);

            if (err) throw err;
          } else if (op.operation_type === 'PAYMENT') {
            const p = op.payload;
            const { data: { user } } = await supabase.auth.getUser();
            
            let activeRouteId = p.routeId;
            if (!activeRouteId || activeRouteId === 'local') {
               const routes = await db.routes.toArray();
               activeRouteId = routes.length > 0 ? routes[0].id : null;
            }

            const paymentDb = {
              operation_id: p.operationId,
              device_id: p.deviceId || 'legacy-web',
              loan_id: p.loanId,
              collector_id: p.collectorId === 'local-user' && user ? user.id : p.collectorId,
              route_id: activeRouteId,
              total_amount: p.totalAmount,
              sync_status: 'synced',
              collected_at: p.collectedAt,
              synced_at: new Date().toISOString(),
              created_by: user?.id || null
            };
            const { error } = await supabase.from('payments').upsert(paymentDb as any);
            if (error) throw error;
          } else if (op.operation_type === 'EXPENSE') {
            const exp = op.payload;
            const { data: { user } } = await supabase.auth.getUser();

            let activeRouteId = exp.route_id;
            if (!activeRouteId || activeRouteId === 'local') {
               const routes = await db.routes.toArray();
               activeRouteId = routes.length > 0 ? routes[0].id : null;
            }

            const expenseDb = {
              operation_id: op.operation_id,
              collector_id: user?.id,
              route_id: activeRouteId,
              expense_date: exp.expense_date,
              category_id: exp.category_id,
              amount: exp.amount,
              description: exp.description,
              sync_status: 'synced'
            };

            const { error } = await supabase.from('expenses').upsert(expenseDb as any, { onConflict: 'operation_id' });
            if (error) throw error;
            
            // Actualizar localmente el estado del gasto
            await db.expenses.update(exp.id, { sync_status: 'synced' });
          }

          // Mark as synced
          await db.syncQueue.update(op.id!, { status: 'synced' });
        } catch (error: any) {
          console.error(`Failed to sync operation ${op.operation_id}:`, error);
          await db.syncQueue.update(op.id!, {
            status: 'failed',
            error_message: error.message || 'Unknown error',
            retry_count: (op.retry_count || 0) + 1,
          });
        }
      }

      // Cleanup synced operations older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      await db.syncQueue
        .where('status').equals('synced')
        .and(op => new Date(op.local_timestamp) < sevenDaysAgo)
        .delete();

    } catch (error) {
      console.error('Error during push sync:', error);
    } finally {
      useSyncStore.getState().setSyncing(false);
      useSyncStore.getState().setLastSync(new Date());
      this.updatePendingCount();
    }
  }

  /**
   * Pulls the assigned routes, clients, loans, and installments for the current collector.
   */
  static async pullInitialData(collectorId: string) {
    const isOnline = useSyncStore.getState().isOnline;
    if (!isOnline) return;

    useSyncStore.getState().setSyncing(true);

    try {
      // 1. Fetch assigned routes (including per-collector viaticum override)
      const { data: assignmentsRaw, error: assignmentError } = await supabase
        .from('route_assignments')
        .select('route_id, viaticum')
        .eq('collector_id', collectorId)
        .is('date_end', null);

      if (assignmentError) throw assignmentError;
      const assignments = (assignmentsRaw || []) as { route_id: string; viaticum: number | null }[];
      
      const routeIds = assignments.map(a => a.route_id);
      // Grab the viaticum from the first active assignment (null = use global default)
      const collectorViaticum = assignments.length > 0 ? assignments[0].viaticum : null;
      if (routeIds.length === 0) return;

      // 2. Fetch Routes
      const { data: routes } = await supabase
        .from('routes')
        .select('*')
        .in('id', routeIds);

      // 3. Fetch Clients in those routes
      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .in('route_id', routeIds)
        .eq('status', 'ACTIVO');

      const clientIds = ((clients || []) as { id: string }[]).map(c => c.id);

      // 4. Fetch Active Loans for those clients
      const { data: loans } = await supabase
        .from('loans')
        .select('*')
        .in('client_id', clientIds)
        .eq('status', 'ACTIVO');

      const loanIds = ((loans || []) as { id: string }[]).map(l => l.id);

      // 5. Fetch Installments for those loans
      const { data: installments } = await supabase
        .from('loan_installments')
        .select('*')
        .in('loan_id', loanIds);

      // 6. Fetch Global Settings and Categories
      const { data: settingsRaw } = await supabase.from('system_settings').select('key, value');
      const { data: categories } = await supabase.from('expense_categories').select('*').eq('active', true);
      const settings = (settingsRaw || []) as { key: string; value: any }[];
      
      const localSettings = settings.map(s => ({ key: s.key, value: s.value }));
      if (categories) {
        localSettings.push({ key: 'expense_categories', value: categories });
      }
      // Persist the per-collector viaticum override (if set); UI falls back to default_viaticum when absent
      if (collectorViaticum !== null && collectorViaticum !== undefined) {
        localSettings.push({ key: 'collector_viaticum', value: collectorViaticum });
      }

      // Check if day is already closed by admin liquidation
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: closings } = await supabase
        .from('daily_closings')
        .select('is_closed')
        .in('route_id', routeIds)
        .eq('closing_date', today)
        .eq('is_closed', true);

      if (closings && closings.length > 0) {
        localSettings.push({ key: `day_closed_${today}`, value: true });
      }

      // Save to Dexie Transactionally
      await db.transaction('rw', db.routes, db.clients, db.loans, db.installments, db.settings, async () => {
        // Clear existing data (in a real app you might want to merge, but for a daily sync full replace is safer if offline edits are pending in syncQueue)
        await db.routes.clear();
        await db.clients.clear();
        await db.loans.clear();
        await db.installments.clear();
        await db.settings.clear();

        if (routes) await db.routes.bulkAdd(routes as any[]);
        if (clients) await db.clients.bulkAdd(clients as any[]);
        if (loans) await db.loans.bulkAdd(loans as any[]);
        if (installments) await db.installments.bulkAdd(installments as any[]);
        if (localSettings.length > 0) await db.settings.bulkAdd(localSettings);
      });

    } catch (error) {
      console.error('Error during pull data:', error);
    } finally {
      useSyncStore.getState().setSyncing(false);
      useSyncStore.getState().setLastSync(new Date());
    }
  }

  static async updatePendingCount() {
    const count = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .count();
    useSyncStore.getState().setPendingCount(count);
  }

  /**
   * Actualiza solo los settings y categorías desde Supabase sin re-descargar
   * clientes, préstamos ni cuotas. Permite reflejar cambios del admin
   * (ej. viático, tasa de interés) en sesiones ya activas del cobrador.
   */
  static async pullSettings(collectorId: string) {
    const isOnline = useSyncStore.getState().isOnline;
    if (!isOnline) return;

    try {
      // Settings globales
      const { data: settingsRaw2 } = await supabase
        .from('system_settings')
        .select('key, value');

      // Categorías de gastos
      const { data: categories } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('active', true);

      // Viático específico del cobrador desde su asignación activa
      const { data: assignmentsRaw2 } = await supabase
        .from('route_assignments')
        .select('viaticum')
        .eq('collector_id', collectorId)
        .is('date_end', null)
        .limit(1);
      const assignments2 = (assignmentsRaw2 || []) as { viaticum: number | null }[];

      const collectorViaticum = assignments2.length > 0
        ? assignments2[0].viaticum
        : null;

      const localSettings = ((settingsRaw2 || []) as { key: string; value: any }[]).map(s => ({ key: s.key, value: s.value }));
      if (categories) {
        localSettings.push({ key: 'expense_categories', value: categories });
      }
      if (collectorViaticum !== null && collectorViaticum !== undefined) {
        localSettings.push({ key: 'collector_viaticum', value: collectorViaticum });
      }

      // Check if day is closed
      const today = format(new Date(), 'yyyy-MM-dd');
      const routeIdRes = await supabase
        .from('route_assignments')
        .select('route_id')
        .eq('collector_id', collectorId)
        .is('date_end', null)
        .limit(1);
        
      const routeIdData = (routeIdRes.data || []) as { route_id: string }[];
      if (routeIdData.length > 0) {
        const activeRouteId = routeIdData[0].route_id;
        const { data: closings } = await supabase
          .from('daily_closings')
          .select('is_closed')
          .eq('route_id', activeRouteId)
          .eq('closing_date', today)
          .eq('is_closed', true);

        if (closings && closings.length > 0) {
          localSettings.push({ key: `day_closed_${today}`, value: true });
        }
      }

      // Reemplaza solo la tabla de settings en Dexie
      await db.transaction('rw', db.settings, async () => {
        await db.settings.clear();
        if (localSettings.length > 0) await db.settings.bulkAdd(localSettings);
      });
    } catch (error) {
      console.error('Error refreshing settings:', error);
    }
  }
}
