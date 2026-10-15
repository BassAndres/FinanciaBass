// Revisión de octubre: sobrante sin el colchón y fecha de las compras que pega el atajo de iPhone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboard, periodLeftover } from '../../js/engine/budget.js';
import { parseCaptureLines, parseCaptureDate } from '../../js/engine/quickadd.js';
import { buildState } from '../../js/engine/setup.js';
import { addDays } from '../../js/engine/dates.js';

test('el sobrante del periodo no incluye el colchón', () => {
  const s = buildState({
    accounts: [{ name: 'Banco', type: 'bank', balance: '2000' }],
    incomes: [{ name: 'Sueldo', amount: '6000', freq: 'semimonthly', account: 'Banco' }],
  }, '2026-10-15', 't');
  s.settings.liquidityFloor = 30000;
  // Gasta todo lo disponible cada día del primer periodo (15 al 30 de octubre).
  for (let d = '2026-10-15'; d <= '2026-10-30'; d = addDays(d, 1)) {
    const x = computeDashboard(s, d);
    if (x.disponible > 0) s.tx.push({ id: d, type: 'expense', account: s.accounts[0].id, amount: x.disponible, date: d, cat: 'comida' });
  }
  const next = computeDashboard(s, '2026-10-31');
  assert.equal(computeDashboard(s, '2026-10-30').R, 30000); // el colchón sigue en la cuenta…
  assert.equal(periodLeftover(s, next.period), null); // …y no se ofrece mandarlo a la alcancía
  // Si un día no gastas $100, eso sí sobra.
  s.tx = s.tx.filter((t) => t.date !== '2026-10-30');
  s.tx.push({ id: 'x', type: 'expense', account: s.accounts[0].id, amount: computeDashboard(s, '2026-10-30').disponible - 10000, date: '2026-10-30', cat: 'comida' });
  assert.deepEqual(periodLeftover(s, next.period), { amount: 10000, date: '2026-10-30', key: 'leftover:2026-10-15' });
});

test('atajo de iPhone: la compra conserva su fecha aunque la pegues después', () => {
  const T = '2026-10-15';
  assert.equal(parseCaptureDate('2026-10-14T21:05:00-06:00', T), '2026-10-14');
  assert.equal(parseCaptureDate('14/10/26 21:05', T), '2026-10-14');
  assert.equal(parseCaptureDate('10/14/26, 9:05 PM', T), '2026-10-14');
  assert.equal(parseCaptureDate('14 oct 2026, 9:05 p.m.', T), '2026-10-14');
  assert.equal(parseCaptureDate('14 de octubre de 2026', T), '2026-10-14');
  assert.equal(parseCaptureDate('October 14, 2026 at 9:05 PM', T), '2026-10-14');
  assert.equal(parseCaptureDate('31 dic', '2027-01-01'), '2026-12-31');
  // Futura, muy vieja o ilegible: se usa la de hoy.
  for (const w of ['16 oct', '2025-01-01', 'ayer', '']) assert.equal(parseCaptureDate(w, T), null);
  const [a, b] = parseCaptureLines('FB|$80.00|OXXO|Nu|13 oct 2026, 8:00 p.m.\nFB|$20.00|Café|Nu|[Fecha actual]', T);
  assert.deepEqual([a.date, b.date], ['2026-10-13', null]);
});
