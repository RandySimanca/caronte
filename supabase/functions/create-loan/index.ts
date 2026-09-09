import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "supabase";
import { corsHeaders } from "../shared/cors.ts";
import Decimal from "decimal.js";
import { generateInstallments } from "../shared/InstallmentGenerator.ts";
import { addDays } from "date-fns";

serve(async (req: Request) => {
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
      clientId,
      routeId,
      amountRequested,
      termDays,
      frequency,
      sundaysPrepaidCount,
      receiptFee,
      disbursementDate, // YYYY-MM-DD
    } = body;

    // TODO: Verify if the client already has an active loan
    const { data: existingLoans, error: existingError } = await supabaseClient
      .from('loans')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'ACTIVO');

    if (existingError) throw existingError;
    if (existingLoans && existingLoans.length > 0) {
      throw new Error('El cliente ya tiene un préstamo activo');
    }

    // 1. Cálculos Financieros Exactos (Regla 1)
    const reqAmount = new Decimal(amountRequested);
    const rate = new Decimal(0.2000);
    const interestAmount = reqAmount.times(rate);
    const initialObligation = reqAmount.plus(interestAmount);

    // Cuota diaria exacta sin redondeo (Regla 1)
    const dailyInstallment = initialObligation.dividedBy(termDays);

    const sundaysPrepaidAmount = dailyInstallment.times(sundaysPrepaidCount);
    const amountDelivered = reqAmount.minus(sundaysPrepaidAmount).minus(receiptFee);

    const start = addDays(new Date(disbursementDate), 1); // El cobro empieza al día siguiente

    // 2. Obtener festivos de la base de datos para el periodo
    const { data: holidaysData } = await supabaseClient
      .from('holidays')
      .select('holiday_date')
      .eq('active', true)
      .gte('holiday_date', start.toISOString().split('T')[0])
      .lte('holiday_date', addDays(start, termDays + 15).toISOString().split('T')[0]); // Margen extra

    const holidays = new Set(
      (holidaysData || []).map((h: { holiday_date: string }) => h.holiday_date)
    );

    // 3. Generar el calendario completo
    const installments = generateInstallments({
      startDate: start,
      termDays,
      dailyInstallment: dailyInstallment.toNumber(),
      sundaysPrepaidCount,
      holidays,
    });

    const endDate = installments[installments.length - 1].scheduled_date;
    const graceEndDate = addDays(new Date(endDate), 7).toISOString().split('T')[0];

    // 4. Guardar préstamo (Transacción no es nativa vía HTTP REST, pero lo haremos con RPC o en 2 pasos con verificación)
    // Para Edge Functions, la mejor práctica para transacciones es usar una función RPC en PostgreSQL
    // Pero como estamos validando aquí, creamos el loan y luego los installments. Si falla, RLS / cascade manejan o hacemos compensación.

    const loanData = {
      client_id: clientId,
      route_id: routeId,
      collector_id: user.id,
      amount_requested: reqAmount.toNumber(),
      interest_rate: rate.toNumber(),
      interest_amount: interestAmount.toNumber(),
      initial_obligation: initialObligation.toNumber(),
      term_days: termDays,
      daily_installment: dailyInstallment.toNumber(),
      frequency,
      sundays_prepaid_count: sundaysPrepaidCount,
      sundays_prepaid_amount: sundaysPrepaidAmount.toNumber(),
      receipt_fee: receiptFee,
      amount_delivered: amountDelivered.toNumber(),
      current_balance: initialObligation.minus(sundaysPrepaidAmount).toNumber(),
      disbursement_date: disbursementDate,
      start_date: start.toISOString().split('T')[0],
      end_date: endDate,
      grace_end_date: graceEndDate,
      status: 'ACTIVO',
      created_by: user.id
    };

    const { data: newLoan, error: loanError } = await supabaseClient
      .from('loans')
      .insert(loanData)
      .select()
      .single();

    if (loanError) throw loanError;

    // 5. Guardar cuotas
    const installmentsToInsert = installments.map(inst => ({
      ...inst,
      loan_id: newLoan.id,
    }));

    const { error: installmentsError } = await supabaseClient
      .from('loan_installments')
      .insert(installmentsToInsert);

    if (installmentsError) {
      // Compensación (rollback manual)
      await supabaseClient.from('loans').delete().eq('id', newLoan.id);
      throw installmentsError;
    }

    // 6. Auditoría
    await supabaseClient.from('audit_logs').insert({
      user_id: user.id,
      action: 'CREATE',
      entity: 'loans',
      entity_id: newLoan.id,
      new_value: newLoan,
      reason: 'Creación normal de préstamo'
    });

    return new Response(JSON.stringify(newLoan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});