/**
 * Préstamo vencido = sigue ACTIVO y su fecha final (end_date) ya pasó.
 * Días vencido = días calendario entre end_date y hoy (ambas YYYY-MM-DD, hora de Colombia).
 */
export function daysExpired(endDate?: string | null, today?: string | null): number {
  if (!endDate || !today) return 0;
  const toUtc = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, day || 1);
  };
  const diff = Math.round((toUtc(today) - toUtc(endDate)) / 86400000);
  return diff > 0 ? diff : 0;
}

export function expiredLabel(days: number): string {
  return days === 1 ? 'Venció hace 1 día' : `Venció hace ${days} días`;
}
