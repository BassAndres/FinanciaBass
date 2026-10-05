// Prueba de humo en Chromium: carga el código demo, registra un gasto, recarga, funciona sin internet
// y la captura por URL agrega una sola vez.  Uso: npm run smoke  (PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { encodeConfig } from '../../js/engine/index.js';
import { demoState } from '../fixtures/demo.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let deployed = ''; // simula publicar una versión nueva del CSS
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/FinanciaBass/, '');
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
  try {
    let body = await readFile(file);
    if (deployed && file.endsWith('app.css')) body = Buffer.concat([body, Buffer.from(deployed)]);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body);
  }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/FinanciaBass/`;

const state = demoState();
const code = encodeConfig(state);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, timezoneId: 'America/Mexico_City' });
await ctx.addInitScript(() => {
  // Fija "hoy" en el 1-oct-2026 para que la prueba no dependa de la fecha real.
  const T = new Date('2026-10-01T12:00:00-06:00').getTime();
  const D = Date;
  // eslint-disable-next-line no-global-assign
  Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

// Asistente de bienvenida: una persona nueva arma su plan sin código.
await page.goto(base);
await page.getByText('¿Ya la usabas?').waitFor();
await page.click('[data-wgo="1"]');
await page.fill('[data-w="accounts.0.balance"]', '5000');
await page.fill('[data-w="accounts.1.balance"]', '500');
await page.click('.wizard > .btn.lg');
await page.click('[data-wadd="cards"]');
await page.fill('[data-w="cards.0.name"]', 'Tarjeta X');
await page.fill('[data-w="cards.0.owed"]', '1000');
await page.fill('[data-w="cards.0.limit"]', '10000');
await page.selectOption('[data-w="cards.0.cutDay"]', '5');
await page.selectOption('[data-w="cards.0.dueDay"]', '25');
await page.fill('[data-w="cards.0.last4"]', '4321');
await page.click('.wizard > .btn.lg');
await page.fill('[data-w="incomes.0.amount"]', '6000');
await page.click('.wizard > .btn.lg');
await page.click('[data-wsuggest="Internet"]');
await page.fill('[data-w="fixed.0.amount"]', '400');
await page.selectOption('[data-w="fixed.0.day"]', '10');
await page.click('.wizard > .btn.lg');
await page.fill('[data-w="transport.rate"]', '20');
await page.click('[data-wseg="transport.preset"] [data-val="cdmx"]');
await page.click('.wizard > .btn.lg');
await page.getByText('Así queda tu plan').waitFor();
assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'scroll horizontal en el asistente');
await page.click('.wizard > .btn.lg');
await page.locator('.hero-amount').waitFor();
const wiz = await page.evaluate(() => ({ s: window.fb.state.settings, accs: window.fb.state.accounts.map((a) => a.id), n: window.fb.state.schedules.length }));
assert.deepEqual(wiz.s.payCycle, { type: 'semimonthly' });
assert.equal(wiz.s.firstEnd, '2026-10-14');
assert.equal(wiz.s.fares.length, 2);
assert.deepEqual(wiz.accs, ['banco', 'efectivo', 'tarjeta-x', 'ahorro']);
assert.equal(wiz.n, 2);
// Compra de Google Wallet (Android) reconocida por los últimos 4 dígitos, y luego la del banco: solo una.
const tok = wiz.s.quickAdd.token;
await page.goto(`${base}?raw=${encodeURIComponent('$89.00 con Visa •••• 4321')}&t=OXXO&via=wallet&id=w1&k=${tok}`);
await page.locator('.hero-amount').waitFor();
await page.goto(`${base}?raw=${encodeURIComponent('Compraste $89.00 en OXXO con tu tarjeta terminación 4321')}&via=bank&id=b1&k=${tok}`);
await page.locator('.hero-amount').waitFor();
const oxxo = await page.evaluate(() => window.fb.state.tx.filter((t) => t.amount === 8900));
assert.equal(oxxo.length, 1);
assert.equal(oxxo[0].account, 'tarjeta-x');
assert.deepEqual(oxxo[0].seenBy, ['wallet', 'bank']);
// iPhone: pegar lo que copió el atajo de Wallet (dos compras, una repetida al pegar otra vez).
await page.evaluate(() => { window.__clip = 'FB|$45.00|Starbucks|Tarjeta X|1 oct 2026 10:00\nFB|$5.00|Metro|Tarjeta X|1 oct 2026 10:30'; });
await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => window.__clip, writeText: async () => {} }, configurable: true }); });
await page.evaluate(() => window.fb.paste());
await page.evaluate(() => window.fb.paste());
const pasted = await page.evaluate(() => window.fb.state.tx.filter((t) => t.via === 'wallet' && t.amount !== 8900).map((t) => [t.amount, t.cat, t.account]));
assert.deepEqual(pasted.sort(), [[4500, 'otros', 'tarjeta-x'], [500, 'transporte', 'tarjeta-x']].sort());
await page.evaluate(() => localStorage.clear());

await page.goto(`${base}#setup=${code}`);
await page.reload();
await page.locator('.hero-amount').waitFor();
assert.equal(await page.locator('.hero-amount').textContent(), '$30.00');
const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
assert.ok(scroll, 'hay scroll horizontal en 360px');

