// Casos de la revisión completa (bugs encontrados y arreglados) y de la versión para todo público.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboard } from '../../js/engine/budget.js';
import { parseAmount } from '../../js/engine/money.js';
import { parseNotification, parseCaptureLines, resolveAccount, findCaptureDuplicate, parseIntent } from '../../js/engine/quickadd.js';
import { periodFor, suggestFirstEnd } from '../../js/engine/periods.js';
import { expandSchedules } from '../../js/engine/schedule.js';
import { buildState } from '../../js/engine/setup.js';
import { billsFor } from '../../js/engine/cards.js';
import { balancesAt, indexAccounts } from '../../js/engine/ledger.js';
import { demoState, tx } from '../fixtures/demo.js';

const bills = (s, today) => billsFor(s, indexAccounts(s), balancesAt(s, today), today).filter((b) => b.card === 'ta' && b.remaining > 0);

test('montos: punto inicial y coma decimal', () => {
  assert.equal(parseAmount('.50'), 50);
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('1,234.50'), 123450);
  assert.equal(parseAmount('$1,234'), 123400);
});

test('notificaciones: saldo vs compra, recibos, metro', () => {
  assert.equal(parseNotification('Tu saldo disponible es $3,400.00 tras tu compra de $120.00 en OXXO').amount, 12000);
  assert.equal(parseNotification('Compra aprobada por $250.00 en Recibos Telmex').amount, 25000);
  assert.equal(parseNotification('Compraste $90 en METROPOLIS CAFE').cat, null);
  const w = parseNotification('$45.00 con Visa •••• 1234', { title: 'OXXO' });
  assert.deepEqual([w.amount, w.merchant, w.last4], [4500, 'OXXO', '1234']);
  assert.equal(parseNotification('$45.00 con Visa', { title: '{not_title}' }).merchant, 'Visa');
});

test('atajo de iPhone: varias líneas, ids estables', () => {
  const a = parseCaptureLines('otra cosa\nFB|MX$123.40|Starbucks|Nu|5 oct\nFB|$5.00|Metro|Nu|5 oct 2');
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].amount, a[1].cat], [12340, 'transporte']);
  assert.equal(parseCaptureLines('FB|MX$123.40|Starbucks|Nu|5 oct')[0].extId, a[0].extId);
});

test('cuenta por últimos 4 dígitos o por nombre', () => {
  const accs = [{ id: 'a', name: 'Nu', type: 'card' }, { id: 'b', name: 'BBVA', type: 'bank', last4: '1234' }, { id: 'c', name: 'Vieja', type: 'card', archived: true, last4: '9999' }];
  assert.equal(resolveAccount(accs, { last4: '1234' }), 'b');
  assert.equal(resolveAccount(accs, { text: 'Starbucks Nu' }), 'a');
  assert.equal(resolveAccount(accs, { text: 'Numero' }), null);
  assert.equal(resolveAccount(accs, { last4: '9999' }), null);
});

test('la misma compra de Wallet y del banco cuenta una vez; dos pasajes iguales sí cuentan', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const txs = [{ id: 'w', type: 'expense', amount: 500, date: '2026-10-05', account: 'nu', via: 'wallet', seenBy: ['wallet'], ts: now - 60e3 }];
  const t = { type: 'expense', amount: 500, date: '2026-10-05', account: 'nu' };
  assert.equal(findCaptureDuplicate(txs, t, 'bank', now)?.id, 'w');
  assert.equal(findCaptureDuplicate(txs, t, 'wallet', now), null);
  txs[0].seenBy.push('bank');
  assert.equal(findCaptureDuplicate(txs, t, 'bank', now), null);
  assert.equal(findCaptureDuplicate(txs, t, 'bank', now + 4 * 3600e3), null);
});

test('captura por URL: via y título', () => {
  const r = parseIntent(new URLSearchParams('raw=%2445.00%20con%20Visa%20%E2%80%A2%E2%80%A2%E2%80%A2%E2%80%A2%201234&t=OXXO&via=wallet&k=tok123'), demoState().settings);
  assert.deepEqual([r.via, r.tx.desc, r.last4, r.tx.src, r.trusted], ['wallet', 'OXXO', '1234', 'capture', true]);
});

test('periodos por quincena, semana y cada 2 semanas', () => {
  const base = { firstStart: '2026-10-01', firstEnd: '2026-10-14' };
  const q = { ...base, payCycle: { type: 'semimonthly' } };
  assert.deepEqual([periodFor(q, '2026-10-20').s, periodFor(q, '2026-10-20').e], ['2026-10-15', '2026-10-30']);
  assert.deepEqual([periodFor(q, '2026-11-02').s, periodFor(q, '2026-11-02').e], ['2026-10-31', '2026-11-14']);
  const wk = { ...base, payCycle: { type: 'weekly', weekday: 5 } };
  assert.equal(periodFor(wk, '2026-10-20').D, 7);
  assert.equal(suggestFirstEnd({ type: 'monthly', day: 'last' }, '2026-10-28'), '2026-11-29');
  const b = expandSchedules([{ id: 'x', kind: 'income', amount: 1, rule: { type: 'biweekly', anchor: '2026-10-02' } }], '2026-10-01', '2026-10-31');
  assert.deepEqual(b.map((i) => i.date), ['2026-10-02', '2026-10-16', '2026-10-30']);
  const sm = expandSchedules([{ id: 'x', kind: 'income', amount: 1, rule: { type: 'semimonthly' } }], '2026-02-01', '2026-02-28');
  assert.deepEqual(sm.map((i) => i.date), ['2026-02-15', '2026-02-28']);
});

