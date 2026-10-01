import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { periodFor } from '../../js/engine/periods.js';
import { nextBusinessDay } from '../../js/engine/holidays.js';
import { dueForCut, nextCut, recommendCard } from '../../js/engine/cards.js';
import { parseAmount, money } from '../../js/engine/money.js';
import { parseIntent, parseNotification, matchInstance } from '../../js/engine/quickadd.js';
import { encodeConfig, decodeConfig } from '../../js/engine/configcode.js';
import { expandSchedules } from '../../js/engine/schedule.js';
import { buildICS } from '../../js/engine/ics.js';
import { migrate } from '../../js/engine/state.js';
import { demoState } from '../fixtures/demo.js';

const settings = { firstStart: '2026-10-01', firstEnd: '2026-11-29' };

test('periodos: rescate y luego de día de pago a día de pago', () => {
  assert.deepEqual([periodFor(settings, '2026-10-15').s, periodFor(settings, '2026-10-15').e], ['2026-10-01', '2026-11-29']);
  assert.equal(periodFor(settings, '2026-10-15').D, 60);
  const dic = periodFor(settings, '2026-12-10');
  assert.deepEqual([dic.s, dic.e], ['2026-11-30', '2026-12-30']);
  const feb = periodFor(settings, '2027-02-10');
  assert.deepEqual([feb.s, feb.e], ['2027-01-31', '2027-02-27']);
  assert.equal(periodFor(settings, '2027-02-28').s, '2027-02-28');
});

test('días inhábiles: 1-nov-2026 (domingo) se recorre al martes 3 (2-nov inhábil)', () => {
  assert.equal(nextBusinessDay('2026-11-01'), '2026-11-03');
  assert.equal(nextBusinessDay('2026-10-24'), '2026-10-26');
  assert.equal(nextBusinessDay('2026-10-23'), '2026-10-23');
});

test('cortes y fechas límite', () => {
  const santander = { cutDay: 4, dueDay: 24 };
  assert.equal(nextCut(santander, '2026-10-01'), '2026-10-04');
  assert.equal(dueForCut(santander, '2026-10-04'), '2026-10-26');
  const nu = { cutDay: 27, dueDay: 8 };
  assert.equal(dueForCut(nu, '2026-10-27'), '2026-11-09');
  assert.equal(nextCut({ cutDay: 31 }, '2026-11-02'), '2026-11-30');
});

test('recomendación: más días para pagar sin pasar de 30%', () => {
  const cards = [
    { id: 'a', pay: { days: 10 }, owed: 0, msi: 0, limit: 1000, util: 0 },
    { id: 'b', pay: { days: 45 }, owed: 900, msi: 0, limit: 1000, util: 0.9 },
    { id: 'c', pay: { days: 30 }, owed: 100, msi: 0, limit: 1000, util: 0.1 },
  ];
  assert.equal(recommendCard(cards).id, 'c');
});

test('montos', () => {
  assert.equal(parseAmount('25'), 2500);
  assert.equal(parseAmount('$1,234.50'), 123450);
  assert.equal(parseAmount('MX$5.00'), 500);
  assert.equal(parseAmount('-5'), 500);
  assert.equal(parseAmount('abc'), null);
  assert.equal(money(123450), '$1,234.50');
  assert.equal(money(-500), '−$5.00');
});

test('notificaciones del banco', () => {
  const metro = parseNotification('Compraste $5.00 en AUTOB METROTAP con tu tarjeta de crédito');
  assert.deepEqual([metro.amount, metro.cat], [500, 'transporte']);
  assert.equal(parseNotification('Compra de $120.00 en OXXO TONALA').merchant, 'OXXO TONALA');
  assert.ok(parseNotification('Tu compra de $300.00 fue rechazada').ignore);
  assert.ok(parseNotification('Recibimos tu pago de $3,525.43').ignore);
  assert.ok(parseNotification('Hola').ignore);
});

test('captura por URL: token, fuente y borrador', () => {
  const st = demoState().settings;
  const p = new URLSearchParams('add=5&desc=Metro&m=tc&id=abc&k=tok123');
  const r = parseIntent(p, st);
  assert.ok(r.trusted);
  assert.deepEqual([r.tx.amount, r.tx.cat, r.tx.account, r.extId], [500, 'transporte', 'tc', 'abc']);
  const raw = parseIntent(new URLSearchParams('raw=Compraste%20%24250.00%20en%20CINEMEX&src=nu&k=mal'), st);
  assert.equal(raw.trusted, false);
  assert.deepEqual([raw.tx.amount, raw.tx.account, raw.tx.review], [25000, 'tb', true]);
  assert.equal(parseIntent(new URLSearchParams('view=hoy'), st), null);
});

test('un cargo capturado se liga a su fijo planeado', () => {
  const inst = [{ id: 'spot@2026-10-29', kind: 'fixed', status: 'pending', account: 'tb', amount: 4000, date: '2026-10-29' }];
  assert.equal(matchInstance(inst, { type: 'expense', account: 'tb', amount: 4000, date: '2026-10-28' }).id, 'spot@2026-10-29');
  assert.equal(matchInstance(inst, { type: 'expense', account: 'tc', amount: 4500, date: '2026-10-28', desc: 'algo' }), null);
});

test('código de configuración ida y vuelta, y detecta cortes', () => {
  const s = demoState();
  const code = encodeConfig(s);
  assert.ok(code.startsWith('FB1.'));
  assert.deepEqual(decodeConfig(code), JSON.parse(JSON.stringify(s)));
  assert.throws(() => decodeConfig(code.slice(0, -8) + code.slice(-3)));
  assert.throws(() => decodeConfig('hola'));
});

test('reglas: último día, cada 2 meses, semanal', () => {
  const sch = [
    { id: 'u', kind: 'income', amount: 1, rule: { type: 'monthly', day: 'last' } },
    { id: 'b', kind: 'fixed', amount: 1, rule: { type: 'monthly', day: 30, every: 2, anchor: '2026-08-30' } },
    { id: 'w', kind: 'income', amount: 1, rule: { type: 'weekly', weekday: 6 } },
  ];
  const ids = expandSchedules(sch, '2026-10-01', '2026-12-31').map((i) => i.id);
  assert.ok(ids.includes('u@2026-10-31') && ids.includes('u@2026-11-30'));
  assert.ok(ids.includes('b@2026-10-30') && ids.includes('b@2026-12-30') && !ids.includes('b@2026-11-30'));
  assert.equal(ids.filter((i) => i.startsWith('w@')).length, 13);
});

test('ics', () => {
  const ics = buildICS([{ uid: 'x', date: '2026-10-23', title: 'Pagar, ya' }], '20260930T000000Z');
  assert.match(ics, /DTSTART;VALUE=DATE:20261023/);
  assert.match(ics, /SUMMARY:Pagar\\, ya/);
});

test('migración rechaza versiones futuras y completa ajustes', () => {
  assert.throws(() => migrate({ schema: 99 }));
  const m = migrate({ schema: 1, settings: { firstStart: '2026-10-01' }, accounts: [], tx: [] });
  assert.equal(m.settings.liquidityFloor, 30000);
});

test('el service worker precarga todos los archivos de la app', () => {
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  const walk = (dir) => readdirSync(new URL(`../../${dir}/`, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of [...walk('js'), ...walk('css')]) assert.ok(sw.includes(`'./${f}'`), `falta ${f} en sw.js`);
});
