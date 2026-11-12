import { differenceInCalendarDays, format } from 'date-fns';
import { db } from '@/db/schema';
import { supabase } from '@/lib/supabase';
import { colombiaDateFromIso } from '@/lib/dailyCollection';

/** Lo mínimo que se necesita de una cuota para saber cuándo se pagó. */
type CuotaConPago = {
  paid_amount?: number | string | null;
  paid_date?: string | null;
  is_prepaid?: boolean | null;
};

/**
 * Fecha (YYYY-MM-DD) del último pago registrado en un préstamo, o null si no ha pagado nada.
 *
 * Se calcula con las cuotas que ya están en el celular (funciona sin internet):
 * la fecha más reciente de `paid_date` entre las cuotas con dinero abonado.
 * Se ignoran las cuotas prepagadas (domingos descontados): su fecha es la del desembolso, no un pago.
 */
export function obtenerFechaUltimoPago(cuotas: CuotaConPago[]): string | null {
  let ultimaFecha: string | null = null;
  for (const cuota of cuotas) {
    if (cuota.is_prepaid) continue;
    if (!(Number(cuota.paid_amount || 0) > 0)) continue;
    if (!cuota.paid_date) continue;
    const fecha = String(cuota.paid_date).slice(0, 10);
    if (!ultimaFecha || fecha > ultimaFecha) ultimaFecha = fecha;
  }
  return ultimaFecha;
}

/** Ej: "12/11/2026 · hoy", "11/11/2026 · ayer", "05/11/2026 · hace 7 días". */
export function textoFechaUltimoPago(fecha: string, hoy: string = format(new Date(), 'yyyy-MM-dd')): string {
  const [anio, mes, dia] = fecha.split('-');
  const fechaLegible = `${dia}/${mes}/${anio}`;
  const dias = differenceInCalendarDays(new Date(hoy + 'T12:00:00'), new Date(fecha + 'T12:00:00'));
  if (dias === 0) return `${fechaLegible} · hoy`;
  if (dias === 1) return `${fechaLegible} · ayer`;
  if (dias > 1) return `${fechaLegible} · hace ${dias} días`;
  return fechaLegible;
}

/** Prefijo de la clave local donde se recuerda el último pago de cada préstamo (se conserva al sincronizar). */
export const PREFIJO_ULTIMO_PAGO = 'ultimo_pago_';

export interface UltimoPagoGuardado {
  /** Fecha del pago, YYYY-MM-DD (hora de Colombia). */
  fecha: string;
  /** Valor total del pago. */
  monto: number;
  /** Momento exacto del cobro (ISO); sirve para saber cuál pago es más reciente. */
  cobradoEn: string;
}

export function claveUltimoPago(prestamoId: string): string {
  return `${PREFIJO_ULTIMO_PAGO}${prestamoId}`;
}

/** Guarda el último pago en el celular, solo si es más reciente que el que ya estaba guardado. */
export async function guardarUltimoPago(prestamoId: string, pago: UltimoPagoGuardado): Promise<void> {
  const actual = await db.settings.get(claveUltimoPago(prestamoId));
  const anterior = actual?.value as UltimoPagoGuardado | undefined;
  if (anterior?.cobradoEn && anterior.cobradoEn > pago.cobradoEn) return;
  await db.settings.put({ key: claveUltimoPago(prestamoId), value: pago });
}

/**
 * Consulta en el servidor el último pago del préstamo y lo guarda en el celular.
 * Sin internet o si falla, no hace nada (se sigue mostrando lo que ya hay en el celular).
 */
export async function actualizarUltimoPagoDesdeServidor(prestamoId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('total_amount, collected_at')
      .eq('loan_id', prestamoId)
      .order('collected_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.collected_at) return;
    await guardarUltimoPago(prestamoId, {
      fecha: colombiaDateFromIso(String(data.collected_at)),
      monto: Math.round(Number(data.total_amount || 0)),
      cobradoEn: String(data.collected_at),
    });
  } catch (e) {
    console.warn('[ultimoPago] No se pudo consultar el último pago:', e);
  }
}
