import Decimal from "decimal.js";

export type AllocationType = 'DIA_ACTUAL' | 'ATRASO' | 'ADELANTO' | 'PARCIAL';

export interface InstallmentToPay {
  id: string;
  installment_number: number;
  scheduled_date: string; // YYYY-MM-DD
  balance: number;
  status: 'PENDIENTE' | 'PARCIAL' | 'ATRASADA';
}

export interface Allocation {
  installmentId: string;
  installmentNumber: number;
  installmentDate: string;
  allocationType: AllocationType;
  allocatedAmount: number;
  remainingBalance: number;
}

export interface PaymentDistributionResult {
  totalReceived: number;
  expectedAmount: number;
  surplus: number;
  isSurplus: boolean;
  allocations: Allocation[];
  fullDaysCovered: number;
  autoObservation: string | null;
  dayInstallmentAmount: number;
  arrearsAmount: number;
  advanceAmount: number;
}

/**
 * Distribuye un pago recibido de acuerdo con las Reglas 2 y 3.
 * Primero cubre la cuota del día de hoy.
 * Luego cubre atrasos (cuotas vencidas).
 * Luego cubre cuotas futuras (adelantos).
 */
export function allocatePayment(
  totalReceived: number,
  todayDate: string, // YYYY-MM-DD
  pendingInstallments: InstallmentToPay[], // Debe venir ordenado por fecha/número ascendente
  dailyInstallment: number // Cuota exacta
): PaymentDistributionResult {
  let remainingMoney = new Decimal(totalReceived);
  const allocations: Allocation[] = [];
  let fullDaysCovered = 0;
  
  let dayInstallmentAmount = new Decimal(0);
  let arrearsAmount = new Decimal(0);
  let advanceAmount = new Decimal(0);

  // Determinar la cuota del día (si existe y está pendiente)
  const todayInstallment = pendingInstallments.find(i => i.scheduled_date === todayDate);
  const arrearsInstallments = pendingInstallments.filter(i => i.scheduled_date < todayDate);
  const futureInstallments = pendingInstallments.filter(i => i.scheduled_date > todayDate);

  // 1. Cubrir cuota del día actual
  if (todayInstallment && remainingMoney.greaterThan(0)) {
    const needed = new Decimal(todayInstallment.balance);
    const allocated = Decimal.min(remainingMoney, needed);
    
    allocations.push({
      installmentId: todayInstallment.id,
      installmentNumber: todayInstallment.installment_number,
      installmentDate: todayInstallment.scheduled_date,
      allocationType: 'DIA_ACTUAL',
      allocatedAmount: allocated.toNumber(),
      remainingBalance: needed.minus(allocated).toNumber(),
    });
    
    dayInstallmentAmount = dayInstallmentAmount.plus(allocated);
    remainingMoney = remainingMoney.minus(allocated);
    
    if (allocated.equals(needed)) {
      fullDaysCovered++;
    }
  }

  // 2. Cubrir Atrasos
  for (const arr of arrearsInstallments) {
    if (remainingMoney.lessThanOrEqualTo(0)) break;
    
    const needed = new Decimal(arr.balance);
    const allocated = Decimal.min(remainingMoney, needed);
    
    allocations.push({
      installmentId: arr.id,
      installmentNumber: arr.installment_number,
      installmentDate: arr.scheduled_date,
      allocationType: 'ATRASO',
      allocatedAmount: allocated.toNumber(),
      remainingBalance: needed.minus(allocated).toNumber(),
    });
    
    arrearsAmount = arrearsAmount.plus(allocated);
    remainingMoney = remainingMoney.minus(allocated);
    
    if (allocated.equals(needed)) {
      fullDaysCovered++;
    }
  }

  // 3. Cubrir Adelantos (cuotas futuras)
  for (const fut of futureInstallments) {
    if (remainingMoney.lessThanOrEqualTo(0)) break;
    
    const needed = new Decimal(fut.balance);
    const allocated = Decimal.min(remainingMoney, needed);
    
    allocations.push({
      installmentId: fut.id,
      installmentNumber: fut.installment_number,
      installmentDate: fut.scheduled_date,
      allocationType: 'ADELANTO',
      allocatedAmount: allocated.toNumber(),
      remainingBalance: needed.minus(allocated).toNumber(),
    });
    
    advanceAmount = advanceAmount.plus(allocated);
    remainingMoney = remainingMoney.minus(allocated);
    
    if (allocated.equals(needed)) {
      fullDaysCovered++;
    }
  }

  // Calculate expected amount (Today's quota + Arrears)
  const expectedToday = todayInstallment ? new Decimal(todayInstallment.balance) : new Decimal(0);
  const totalArrears = arrearsInstallments.reduce((acc, cur) => acc.plus(cur.balance), new Decimal(0));
  const totalExpected = expectedToday.plus(totalArrears);
  
  const surplus = new Decimal(totalReceived).minus(totalExpected);
  const isSurplus = surplus.greaterThan(0);

  let autoObservation = null;
  if (isSurplus) {
    autoObservation = `El cliente hizo un abono de $${totalReceived}, que corresponde a ${fullDaysCovered} días pagados.`;
  }

  return {
    totalReceived,
    expectedAmount: totalExpected.toNumber(),
    surplus: surplus.toNumber(),
    isSurplus,
    allocations,
    fullDaysCovered,
    autoObservation,
    dayInstallmentAmount: dayInstallmentAmount.toNumber(),
    arrearsAmount: arrearsAmount.toNumber(),
    advanceAmount: advanceAmount.toNumber(),
  };
}
