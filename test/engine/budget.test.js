import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboard, autoPostDue } from '../../js/engine/budget.js';
import { demoState, tx } from '../fixtures/demo.js';

const disp = (s, d) => computeDashboard(s, d).disponible;

test('libre y base del periodo', () => {
  const d = computeDashboard(demoState(), '2026-10-01');
  assert.equal(d.libre, 90000);
  assert.equal(d.base, 3000);
  assert.equal(d.D, 30);
  assert.equal(d.disponible, 3000);
});

test('si no gastas, se acumula', () => {
  const s = demoState();
  assert.equal(disp(s, '2026-10-02'), 6000);
  assert.equal(disp(s, '2026-10-04'), 12000);
  assert.equal(disp(s, '2026-10-30'), 90000);
});

test('gastar de más baja los días siguientes y dice cuándo te recuperas', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 10000, date: '2026-10-01', cat: 'comida' }));
  const d = computeDashboard(s, '2026-10-01');
  assert.equal(d.disponible, -7000);
  assert.equal(d.recovery, '2026-10-04');
  assert.equal(disp(s, '2026-10-04'), 2000);
});

test('compra con tarjeta cuenta el día que la haces y pagar la tarjeta no cuenta doble', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'ta', amount: 20000, date: '2026-10-01', cat: 'ropa' }));
  assert.equal(disp(s, '2026-10-01'), -17000);
  s.tx.push(tx({ type: 'transfer', account: 'banco', to: 'ta', amount: 220000, date: '2026-10-02' }));
  assert.equal(disp(s, '2026-10-02'), -14000);
  assert.equal(computeDashboard(s, '2026-10-02').statements.length, 0);
});

test('fijo ligado: solo afecta la diferencia contra lo planeado', () => {
  const s = demoState();
  const base = disp(s, '2026-10-15');
  s.tx.push(tx({ type: 'expense', account: 'ta', amount: 100000, date: '2026-10-15', planRef: 'fijo@2026-10-15' }));
  assert.equal(disp(s, '2026-10-15'), base);
  s.tx[0].amount = 109000;
  assert.equal(disp(s, '2026-10-15'), base - 9000);
});

test('bolsa de transporte: dentro de lo apartado no cambia, lo que exceda sí', () => {
  const s = demoState();
  for (let i = 1; i <= 10; i++) s.tx.push(tx({ type: 'expense', account: 'tc', amount: 2000, date: `2026-10-${String(i).padStart(2, '0')}`, cat: 'transporte' }));
  assert.equal(disp(s, '2026-10-10'), 30000);
  s.tx.push(tx({ type: 'expense', account: 'tc', amount: 45000, date: '2026-10-10', cat: 'transporte' }));
  assert.equal(disp(s, '2026-10-10'), 30000 - 5000);
});

test('ingreso menor al planeado o que no llega', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'income', account: 'efectivo', amount: 50000, date: '2026-10-03', planRef: 'semanal@2026-10-03' }));
  assert.equal(disp(s, '2026-10-03'), 9000 - 30000);
  const s2 = demoState();
  s2.settings.overdueGraceDays = 2;
  assert.equal(disp(s2, '2026-10-05'), 15000); // 2 días de gracia
  assert.equal(disp(s2, '2026-10-06'), 18000 - 80000);
  assert.ok(computeDashboard(s2, '2026-10-06').prompts.some((p) => p.id === 'semanal@2026-10-03' && p.status === 'overdue'));
});

test('sueldo que llega antes pertenece al siguiente periodo', () => {
  const s = demoState();
  const before = disp(s, '2026-10-30');
  s.tx.push(tx({ type: 'income', account: 'banco', amount: 1000000, date: '2026-10-30', planRef: 'sueldo@2026-10-31' }));
  assert.equal(disp(s, '2026-10-30'), before);
  const nov = computeDashboard(s, '2026-10-31');
  assert.equal(nov.period.s, '2026-10-31');
  assert.equal(nov.period.e, '2026-11-29');
  const s2 = demoState();
  s2.tx.push(tx({ type: 'income', account: 'banco', amount: 1000000, date: '2026-10-31', planRef: 'sueldo@2026-10-31' }));
  assert.equal(nov.libre, computeDashboard(s2, '2026-10-31').libre);
  assert.equal(nov.libre, computeDashboard(demoState(), '2026-10-31').libre);
});

test('repartir en los días que quedan', () => {
  const s = demoState();
  s.settings.rebases = ['2026-10-05'];
  const d = computeDashboard(s, '2026-10-05');
  assert.equal(d.D, 26);
  assert.equal(d.libre, 90000);
  assert.equal(d.disponible, Math.floor(90000 / 26));
});

test('conciliar: ajuste de saldo pega hoy', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'adjust', account: 'banco', amount: -15000, date: '2026-10-02' }));
  assert.equal(disp(s, '2026-10-02'), 6000 - 15000);
});

test('plan de pagos: adelanta el estado de cuenta si alcanza y respeta el piso', () => {
  const d = computeDashboard(demoState(), '2026-10-01');
  assert.equal(d.payPlan.length, 1);
  assert.deepEqual([d.payPlan[0].date, d.payPlan[0].amount], ['2026-10-01', 200000]);
  assert.ok(d.liquidity.min >= 30000);
});

test('plan de pagos: si no alcanza hoy, abona con cada entrada', () => {
  const s = demoState();
  s.accounts[0].opening = 100000; // banco con poco dinero
  s.accounts[3].opening = 700000;
  s.statements[0].amount = 700000;
  s.statements[0].due = '2026-10-29';
  const d = computeDashboard(s, '2026-10-01');
  const total = d.payPlan.reduce((a, p) => a + p.amount, 0);
  assert.equal(total, 700000);
  assert.ok(d.payPlan.length > 1);
  assert.ok(d.payPlan.every((p) => p.date <= '2026-10-29'));
});

test('payFrom: no se puede pagar antes del corte', () => {
  const s = demoState();
  s.statements[0].payFrom = '2026-10-05';
  const d = computeDashboard(s, '2026-10-01');
  assert.ok(d.payPlan.every((p) => p.date >= '2026-10-05'));
});

test('mensualidades MSI se cargan solas', () => {
  const s = demoState();
  s.schedules.push({ id: 'msi', kind: 'msi', name: 'MSI lentes', amount: 20556, account: 'tb', rule: { type: 'monthly', day: 27 }, autoPost: true });
  const posts = autoPostDue(s, '2026-10-28');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].planRef, 'msi@2026-10-27');
  assert.ok(!computeDashboard(s, '2026-10-28').prompts.some((p) => p.schedId === 'msi'));
});

test('antes de empezar el periodo muestra el día 1', () => {
  const d = computeDashboard(demoState(), '2026-09-30');
  assert.ok(d.period.notStarted);
  assert.equal(d.disponible, 3000);
});
