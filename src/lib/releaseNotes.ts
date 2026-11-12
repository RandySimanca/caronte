/**
 * Aviso de novedades que se muestra UNA sola vez a cada usuario en cada celular.
 *
 * Para publicar un aviso nuevo: cambia `id` (y el contenido). Quien ya vio el anterior
 * lo verá otra vez porque el id es distinto. Si no hay nada que anunciar, deja `RELEASE_NOTES = null`.
 */
export interface ReleaseNotes {
  /** Identificador único del aviso. Al cambiarlo, el aviso se vuelve a mostrar. */
  id: string;
  title: string;
  intro: string;
  items: { title: string; text: string }[];
}

export const RELEASE_NOTES: ReleaseNotes | null = {
  id: '2026-11-frecuencia-cobro',
  title: 'Novedad: frecuencia de cobro',
  intro: 'Ahora cada préstamo puede cobrarse todos los días o una vez por semana.',
  items: [
    {
      title: 'Al crear un préstamo',
      text: 'Elige si el cobro es Diario o Semanal. Si es semanal, elige también el día de la semana en que se cobra.',
    },
    {
      title: 'Colores por día en Mi Ruta',
      text: 'Cada cliente se marca con el color de su día de cobro. Los clientes diarios se pintan con el color del día de hoy.',
    },
    {
      title: 'Clientes semanales',
      text: 'Fuera de su día aparecen como "Cobra: <día>" y no cuentan como atrasados. En su día se cobra lo acumulado de la semana.',
    },
    {
      title: 'Detalle del cliente',
      text: 'Ahí ves la frecuencia, el día de cobro y si hoy le toca cobro.',
    },
  ],
};

const storageKey = (userId: string | undefined, id: string) => `release_notes_seen:${userId ?? 'anon'}:${id}`;

export function hasSeenReleaseNotes(userId: string | undefined, id: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId, id)) === '1';
  } catch {
    // Sin acceso a localStorage no se puede recordar: se muestra una sola vez por sesión (lo controla el componente)
    return false;
  }
}

export function markReleaseNotesSeen(userId: string | undefined, id: string): void {
  try {
    localStorage.setItem(storageKey(userId, id), '1');
  } catch {
    /* ignorar */
  }
}
