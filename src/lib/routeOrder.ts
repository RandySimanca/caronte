import { db } from '@/db/schema';

export const LAST_COLLECTED_KEY = 'last_collected_client';

interface RouteClientLike {
  id: string;
  full_name: string;
  route_order?: number | null;
}

export interface RouteOrderUpdate {
  id: string;
  route_order: number;
}

/** Orden de la ruta: primero route_order. Si hay empates en route_order y NO hay orden personalizado
 * (todos son 0 o null), mantener el orden original de la base de datos. Si sí hay orden personalizado,
 * usar nombre como desempate. */
export function sortByRouteOrder<T extends RouteClientLike>(clients: T[]): T[] {
  const hasCustomOrder = clients.some(c => c.route_order && c.route_order > 0);
  return [...clients].sort(
    (a, b) => {
      const orderDiff = (a.route_order ?? 999999) - (b.route_order ?? 999999);
      if (orderDiff !== 0) return orderDiff;
      // Si hay empate y NO hay orden personalizado en la lista, mantener orden original (usar índice)
      if (!hasCustomOrder) return 0;
      // Si hay empate pero SÍ hay orden personalizado en otros clientes, usar nombre como desempate
      return a.full_name.localeCompare(b.full_name);
    }
  );
}

/**
 * Guarda "por dónde va la ruta hoy": el último cliente cobrado o, si después se creó un cliente nuevo,
 * ese cliente nuevo (así varios préstamos seguidos quedan uno debajo del otro).
 * Se llama dentro de la transacción del cobro y de la creación del préstamo.
 */
export async function markLastCollected(clientId: string, date: string): Promise<void> {
  await db.settings.put({ key: LAST_COLLECTED_KEY, value: { client_id: clientId, date } });
}

/** Último cliente cobrado HOY (null si todavía no se ha cobrado a nadie o el dato es de otro día). */
export async function getLastCollectedToday(today: string): Promise<string | null> {
  const setting = await db.settings.get(LAST_COLLECTED_KEY);
  const value = setting?.value as { client_id?: string; date?: string } | undefined;
  return value && value.date === today && value.client_id ? value.client_id : null;
}

/**
 * Calcula dónde queda un cliente nuevo: justo después del último cobrado hoy
 * (si hoy aún no se cobró a nadie, al final de la ruta) y corre un puesto a los siguientes.
 *
 * Devuelve la posición del cliente nuevo y SOLO los clientes existentes cuyo orden cambia,
 * para sincronizar lo mínimo. La ruta queda numerada 0..N sin repetidos.
 */
export function insertAfterLastCollected<T extends RouteClientLike>(
  existing: T[],
  lastCollectedId: string | null
): { newClientOrder: number; updates: RouteOrderUpdate[] } {
  const sorted = sortByRouteOrder(existing);
  const lastIndex = lastCollectedId ? sorted.findIndex(c => c.id === lastCollectedId) : -1;
  const insertAt = lastIndex >= 0 ? lastIndex + 1 : sorted.length;

  const updates: RouteOrderUpdate[] = [];
  sorted.forEach((client, i) => {
    const newOrder = i < insertAt ? i : i + 1;
    if ((client.route_order || 0) !== newOrder) {
      updates.push({ id: client.id, route_order: newOrder });
    }
  });

  return { newClientOrder: insertAt, updates };
}
