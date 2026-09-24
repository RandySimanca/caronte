import { db, type LocalLoan } from '@/db/schema';

export interface LotteryLastDraw {
  winning_number: string;
  draw_date: string;
  processed_at?: string;
  winner_loan_ids?: string[];
  winner_client_ids?: string[];
}

/** Normaliza número de boleta a 3 dígitos (ej. "42" → "042"). */
export function normalizeRaffleNumber(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits === '') return null;
  return digits.padStart(3, '0').slice(-3);
}

export function parseLotteryLastDraw(raw: unknown): LotteryLastDraw | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const winning = normalizeRaffleNumber(
    obj.winning_number != null ? String(obj.winning_number) : null
  );
  if (!winning) return null;
  return {
    winning_number: winning,
    draw_date: typeof obj.draw_date === 'string' ? obj.draw_date : '',
    processed_at: typeof obj.processed_at === 'string' ? obj.processed_at : undefined,
    winner_loan_ids: Array.isArray(obj.winner_loan_ids)
      ? obj.winner_loan_ids.filter((id): id is string => typeof id === 'string')
      : undefined,
    winner_client_ids: Array.isArray(obj.winner_client_ids)
      ? obj.winner_client_ids.filter((id): id is string => typeof id === 'string')
      : undefined,
  };
}

export async function getLotteryLastDraw(): Promise<LotteryLastDraw | null> {
  const setting = await db.settings.get('lottery_last_draw');
  return parseLotteryLastDraw(setting?.value);
}

/**
 * Indica si el préstamo ganó el último sorteo (por id o por número de boleta).
 */
export function isLotteryWinnerLoan(
  loan: Pick<LocalLoan, 'id' | 'raffle_number' | 'client_id' | 'status' | 'current_balance'>,
  draw: LotteryLastDraw | null
): boolean {
  if (!draw) return false;

  if (draw.winner_loan_ids?.includes(loan.id)) return true;
  if (draw.winner_client_ids?.includes(loan.client_id)) return true;

  const raffle = normalizeRaffleNumber(loan.raffle_number);
  return !!(raffle && raffle === draw.winning_number);
}

export function buildLotteryWinnerTellClientMessage(
  clientName: string,
  draw: LotteryLastDraw
): string {
  const dateLabel = draw.draw_date
    ? new Date(draw.draw_date + 'T00:00:00').toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'long',
      })
    : '';
  return `¡Felicitaciones${clientName ? ` ${clientName}` : ''}! Ganaste la lotería con el número ${draw.winning_number}${dateLabel ? ` (sorteo del ${dateLabel})` : ''}. Tu préstamo quedó pagado. Hoy no te cobramos.`;
}

/**
 * Aplica el resultado del sorteo en Dexie: salda préstamos ganadores locales
 * y marca sus cuotas como pagadas para que el cobrador no pueda cobrarles.
 */
export async function applyLotteryDrawLocally(draw: LotteryLastDraw | null): Promise<number> {
  if (!draw) return 0;

  const allLoans = await db.loans.toArray();
  const winners = allLoans.filter(loan => isLotteryWinnerLoan(loan, draw));
  if (winners.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;

  await db.transaction('rw', db.loans, db.installments, async () => {
    for (const loan of winners) {
      const needsLoanUpdate =
        loan.status !== 'CANCELADO' || Number(loan.current_balance) !== 0;

      if (needsLoanUpdate) {
        await db.loans.update(loan.id, {
          status: 'CANCELADO',
          current_balance: 0,
        });
        updated += 1;
      }

      const pending = await db.installments
        .where('loan_id')
        .equals(loan.id)
        .filter(i => ['PENDIENTE', 'PARCIAL', 'ATRASADA'].includes(i.status))
        .toArray();

      for (const inst of pending) {
        await db.installments.update(inst.id, {
          status: 'PAGADA',
          paid_amount: inst.scheduled_amount,
          balance: 0,
          paid_date: today,
        });
      }
    }
  });

  return updated;
}