test('asistente: arma cuentas, tarjeta con lo que falta del corte y periodos', () => {
  const s = buildState({
    accounts: [{ key: 'a1', name: 'Banco', type: 'bank', balance: '5000' }, { key: 'a2', name: '', type: 'cash', balance: '' }],
    cards: [{ key: 'c1', name: 'Tarjeta X', owed: '1000', limit: '10000', cutDay: '20', dueDay: '10', statement: '300', last4: '4321' }],
    incomes: [{ name: 'Sueldo', amount: '6000', freq: 'semimonthly', account: 'a1' }],
    fixed: [{ name: 'Internet', amount: '400', freq: 'monthly', day: '10', account: 'c1', autoPost: true }],
    transport: { rate: '20', account: 'a1', weekdays: 'lv' },
  }, '2026-10-01', 'tok');
  assert.deepEqual(s.accounts.map((a) => [a.id, a.type, a.opening]), [['banco', 'bank', 500000], ['tarjeta-x', 'card', 100000], ['efectivo', 'cash', 0], ['ahorro', 'savings', 0]]);
  assert.deepEqual(s.statements.map((x) => [x.amount, x.due]), [[30000, '2026-10-12']]); // corte 20-sep → límite 10-oct (sábado) → lunes 12
  assert.deepEqual(s.settings.payCycle, { type: 'semimonthly' });
  assert.equal(s.settings.firstEnd, '2026-10-14');
  assert.equal(s.schedules.find((x) => x.name === 'Internet').account, 'tarjeta-x');
  assert.deepEqual(s.settings.transport.weekdays, [1, 2, 3, 4, 5]);
  const d = computeDashboard(s, '2026-10-01');
  assert.ok(d.base > 0);
  assert.equal(d.statements.reduce((a, x) => a + x.remaining, 0), 100000);
});

test('el colchón mínimo no se reparte (persona nueva no ve $0 toda la semana)', () => {
  const s = buildState({ accounts: [{ name: 'Banco', type: 'bank', balance: '1000' }] }, '2026-10-01', 't');
  s.settings.liquidityFloor = 30000;
  const d = computeDashboard(s, '2026-10-01');
  assert.equal(d.reserve, 30000);
  assert.ok(d.safeToSpend > 0);
  assert.equal(d.safeToSpend, d.disponible);
});

test('sin apartado de transporte, la gasolina sí baja tu número', () => {
  const s = demoState();
  s.settings.transport.rate = 0;
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 50000, date: '2026-10-01', cat: 'transporte', desc: 'Gasolina' }));
  const d = computeDashboard(s, '2026-10-01');
  assert.equal(d.todaySpent, 50000);
});

test('un pago programado a futuro sigue en la proyección de liquidez', () => {
  const s = demoState();
  s.settings.payStrategy = 'due';
  s.schedules.push({ id: 'renta', kind: 'fixed', name: 'Renta', amount: 500000, account: 'banco', rule: { type: 'monthly', day: 20 } });
  const before = computeDashboard(s, '2026-10-01').liquidity.min;
  s.tx.push(tx({ type: 'expense', account: 'banco', amount: 500000, date: '2026-10-20', desc: 'Renta', planRef: 'renta@2026-10-20' }));
  assert.equal(computeDashboard(s, '2026-10-01').liquidity.min, before);
});

test('estado de cuenta viejo sin pagar + corte nuevo: no se cobra el pago dos veces', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'ta', amount: 50000, date: '2026-10-20', cat: 'ropa' }));
  s.tx.push(tx({ type: 'transfer', account: 'banco', to: 'ta', amount: 100000, date: '2026-11-05' }));
  const b = bills(s, '2026-11-06');
  assert.equal(b.reduce((a, x) => a + x.remaining, 0), 150000);
});

test('estado de cuenta capturado días después del corte cuenta el pago hecho en medio', () => {
  const s = demoState();
  s.statements = [];
  s.tx.push(tx({ type: 'transfer', account: 'banco', to: 'ta', amount: 50000, date: '2026-10-06' }));
  s.statements.push({ id: 's2', card: 'ta', amount: 200000, due: '2026-10-26', createdAt: '2026-10-08' });
  const b = bills(s, '2026-10-08');
  assert.equal(b.find((x) => x.id === 's2').remaining, 150000);
});
