/**
 * whatsapp.ts
 * Utilidades para generar enlaces "click to chat" de WhatsApp (wa.me).
 * No usa la Cloud API de Meta: el cobrador confirma el envío dentro de WhatsApp.
 */

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCop(amount: number): string {
  return COP_FORMATTER.format(amount);
}

/**
 * Limpia el número a solo dígitos y antepone el indicativo de Colombia (+57)
 * si el número tiene exactamente 10 dígitos (celular colombiano sin indicativo).
 * Retorna null si el número resultante tiene menos de 10 dígitos.
 *
 * NOTA: Para clientes de otros países, agregar lógica adicional aquí.
 */
export function normalizePhoneForWhatsApp(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;

  // Eliminar todo lo que no sea dígito
  const digits = rawPhone.replace(/\D/g, '');

  if (digits.length === 0) return null;

  // Celular colombiano sin indicativo (10 dígitos, empieza con 3xx)
  if (digits.length === 10) {
    return `57${digits}`;
  }

  // Ya incluye indicativo (>=11 dígitos) — devolver tal cual
  if (digits.length >= 11) {
    return digits;
  }

  // Número demasiado corto → inválido
  return null;
}

export interface CreditStatusMessageParams {
  clientName: string;
  amountPaidToday: number;
  currentBalance: number;      // Saldo del crédito DESPUÉS del pago
  arrearsAfterPayment: number; // Mora restante DESPUÉS del pago (0 = al día)
}

/**
 * Construye el mensaje de estado del crédito para enviar por WhatsApp.
 */
export function buildCreditStatusMessage({
  clientName,
  amountPaidToday,
  currentBalance,
  arrearsAfterPayment,
}: CreditStatusMessageParams): string {
  const firstName = clientName.split(' ')[0];
  const statusLine =
    arrearsAfterPayment <= 0
      ? '✅ *Estado: AL DÍA*'
      : `⚠️ *Estado: ATRASADO* — mora pendiente: ${formatCop(arrearsAfterPayment)}`;

  return (
    `Hola ${firstName} 👋, le confirmamos su pago:\n\n` +
    `💵 *Abono de hoy:* ${formatCop(amountPaidToday)}\n` +
    `📋 *Saldo total del crédito:* ${formatCop(currentBalance)}\n\n` +
    `${statusLine}\n\n` +
    `Gracias por su puntualidad 🙌`
  );
}

/**
 * Construye el enlace wa.me con el mensaje pre-cargado.
 * Retorna null si el teléfono no es válido.
 */
export function buildWhatsAppLink(rawPhone: string | null | undefined, message: string): string | null {
  const phone = normalizePhoneForWhatsApp(rawPhone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Abre WhatsApp en una pestaña nueva con el mensaje pre-cargado.
 * Retorna false si el teléfono no era válido (para mostrar alerta al usuario).
 */
export function openWhatsAppWithMessage(rawPhone: string | null | undefined, message: string): boolean {
  const link = buildWhatsAppLink(rawPhone, message);
  if (!link) return false;
  window.open(link, '_blank', 'noopener,noreferrer');
  return true;
}
