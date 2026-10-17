import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboard } from '../../js/engine/budget.js';
import { progressLog, progressSummary, levelOf, dayMark } from '../../js/engine/progress.js';
import { demoState, tx } from '../fixtures/demo.js';

// Periodo demo: 1-oct → 30-oct, base 30.00 al día.
const summary = (s, today) => {
  const log = progressLog(s, today);
  return { log, p: progressSummary(s, computeDashboard(s, today), log) };
};

test('cuenta regresiva al día de pago y día del periodo', () => {
  const { p } = summary(demoState(), '2026-10-18');
  assert.equal(p.payday, '2026-10-31');
  assert.equal(p.toPayday, 13);
  assert.equal(p.day, 18);
  assert.equal(p.days, 30);
  assert.equal(p.map.length, 30);
  assert.equal(p.map.find((x) => x.today).date, '2026-10-18');
});

test('marcas del día: sin gastos, menos que la base, usando lo acumulado y pasándote', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 2000, date: '2026-10-02', cat: 'comida' }));
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 5000, date: '2026-10-03', cat: 'comida' }));
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 9000, date: '2026-10-04', cat: 'comida' }));
  const { log } = summary(s, '2026-10-05');
  assert.deepEqual(log, { '2026-10-01': 'z', '2026-10-02': 'w', '2026-10-03': 'o', '2026-10-04': 'l' });
  // El 5 todavía vas abajo (gastaste 160 de 150); el 6 ya no, y si no gastas es un día sin gastos.
  assert.equal(dayMark(computeDashboard(s, '2026-10-05')), 'l');
  assert.equal(dayMark(computeDashboard(s, '2026-10-06')), 'z');
});

test('racha, puntos y logros', () => {
  const { p } = summary(demoState(), '2026-10-04');
  assert.equal(p.streak, 3);
  assert.equal(p.best, 3);
  const unlocked = p.badges.filter((b) => b.unlocked).map((b) => b.id);
  assert.deepEqual(unlocked, ['first', 'streak3', 'nospend']);
  assert.deepEqual(p.newBadges, unlocked);
  assert.equal(p.xp, 3 * 20 + 3 * 50);
  assert.equal(p.periodGreen, 3);
  assert.equal(p.periodClosed, 3);
});

test('pasarte rompe la racha, pero la mejor racha se queda', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 30000, date: '2026-10-05', cat: 'ropa' }));
  const { p } = summary(s, '2026-10-12');
  // 1-4 en verde; del 5 al 9 abajo (te recuperas el 10); 10 y 11 en verde otra vez.
  assert.equal(p.best, 4);
  assert.equal(p.streak, 2);
});

test('un logro ganado no se pierde aunque cambien los datos', () => {
  const s = demoState();
  s.progress.badges = { streak7: '2026-09-01' };
  const { p } = summary(s, '2026-10-02');
  assert.equal(p.badges.find((b) => b.id === 'streak7').unlocked, true);
  assert.ok(!p.newBadges.includes('streak7'));
});

test('los días de un periodo cerrado quedan fijos; los del periodo actual se recalculan', () => {
  const s = demoState();
  s.progress.log = { '2026-10-05': 'l', '2026-10-31': 'l' };
  const { log } = summary(s, '2026-11-02');
  assert.equal(log['2026-10-05'], 'l');
  assert.equal(log['2026-10-06'], 'z');
  assert.equal(log['2026-10-31'], 'z');
  assert.ok(!('2026-11-02' in log));
});

test('premio: por racha o por días en verde desde que lo pusiste', () => {
  const s = demoState();
  s.progress.reward = { text: 'Un helado', goal: 3, kind: 'streak', since: '2026-10-01' };
  let { p } = summary(s, '2026-10-03');
  assert.equal(p.reward.value, 2);
  assert.equal(p.reward.done, false);
  ({ p } = summary(s, '2026-10-04'));
  assert.equal(p.reward.done, true);
  // La racha que ya traías no cuenta: solo los días desde que pusiste el premio.
  s.progress.reward = { text: 'Un helado', goal: 3, kind: 'streak', since: '2026-10-03' };
  ({ p } = summary(s, '2026-10-04'));
  assert.equal(p.reward.value, 1);
  s.progress.reward = { text: 'Cine', goal: 5, kind: 'days', since: '2026-10-03' };
  ({ p } = summary(s, '2026-10-06'));
  assert.equal(p.reward.value, 3);
});

test('niveles', () => {
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(99).level, 1);
  assert.equal(levelOf(100).level, 2);
  assert.equal(levelOf(300).level, 3);
  assert.deepEqual([levelOf(250).from, levelOf(250).to], [100, 300]);
  assert.equal(levelOf(1e6).name, 'Leyenda');
});

test('antes de que empiece el plan solo hay cuenta regresiva', () => {
  const { p, log } = summary(demoState(), '2026-09-30');
  assert.equal(p.notStarted, true);
  assert.equal(p.startsIn, 1);
  assert.deepEqual(log, {});
});

test('lo apartado: cuánto queda del transporte y si alcanza; fijos pagados y por pagar', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'tc', amount: 2000, date: '2026-10-03', cat: 'transporte', desc: 'Metro', pool: true }));
  let d = computeDashboard(s, '2026-10-03');
  // 30 días de $20 = $600; gastaste $20 y ya usaste el de hoy: faltan 27 días (del 4 al 30).
  assert.deepEqual([d.transport.left, d.transport.days, d.transport.need], [58000, 27, 54000]);
  assert.equal(computeDashboard(s, '2026-10-04').transport.days, 27);
  assert.deepEqual([d.fixedPlan.pending, d.fixedPlan.paid, d.fixedPlan.n, d.fixedPlan.next.name], [100000, 0, 1, 'Suscripción']);
  s.tx.push(tx({ type: 'expense', account: 'ta', amount: 100000, date: '2026-10-15', cat: 'fijo', desc: 'Suscripción', planRef: 'fijo@2026-10-15' }));
  d = computeDashboard(s, '2026-10-16');
  assert.deepEqual([d.fixedPlan.pending, d.fixedPlan.paid, d.fixedPlan.n], [0, 100000, 0]);
});

test('logros: avance hacia la meta y el más cercano', () => {
  const { p } = summary(demoState(), '2026-10-03');
  const week = p.badges.find((b) => b.id === 'streak7');
  assert.deepEqual([week.value, week.goal, week.unlocked], [2, 7, false]);
  assert.equal(p.next.id, 'streak3');
  assert.equal(p.yesterday, 'z');
});
