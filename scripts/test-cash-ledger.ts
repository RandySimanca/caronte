// Prueba rápida de las reglas de la cuenta de efectivo. Ejecutar con: npx tsx scripts/test-cash-ledger.ts
import assert from 'node:assert/strict';
import {
  computeBalances, sobrantePending, pendingSobrantes, wouldGoNegative, computeDifference,
  daysBetween, isLateClarification, parseLateDays, dependentsOf, type LedgerEntry, type LedgerKind,
} from '../src/lib/cashLedger';

let n = 0;
const mk = (kind: LedgerKind, amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: `e${++n}`, collector_id: 'c1', route_id: 'r1', closing_id: null, kind, amount,
  movement_date: '2026-10-29', method: null, related_id: null, payment_id: null, note: null,
  is_late: false, created_by: null, created_at: `2026-10-29T10:00:0${n % 10}Z`,
  voided_at: null, voided_by: null, void_reason: null, ...extra,
});

// Diferencia: negativo = faltante, positivo = sobrante, tolera decimales del esperado
assert.equal(computeDifference(500000, 480000), -20000);
assert.equal(computeDifference(500000, 530000), 30000);
assert.equal(computeDifference(100000.333333, 100000), 0);
assert.equal(Object.is(computeDifference(1000, 1000), -0), false);

// Faltante + reposición parcial + reposición final
const f = mk('FALTANTE', 20000);
let rows = [f, mk('REPOSICION', 10000)];
assert.deepEqual(computeBalances(rows), { debt: 10000, surplus: 0 });
rows.push(mk('REPOSICION', 10000));
assert.deepEqual(computeBalances(rows), { debt: 0, surplus: 0 });

// Sobrante aclarado por partes con cobros de clientes
const s = mk('SOBRANTE', 30000);
rows = [s];
assert.equal(sobrantePending(s, rows), 30000);
rows.push(mk('APLICACION_SOBRANTE', 20000, { related_id: s.id }));
assert.equal(sobrantePending(s, rows), 10000);
assert.deepEqual(computeBalances(rows), { debt: 0, surplus: 10000 });
assert.equal(pendingSobrantes(rows).length, 1);
assert.equal(dependentsOf(s, rows).length, 1);

// Un movimiento anulado no cuenta
const app = rows[1];
app.voided_at = '2026-10-30T00:00:00Z';
assert.equal(sobrantePending(s, rows), 30000);
assert.equal(dependentsOf(s, rows).length, 0);

// Compensación: baja faltante y sobrante a la vez
const f2 = mk('FALTANTE', 15000);
const s2 = mk('SOBRANTE', 5000);
rows = [f2, s2, mk('COMPENSACION', 5000, { related_id: s2.id })];
assert.deepEqual(computeBalances(rows), { debt: 10000, surplus: 0 });
assert.equal(pendingSobrantes(rows).length, 0);

// Reabrir un día con faltante ya repuesto dejaría la deuda en negativo
const f3 = mk('FALTANTE', 20000);
rows = [f3, mk('REPOSICION', 20000)];
assert.equal(wouldGoNegative(rows, [f3.id]), true);
assert.equal(wouldGoNegative(rows, []), false);

// Plazo
assert.equal(daysBetween('2026-10-29', '2026-11-05'), 7);
assert.equal(isLateClarification('2026-10-29', '2026-11-05', 7), false);
assert.equal(isLateClarification('2026-10-29', '2026-11-06', 7), true);
assert.equal(parseLateDays(7), 7);
assert.equal(parseLateDays('10'), 10);
assert.equal(parseLateDays(null), 7);
assert.equal(parseLateDays('abc'), 7);
assert.equal(parseLateDays(''), 7);
assert.equal(parseLateDays(0), 0);

console.log('OK: cashLedger');
