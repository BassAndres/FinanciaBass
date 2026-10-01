import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboard, autoPostDue } from '../../js/engine/budget.js';
import { matchInstance } from '../../js/engine/quickadd.js';
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
  for (let i = 1; i <= 10; i++) s.tx.push(tx({ type: 'expense', account: 'tc', amount: 2000, date: `2026-10-${String(i).padStart(2, '0')}`, cat: 'transporte', desc: 'Metro' }));
  assert.equal(disp(s, '2026-10-10'), 30000);
  s.tx.push(tx({ type: 'expense', account: 'tc', amount: 45000, date: '2026-10-10', cat: 'transporte', pool: true }));
  assert.equal(disp(s, '2026-10-10'), 30000 - 5000);
});

test('un Uber con categoría transporte sí se descuenta (no sale de la bolsa)', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'tc', amount: 9000, date: '2026-10-01', cat: 'transporte', desc: 'Uber' }));
  assert.equal(disp(s, '2026-10-01'), 3000 - 9000);
  const d = computeDashboard(s, '2026-10-01');
  assert.equal(d.todaySpent, 9000);
  assert.equal(d.variableSpent, 9000);
});

test('desglose: acumulado − gastado − otros = disponible', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 1000, date: '2026-10-02', cat: 'comida' }));
  s.tx.push(tx({ type: 'adjust', account: 'banco', amount: -500, date: '2026-10-03' }));
  const d = computeDashboard(s, '2026-10-03');
  assert.equal(d.accrued - d.variableSpent - d.otherChanges, d.disponible);
  assert.equal(d.variableSpent, 1000);
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

test('registrar a mano algo planeado se liga y no se cuenta doble', () => {
  const s = demoState();
  const d0 = computeDashboard(s, '2026-10-03');
  // Dinero semanal registrado a mano (sin ligar explícitamente)
  const income = tx({ type: 'income', account: 'efectivo', amount: 80000, date: '2026-10-03', desc: 'me dio mi mamá' });
  const m = matchInstance(d0.instances, income);
  assert.equal(m.id, 'semanal@2026-10-03');
  s.tx.push({ ...income, planRef: m.id });
  assert.equal(disp(s, '2026-10-03'), d0.disponible);
  // Suscripción pagada con otra tarjeta pero con el mismo nombre
  const d1 = computeDashboard(s, '2026-10-15');
  const sub = tx({ type: 'expense', account: 'tb', amount: 100000, date: '2026-10-15', desc: 'Suscripción', cat: 'suscripciones' });
  assert.equal(matchInstance(d1.instances, sub)?.id, 'fijo@2026-10-15');
});

// ---- Regresiones de la revisión ----
test('un gasto normal parecido a un fijo NO se liga (súper $900 vs suscripción $1,000)', () => {
  const s = demoState();
  const d = computeDashboard(s, '2026-10-13');
  assert.equal(matchInstance(d.instances, { type: 'expense', account: 'ta', amount: 90000, date: '2026-10-13', desc: 'Super', cat: 'comida' }), null);
  assert.equal(matchInstance(d.instances, { type: 'expense', account: 'ta', amount: 100000, date: '2026-10-15', desc: '' })?.id, 'fijo@2026-10-15');
});

test('borrar un cargo automático no lo vuelve a registrar', () => {
  const s = demoState();
  s.schedules[2].autoPost = true;
  assert.equal(autoPostDue(s, '2026-10-16').length, 1);
  s.overrides['fijo@2026-10-15'] = { noAuto: true };
  assert.equal(autoPostDue(s, '2026-10-16').length, 0);
  assert.ok(computeDashboard(s, '2026-10-16').prompts.some((p) => p.id === 'fijo@2026-10-15'));
});

test('activar "se cobra solo" no registra meses pasados', () => {
  const s = demoState();
  s.settings.openingDate = '2026-07-01';
  Object.assign(s.schedules[2], { autoPost: true, autoSince: '2026-10-10' });
  assert.deepEqual(autoPostDue(s, '2026-10-20').map((x) => x.planRef), ['fijo@2026-10-15']);
});

test('eliminar una regla ya pagada: el pago cuenta como gasto normal', () => {
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'ta', amount: 100000, date: '2026-10-15', planRef: 'fijo@2026-10-15' }));
  s.schedules = s.schedules.filter((x) => x.id !== 'fijo');
  const ref = demoState();
  ref.schedules = ref.schedules.filter((x) => x.id !== 'fijo');
  ref.tx.push(tx({ type: 'expense', account: 'ta', amount: 100000, date: '2026-10-15' }));
  assert.equal(disp(s, '2026-10-16'), disp(ref, '2026-10-16'));
});