// Registrar un gasto de $12.50 en efectivo con el teclado.
await page.click('#fab');
for (const k of ['1', '2', '.', '5']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="account"][data-val="efectivo"]');
await page.click('[data-sheet-action="save"]');
assert.equal(await page.locator('.hero-amount').textContent(), '$17.50');
await page.reload();
assert.equal(await page.locator('.hero-amount').textContent(), '$17.50');

// Captura automática con token: una sola vez aunque se repita el id.
const url = `${base}?add=5&desc=Metro&m=tc&id=abc1&k=tok123`;
await page.goto(url);
await page.locator('.hero-amount').waitFor();
await page.goto(url);
await page.locator('.hero-amount').waitFor();
const metros = await page.evaluate(() => window.fb.state.tx.filter((t) => t.desc === 'Metro').length);
assert.equal(metros, 1);
assert.equal(await page.locator('.hero-amount').textContent(), '$17.50'); // el metro sale de la bolsa de transporte

// Notificación del banco sin token: pide confirmar.
await page.goto(`${base}?raw=${encodeURIComponent('Compraste $40.00 en OXXO TONALA')}&src=nu`);
await page.locator('.amount-display').waitFor();
assert.equal(await page.locator('.amount-display .num').textContent(), '40');

// "¿Cómo sale tu número?" y las hojas de edición abren sin errores.
await page.goto(`${base}#/hoy`);
await page.click('.hero');
await page.getByText('¿Cómo sale tu número?').waitFor();
await page.click('#sheet [data-close].sheet-x');
await page.goto(`${base}#/plan`);
await page.click('[data-action="inst-open"]');
await page.locator('#sheet .form').waitFor();
await page.click('#sheet .sheet-x');
await page.goto(`${base}#/mas`);
for (const a of ['acc-list', 'sched-list', 'stmt-list', 'fares', 'period']) {
  await page.click(`[data-action="${a}"]`);
  await page.locator('#sheet:not([hidden]) h2').waitFor();
  await page.click('#sheet .sheet-x');
}
// Editar el monto de un fijo para los próximos meses.
await page.click('[data-action="sched-list"]');
await page.click('#sheet [data-row="2"]');
await page.fill('#sheet input[name="amount"]', '1100');
await page.click('#sheet [data-sheet-action="ok"]');
assert.equal(await page.evaluate(() => window.fb.state.schedules.find((x) => x.id === 'fijo').amount), 110000);

