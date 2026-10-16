/**
 * Centralized SweetAlert2 helpers con tema personalizado para Caronte.
 * Usar estas funciones en lugar de window.confirm() o alert() para
 * mantener consistencia visual en toda la app.
 */
import Swal, { SweetAlertOptions } from 'sweetalert2';

// ─── Paleta de la app (alineada con Tailwind brand-* y slate-*) ──────────────
const BRAND = '#2563eb';    // blue-600
const DANGER = '#dc2626';   // red-600
const WARNING_BG = '#fef3c7'; // amber-100

// ─── Helpers principales ──────────────────────────────────────────────────────

/**
 * Diálogo de confirmación de peligro (eliminar, cerrar día, etc.)
 * Retorna `true` si el usuario confirmó, `false` si canceló.
 */
export async function confirmDanger(opts: {
  title: string;
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
}): Promise<boolean> {
  const result = await Swal.fire({
    title: opts.title,
    text: opts.text,
    html: opts.html,
    icon: 'warning',
    iconColor: DANGER,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'Sí, continuar',
    cancelButtonText: opts.cancelText ?? 'Cancelar',
    confirmButtonColor: DANGER,
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
    customClass: {
      popup: 'swal-caronte-popup',
      title: 'swal-caronte-title',
    },
  });
  return result.isConfirmed;
}

/**
 * Diálogo de confirmación estándar (acciones importantes pero no destructivas).
 * Retorna `true` si el usuario confirmó, `false` si canceló.
 */
export async function confirmAction(opts: {
  title: string;
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
}): Promise<boolean> {
  const result = await Swal.fire({
    title: opts.title,
    text: opts.text,
    html: opts.html,
    icon: 'question',
    iconColor: BRAND,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'Sí, continuar',
    cancelButtonText: opts.cancelText ?? 'Cancelar',
    confirmButtonColor: BRAND,
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
    customClass: {
      popup: 'swal-caronte-popup',
      title: 'swal-caronte-title',
    },
  });
  return result.isConfirmed;
}

/**
 * Diálogo de advertencia con info extra (operaciones sin sincronizar, etc.).
 * Retorna `true` si el usuario confirmó, `false` si canceló.
 */
export async function confirmWarning(opts: {
  title: string;
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  extraOptions?: SweetAlertOptions;
}): Promise<boolean> {
  const result = await Swal.fire({
    title: opts.title,
    text: opts.text,
    html: opts.html,
    icon: 'warning',
    iconColor: '#d97706',
    background: WARNING_BG,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'Sí, continuar',
    cancelButtonText: opts.cancelText ?? 'Cancelar',
    confirmButtonColor: '#d97706',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
    customClass: {
      popup: 'swal-caronte-popup',
      title: 'swal-caronte-title',
    },
    ...opts.extraOptions,
  });
  return result.isConfirmed;
}

/**
 * Muestra un error con SweetAlert
 */
export async function showError(opts: {
  title: string;
  text?: string;
  html?: string;
}): Promise<void> {
  await Swal.fire({
    title: opts.title,
    text: opts.text,
    html: opts.html,
    icon: 'error',
    iconColor: DANGER,
    confirmButtonText: 'Entendido',
    confirmButtonColor: DANGER,
    customClass: {
      popup: 'swal-caronte-popup',
      title: 'swal-caronte-title',
    },
  });
}

export { Swal };
