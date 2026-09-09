import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";
import { corsHeaders } from "../shared/cors.ts";
import { allocatePayment, InstallmentToPay } from "../shared/PaymentAllocator.ts";
import Decimal from "decimal.js";
import { format } from "date-fns";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const body = await req.json();
    const {
      operationId, // UUID generated on device
      deviceId,
      loanId,
      collectorId,
      routeId,
      totalAmount,
      collectorObservation,
      collectedAt,
    } = body;

    // 1. Idempotency Check
    const { data: existingPayment } = await supabaseClient
      .from('payments')
      .select('id')
      .eq('operation_id', operationId)
      .single();

    if (existingPayment) {
      // Return 200 OK because it was already processed successfully
      return new Response(JSON.stringify({ status: 'already_processed', id: existingPayment.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. Fetch loan and installments
    const { data: loan, error: loanError } = await supabaseClient
      .from('loans')
      .select('id, daily_installment, current_balance, client_id')
      .eq('id', loanId)
      .single();

    if (loanError) throw loanError;

    const { data: installments, error: installmentsError } = await supabaseClient
      .from('loan_installments')
      .select('id, installment_number, scheduled_date, balance, status')
      .eq('loan_id', loanId)
      .in('status', ['PENDIENTE', 'PARCIAL', 'ATRASADA'])
      .order('installment_number', { ascending: true });

    if (installmentsError) throw installmentsError;

    const todayDate = format(new Date(), 'yyyy-MM-dd'); // Assuming server timezone or passed from client

    // 3. Allocate Payment
    const distribution = allocatePayment(
      totalAmount,
      todayDate,
      installments as InstallmentToPay[],
      loan.daily_installment
    );

    // 4. Update Database (Needs RPC or careful sequential updates)
    // For simplicity in Edge function without RPC, we do it sequentially.
    // If we want atomic transaction, we should use a Postgres function via RPC.
    // Let's create the payment first.
    
    const paymentData = {
      operation_id: operationId,
      device_id: deviceId,
      loan_id: loanId,
      collector_id: collectorId,
      route_id: routeId,
      total_amount: distribution.totalReceived,
      day_installment_amount: distribution.dayInstallmentAmount,
      arrears_amount: distribution.arrearsAmount,
      advance_amount: distribution.advanceAmount,
      auto_observation: distribution.autoObservation,
      collector_observation: collectorObservation,
      is_partial_payment: distribution.totalReceived < loan.daily_installment && distribution.surplus < 0,
      is_advance_payment: distribution.advanceAmount > 0,
      is_above_expected: distribution.isSurplus,
      sync_status: 'synced',
      collected_at: collectedAt,
      synced_at: new Date().toISOString(),
      created_by: user.id
    };

    const { data: newPayment, error: paymentError } = await supabaseClient
      .from('payments')
      .insert(paymentData)
      .select()
      .single();

    if (paymentError) throw paymentError;

    // Insert allocations
    if (distribution.allocations.length > 0) {
      const allocationsToInsert = distribution.allocations.map(a => ({
        payment_id: newPayment.id,
        installment_id: a.installmentId,
        allocated_amount: a.allocatedAmount,
        allocation_type: a.allocationType,
      }));

      const { error: allocError } = await supabaseClient
        .from('payment_allocations')
        .insert(allocationsToInsert);

      if (allocError) throw allocError;

      // Update installments balance and status
      for (const alloc of distribution.allocations) {
        const newBalance = alloc.remainingBalance;
        let newStatus = 'PENDIENTE';
        if (newBalance === 0) newStatus = 'PAGADA';
        else if (newBalance > 0 && newBalance < loan.daily_installment) newStatus = 'PARCIAL'; // Could be ATRASADA if past due, handled by daily job

        await supabaseClient
          .from('loan_installments')
          .update({
            paid_amount: new Decimal(loan.daily_installment).minus(newBalance).toNumber(), // Simplification, should actually fetch old paid and add
            balance: newBalance,
            status: newStatus,
            paid_date: newBalance === 0 ? todayDate : null
          })
          .eq('id', alloc.installmentId);
      }
    }

    // Update loan balance
    const newLoanBalance = new Decimal(loan.current_balance).minus(distribution.totalReceived).toNumber();
    await supabaseClient
      .from('loans')
      .update({ current_balance: newLoanBalance })
      .eq('id', loanId);

    // Create Audit Log
    await supabaseClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'CREATE',
      entity: 'payments',
      entity_id: newPayment.id,
      new_value: newPayment,
      device_id: deviceId,
      reason: 'Registro de pago'
    });

    return new Response(JSON.stringify(newPayment), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