test('un cargo real reemplaza al automático (notificación del banco)', () => {
  const s = demoState();
  s.schedules[2].autoPost = true;
  for (const p of autoPostDue(s, '2026-10-15')) s.tx.push({ id: 'auto1', ...p });
  const d = computeDashboard(s, '2026-10-15');
  assert.equal(matchInstance(d.instances, { type: 'expense', account: 'ta', amount: 100000, date: '2026-10-15', desc: 'Suscripción' })?.id, 'fijo@2026-10-15');
});

test('periodo puente si el primero termina a medio mes', async () => {
  const { periodFor } = await import('../../js/engine/periods.js');
  const st = { firstStart: '2026-10-01', firstEnd: '2026-10-20' };
  assert.deepEqual([periodFor(st, '2026-10-25').s, periodFor(st, '2026-10-25').e], ['2026-10-21', '2026-10-30']);
  assert.deepEqual([periodFor(st, '2026-10-31').s, periodFor(st, '2026-10-31').e], ['2026-10-31', '2026-11-29']);
});

test('liquidez: un fijo de la cuenta que vence hoy y no se ha pagado sí cuenta', () => {
  const s = demoState();
  s.schedules.push({ id: 'renta', kind: 'fixed', name: 'Renta', amount: 400000, account: 'banco', rule: { type: 'monthly', day: 12 } });
  const a = computeDashboard(s, '2026-10-11').liquidity.min;
  const b = computeDashboard(s, '2026-10-12').liquidity.min;
  assert.ok(b <= a + 10000, `${a} → ${b}`);
});

test('pagar en la fecha límite: no sugiere adelantos', () => {
  const s = demoState();
  s.settings.payStrategy = 'due';
  const d = computeDashboard(s, '2026-10-01');
  assert.deepEqual(d.payPlan.map((p) => [p.date, p.onDue, p.due]), [['2026-10-23', true, '2026-10-23']]);
});

test('saldo antes del corte: no se sugiere pagar hasta el día siguiente al corte', async () => {
  const { migrate } = await import('../../js/engine/state.js');
  const s = demoState();
  s.schema = 1;
  s.statements = [{ id: 'sc', card: 'tc', amount: 300000, due: '2026-11-01', createdAt: '2026-09-30' }];
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.statements[0].beforeCut, true);
  const d = computeDashboard(m, '2026-10-01');
  assert.equal(d.statements[0].payFrom, '2026-10-20'); // Tarjeta C corta el 19
  assert.ok(d.payPlan.every((p) => p.date >= '2026-10-20'), JSON.stringify(d.payPlan));
});

test('cómo te fue cada día: empezaste, gastaste, terminaste', async () => {
  const { dayHistory } = await import('../../js/engine/budget.js');
  const s = demoState();
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 5000, date: '2026-10-01', cat: 'comida' }));
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 1000, date: '2026-10-02', cat: 'comida' }));
  const h = dayHistory(s, '2026-10-02', 7);
  assert.deepEqual(h.map((x) => [x.date, x.start, x.spent, x.end]), [
    ['2026-10-02', 1000, 1000, 0],
    ['2026-10-01', 3000, 5000, -2000],
  ]);
  assert.equal(computeDashboard(s, '2026-10-02').startOfDay, 1000);
});

test('el plan empieza el mismo día del saldo inicial: lo de ese día no se cuenta doble', () => {
  const s = demoState();
  s.settings.firstStart = '2026-09-30';
  s.schedules.push({ id: 'pago30', kind: 'income', name: 'Pago', amount: 500000, account: 'banco', rule: { type: 'once', date: '2026-09-30' } });
  const d = computeDashboard(s, '2026-09-30');
  assert.ok(!d.instances.some((i) => i.id === 'pago30@2026-09-30'));
  s.tx.push(tx({ type: 'expense', account: 'efectivo', amount: 2000, date: '2026-09-30', cat: 'comida' }));
  const d2 = computeDashboard(s, '2026-09-30');
  assert.equal(d2.todaySpent, 2000);
  assert.equal(d2.disponible, d2.startOfDay - 2000);
});
