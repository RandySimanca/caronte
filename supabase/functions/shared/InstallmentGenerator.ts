import Decimal from "decimal.js";
import { addDays, isSunday } from "date-fns";

export type DayType = 'NORMAL' | 'DOMINGO' | 'FESTIVO' | 'DOMINGO_FESTIVO';
export type InstallmentStatus = 'PENDIENTE' | 'PAGADA_ANTICIPADAMENTE';

export interface GeneratedInstallment {
  installment_number: number;
  scheduled_date: string; // YYYY-MM-DD
  scheduled_amount: number;
  balance: number;
  status: InstallmentStatus;
  day_type: DayType;
  is_prepaid: boolean;
  is_sunday: boolean;
  is_holiday: boolean;
}

export interface GeneratorParams {
  startDate: Date;
  termDays: number;
  dailyInstallment: number;
  sundaysPrepaidCount: number;
  holidays: Set<string>; // YYYY-MM-DD format
}

export function generateInstallments({
  startDate,
  termDays,
  dailyInstallment,
  sundaysPrepaidCount,
  holidays,
}: GeneratorParams): GeneratedInstallment[] {
  const installments: GeneratedInstallment[] = [];
  let prepaidSundaysAllocated = 0;

  for (let i = 1; i <= termDays; i++) {
    // start date counts as day 1 or day 0? Usually, start date is the first day of collection
    // Wait, typically day 1 is the day after disbursement. Let's assume startDate is the first collection day.
    // We'll use i - 1 to start from startDate
    const currentDate = addDays(startDate, i - 1);
    const dateStr = currentDate.toISOString().split("T")[0];

    const isSun = isSunday(currentDate);
    const isHol = holidays.has(dateStr);

    let dayType: DayType = 'NORMAL';
    if (isSun && isHol) dayType = 'DOMINGO_FESTIVO';
    else if (isSun) dayType = 'DOMINGO';
    else if (isHol) dayType = 'FESTIVO';

    let isPrepaid = false;
    let status: InstallmentStatus = 'PENDIENTE';
    let balance = dailyInstallment;
    let paidAmount = 0;

    if (isSun && prepaidSundaysAllocated < sundaysPrepaidCount) {
      isPrepaid = true;
      status = 'PAGADA_ANTICIPADAMENTE';
      balance = 0;
      paidAmount = dailyInstallment;
      prepaidSundaysAllocated++;
    }

    installments.push({
      installment_number: i,
      scheduled_date: dateStr,
      scheduled_amount: dailyInstallment,
      balance: balance,
      status: status,
      day_type: dayType,
      is_prepaid: isPrepaid,
      is_sunday: isSun,
      is_holiday: isHol,
    });
  }

  // Si se pidieron prepagar más domingos de los que existen en el calendario, lanzamos error
  if (prepaidSundaysAllocated < sundaysPrepaidCount) {
    throw new Error(`El calendario solo tiene ${prepaidSundaysAllocated} domingos, pero se intentó prepagar ${sundaysPrepaidCount}.`);
  }

  return installments;
}