// Un ingreso planeado registrado a mano se liga solo y no infla el número.
await page.goto(`${base}#/hoy`);
const before = await page.locator('.hero-amount').textContent();
await page.click('#fab');
await page.click('[data-pick="type"][data-val="income"]');
for (const k of ['1', '5', '0', '0']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="account"][data-val="banco"]');
await page.fill('#sheet input[data-field="date"]', '2026-10-10');
await page.click('#sheet [data-sheet-action="save"]');
const linked = await page.evaluate(() => window.fb.state.tx.find((t) => t.type === 'income')?.planRef);
assert.equal(linked, 'beca@2026-10-10');
assert.equal(await page.locator('.hero-amount').textContent(), before);
assert.equal(before, '$14.16');

// Pagué $15 por transferencia, mi amigo me regresó $10 en efectivo: solo se descuentan $5.
const pre = await page.evaluate(() => window.fb.dash.disponible);
await page.click('#fab');
for (const k of ['1', '5']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="account"][data-val="banco"]');
await page.click('details.refund summary');
await page.fill('[data-field="refund"]', '10');
await page.click('[data-pick="refundAccount"][data-val="efectivo"]');
await page.click('#sheet [data-sheet-action="save"]');
assert.equal(await page.evaluate(() => window.fb.dash.disponible), pre - 500);
// "Me dieron dinero" suma.
await page.click('[data-action="new-income"]');
for (const k of ['2', '0']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="desc"][data-val="Amigo"]');
await page.click('#sheet [data-sheet-action="save"]');
assert.equal(await page.evaluate(() => window.fb.dash.disponible), pre - 500 + 2000);
// Se deshace para no mover los números de las siguientes pruebas.
await page.evaluate(() => { const st = window.fb.state; st.tx = st.tx.filter((t) => !(t.cat === 'reembolso' || t.desc === 'Amigo' || (t.amount === 1500 && t.account === 'banco'))); localStorage.setItem('financiabass:v1', JSON.stringify(st)); });
await page.reload();

// "Saldo real" explicado como dinero que pasé de otra cuenta: no cambia el número.
const before2 = await page.evaluate(() => window.fb.dash.disponible);
const bank0 = await page.evaluate(() => window.fb.dash.balances.banco);
await page.goto(`${base}#/mas`);
await page.click('[data-action="adjust"][data-acc="banco"]');
for (const k of String((bank0 + 30000) / 100).split('')) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="adjReason"][data-val="move"]');
await page.click('[data-pick="moveFrom"][data-val="efectivo"]');
await page.click('#sheet [data-sheet-action="save"]');
assert.equal(await page.evaluate(() => window.fb.dash.disponible), before2);
assert.equal(await page.evaluate(() => window.fb.dash.balances.banco), bank0 + 30000);
assert.equal(await page.evaluate(() => window.fb.state.tx.at(-1).type), 'transfer');
await page.evaluate(() => { const st = window.fb.state; st.tx.pop(); localStorage.setItem('financiabass:v1', JSON.stringify(st)); });
await page.reload();

// Todas las pantallas cargan.
for (const r of ['movs', 'tarjetas', 'plan', 'mas', 'hoy']) {
  await page.goto(`${base}#/${r}`);
  await page.locator('#main h1, #main .hero').first().waitFor();
}

// Sin internet (service worker).
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await ctx.setOffline(true);
await page.reload();
assert.equal(await page.locator('.hero-amount').textContent(), before); // 30 − 3.34 (fijo +$100) − 12.50
await ctx.setOffline(false);

// Una versión nueva publicada se ve al recargar, sin borrar la caché.
deployed = ':root{--deploy:"nueva"}';
await page.reload();
await page.locator('.hero-amount').waitFor();
const marker = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--deploy').trim());
assert.equal(marker, '"nueva"');

assert.deepEqual(errors, []);
await page.screenshot({ path: process.env.SHOT || '/tmp/financiabass-hoy.png', fullPage: true });
await browser.close();
server.close();
console.log('smoke OK');
