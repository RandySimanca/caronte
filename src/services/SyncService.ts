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

            // Upload voucher image if this is a transfer payment
            let transferVoucherUrl: string | null = null;
            if (payment.isTransfer && payment.transferVoucherBase64) {
              try {
                const res = await fetch(payment.transferVoucherBase64);
                const blob = await res.blob();
                const voucherPath = `vouchers/${payment.operationId || payment.operation_id}.jpg`;
                const { error: uploadErr } = await supabase.storage
                  .from('clients_photos')
                  .upload(voucherPath, blob, { contentType: blob.type, upsert: true });
                if (!uploadErr) {
                  const { data: urlData } = supabase.storage.from('clients_photos').getPublicUrl(voucherPath);
                  transferVoucherUrl = urlData.publicUrl;
                }
              } catch (uploadEx) {
                console.error('Error uploading transfer voucher:', uploadEx);
              }
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
              is_transfer: payment.isTransfer || false,
              transfer_voucher_url: transferVoucherUrl,
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
               loan.route_id = activeRouteId as string;

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
          } else if (op.operation_type === 'PAYMENT' || (op.operation_type as string) === 'PAYMENT_BUNDLE') {
            const isBundle = (op.operation_type as string) === 'PAYMENT_BUNDLE';
            const p = isBundle ? op.payload.payment : op.payload;
            const loanId = isBundle ? op.payload.loanId : p.loanId;
            const updatedInstallments = isBundle ? op.payload.updatedInstallments : [];
            const newLoanBalance = isBundle ? op.payload.newLoanBalance : undefined;

            const { data: { user } } = await supabase.auth.getUser();
            
            let activeRouteId = p.routeId;
            if (!activeRouteId || activeRouteId === 'local') {
               const routes = await db.routes.toArray();
               activeRouteId = routes.length > 0 ? routes[0].id : null;
            }

            const paymentDb = {
              operation_id: p.operationId,
              device_id: p.deviceId || 'legacy-web',
              loan_id: loanId,
              collector_id: p.collectorId === 'local-user' && user ? user.id : p.collectorId,
              route_id: activeRouteId,
              total_amount: p.totalAmount,
              advance_amount: p.advance_amount || 0,
              arrears_amount: p.arrears_amount || 0,
              day_installment_amount: p.day_installment_amount || 0,
              is_advance_payment: p.is_advance_payment || false,
              is_above_expected: p.is_above_expected || false,
              is_partial_payment: p.is_partial_payment || false,
              collector_observation: p.collectorObservation || null,
              sync_status: 'synced',
              collected_at: p.collectedAt,
              synced_at: new Date().toISOString(),
              created_by: user?.id || null
            };

            const { error } = await supabase.from('payments').upsert(paymentDb as any);
            if (error) throw error;

            // Handle bundle updates (installments and loan balance)
            if ((op.operation_type as string) === 'PAYMENT_BUNDLE' && updatedInstallments.length > 0) {
              const { error: instError } = await supabase
                .from('loan_installments')
                .upsert(updatedInstallments as any);
              if (instError) throw instError;

              if (newLoanBalance !== undefined) {
                const { error: loanError } = await supabase
                  .from('loans')
                  .update({ current_balance: newLoanBalance } as any)
                  .eq('id', loanId);
                if (loanError) throw loanError;
              }
            }
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
          const newRetryCount = (op.retry_count || 0) + 1;
          
          if (newRetryCount >= 5) {
            console.error(`Operación ${op.operation_id} descartada permanentemente tras 5 intentos fallidos.`);
            await db.syncQueue.delete(op.id!);
          } else {
            await db.syncQueue.update(op.id!, {
              status: 'failed',
              error_message: error.message || 'Unknown error',
              retry_count: newRetryCount,
            });
          }
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
   *
   * Uses a SAFE MERGE strategy instead of clear+bulkAdd to prevent data loss:
   * - Server records are upserted (bulkPut) into the local DB.
   * - Local records still referenced by pending/failed sync ops (e.g. NEW_LOAN_BUNDLE
   *   created offline) are NEVER deleted, even if the server doesn't know about them yet.
   * - Only truly stale records (gone from server + no pending op) are removed.
   */
  static async pullInitialData(collectorId: string) {
    const isOnline = useSyncStore.getState().isOnline;
    if (!isOnline) return;

    // Guard: don't pull while a push is already in progress to avoid race conditions.
    if (useSyncStore.getState().isSyncing) {
      console.warn('[SyncService] pullInitialData skipped — push still in progress.');
      return;
    }

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

      const today = format(new Date(), 'yyyy-MM-dd');
      const todayStart = today + 'T00:00:00.000Z';
      const todayEnd = today + 'T23:59:59.999Z';

      // 7. Fetch Admin Office Payments for these routes for today
      // This is crucial so the collector isn't charged for money the admin collected in the office.
      const { data: adminPayments } = await supabase
        .from('payments')
        .select('total_amount, is_transfer')
        .in('route_id', routeIds)
        .eq('device_id', 'admin_panel')
        .gte('collected_at', todayStart)
        .lte('collected_at', todayEnd);

      let officeCash = 0;
      let officeTransfers = 0;
      if (adminPayments) {
        for (const p of adminPayments) {
           if (p.is_transfer) officeTransfers += p.total_amount;
           else officeCash += p.total_amount;
        }
      }
      localSettings.push({ key: `office_cash_${today}`, value: officeCash });
      localSettings.push({ key: `office_transfers_${today}`, value: officeTransfers });

      // Check if day is already closed by admin liquidation
      const { data: closings } = await supabase
        .from('daily_closings')
        .select('is_closed')
        .in('route_id', routeIds)
        .eq('closing_date', today);

      let isClosedOnServer = false;
      let hasServerRecord = false;

      if (closings && closings.length > 0) {
        hasServerRecord = true;
        if (closings[0].is_closed) {
          isClosedOnServer = true;
          localSettings.push({ key: `day_closed_${today}`, value: true });
        }
      }

      // Retrieve local settings we MUST preserve (like transfer proofs generated offline today)
      const existingSettings = await db.settings.toArray();
      const settingsToKeep = existingSettings.filter(s => {
        if (s.key.startsWith('transfer_')) return true;
        if (s.key.startsWith('day_closed_')) {
          // If the server explicitly has a record but it's NOT closed, it means admin reopened it.
          // So we discard the local closed setting.
          if (hasServerRecord && !isClosedOnServer) return false;
          return true;
        }
        return false;
      });

      // -----------------------------------------------------------------------
      // SAFE MERGE: Identify records protected by pending sync operations.
      //
      // Records created offline (NEW_LOAN_BUNDLE, LOAN) must NOT be deleted
      // from the local DB during a pull, even if the server hasn't received them
      // yet (push may have failed or is still retrying).
      // -----------------------------------------------------------------------
      const pendingOps = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'failed', 'syncing'])
        .toArray();

      const protectedClientIds = new Set<string>();
      const protectedLoanIds = new Set<string>();
      const protectedInstLoanIds = new Set<string>(); // loan_id of installments to keep

      for (const op of pendingOps) {
        try {
          if (op.operation_type === 'NEW_LOAN_BUNDLE') {
            if (op.payload?.client?.id) protectedClientIds.add(op.payload.client.id);
            if (op.payload?.loan?.id) {
              protectedLoanIds.add(op.payload.loan.id);
              protectedInstLoanIds.add(op.payload.loan.id);
            }
          } else if (op.operation_type === 'LOAN') {
            if (op.payload?.clientId) protectedClientIds.add(op.payload.clientId);
            if (op.payload?.loanId) {
              protectedLoanIds.add(op.payload.loanId);
              protectedInstLoanIds.add(op.payload.loanId);
            }
          } else if (op.operation_type === 'PAYMENT_BUNDLE' || op.operation_type === 'PAYMENT') {
            const lId = op.payload?.loanId ?? op.payload?.loan_id ?? op.payload?.payment?.loanId;
            if (lId) protectedLoanIds.add(lId);
          } else if ((op.operation_type as string) === 'UPDATE_CLIENT') {
            if (op.payload?.client?.id) protectedClientIds.add(op.payload.client.id);
          }
        } catch (parseErr) {
          console.warn('[SyncService] Could not parse pending op for protection check:', op.operation_id, parseErr);
        }
      }

      const serverClientIds = new Set(((clients || []) as { id: string }[]).map(c => c.id));
      const serverLoanIds   = new Set(((loans   || []) as { id: string }[]).map(l => l.id));
      const serverInstIds   = new Set(((installments || []) as { id: string }[]).map(i => i.id));

      // Save to Dexie Transactionally using safe merge
      await db.transaction('rw', db.routes, db.clients, db.loans, db.installments, db.settings, async () => {

        // Routes: full replace (always managed server-side, no offline creation)
        await db.routes.clear();
        if (routes && routes.length > 0) await db.routes.bulkAdd(routes as any[]);

        // Clients: upsert server records, then remove stale non-protected ones
        if (clients && clients.length > 0) {
          await db.clients.bulkPut(clients as any[]);
        }
        const allLocalClients = await db.clients.toArray();
        const clientsToDelete = allLocalClients
          .filter(c => !serverClientIds.has(c.id) && !protectedClientIds.has(c.id))
          .map(c => c.id);
        if (clientsToDelete.length > 0) await db.clients.bulkDelete(clientsToDelete);

        // Loans: upsert server records, then remove stale non-protected ones
        if (loans && loans.length > 0) {
          await db.loans.bulkPut(loans as any[]);
        }
        const allLocalLoans = await db.loans.toArray();
        const loansToDelete = allLocalLoans
          .filter(l => !serverLoanIds.has(l.id) && !protectedLoanIds.has(l.id))
          .map(l => l.id);
        if (loansToDelete.length > 0) await db.loans.bulkDelete(loansToDelete);

        // Installments: upsert server records, then remove stale ones
        if (installments && installments.length > 0) {
          await db.installments.bulkPut(installments as any[]);
        }
        const allLocalInsts = await db.installments.toArray();
        const instsToDelete = allLocalInsts
          .filter(i => !serverInstIds.has(i.id) && !protectedInstLoanIds.has(i.loan_id))
          .map(i => i.id);
        if (instsToDelete.length > 0) await db.installments.bulkDelete(instsToDelete);

        // Settings: full replace, preserving offline-generated keys
        await db.settings.clear();
        if (localSettings.length > 0) await db.settings.bulkAdd(localSettings);
        // Use bulkPut to safely handle potential key collisions from settingsToKeep
        if (settingsToKeep.length > 0) await db.settings.bulkPut(settingsToKeep);
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
      
      let isClosedOnServer = false;
      let hasServerRecord = false;

      if (routeIdData.length > 0) {
        const activeRouteId = routeIdData[0].route_id;
        const { data: closings } = await supabase
          .from('daily_closings')
          .select('is_closed')
          .eq('route_id', activeRouteId)
          .eq('closing_date', today);

        if (closings && closings.length > 0) {
          hasServerRecord = true;
          if (closings[0].is_closed) {
            isClosedOnServer = true;
            localSettings.push({ key: `day_closed_${today}`, value: true });
          }
        }
      }

      // Retrieve local settings we MUST preserve
      const existingSettings = await db.settings.toArray();
      const settingsToKeep = existingSettings.filter(s => {
        if (s.key.startsWith('transfer_')) return true;
        if (s.key.startsWith('day_closed_')) {
          if (hasServerRecord && !isClosedOnServer) return false;
          return true;
        }
        return false;
      });

      // Reemplaza solo la tabla de settings en Dexie
      await db.transaction('rw', db.settings, async () => {
        await db.settings.clear();
        if (localSettings.length > 0) await db.settings.bulkAdd(localSettings);
        if (settingsToKeep.length > 0) await db.settings.bulkAdd(settingsToKeep);
      });
    } catch (error) {
      console.error('Error refreshing settings:', error);
    }
  }
}
