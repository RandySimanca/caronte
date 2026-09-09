import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formats a number to COP Currency
 * @param amount Number to format
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Formats a date string (ISO or YYYY-MM-DD) to a readable string
 * @param dateStr Date string
 * @param formatPattern pattern, defaults to 'dd MMM yyyy'
 * @returns Formatted date string
 */
export const formatDate = (dateStr: string, formatPattern: string = 'dd MMM yyyy'): string => {
  try {
    if (!dateStr) return '';
    const date = dateStr.includes('T') ? parseISO(dateStr) : new Date(dateStr + 'T00:00:00');
    return format(date, formatPattern, { locale: es });
  } catch (error) {
    return dateStr;
  }
};
