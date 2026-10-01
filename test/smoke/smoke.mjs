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

await page.goto(base);
await page.getByText('¿Tienes un código?').waitFor();
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
assert.equal(await page.locator('.hero-amount').textContent(), '$17.50');
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
