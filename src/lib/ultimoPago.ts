import { differenceInCalendarDays, format } from 'date-fns';

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
