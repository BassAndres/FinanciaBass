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
// Progreso: cuenta regresiva a la siguiente quincena (15 oct) y un premio propio.
assert.match(await page.textContent('.game .ring'), /14\s*días/);
await page.click('.game');
await page.click('[data-action="reward-set"]');
await page.fill('input[name="text"]', 'Un helado');
await page.click('[data-sheet-action="ok"]');
assert.deepEqual(await page.evaluate(() => window.fb.state.progress.reward), { text: 'Un helado', goal: 7, kind: 'streak', since: '2026-10-01' });
assert.match(await page.textContent('.game .chips'), /0\/7/);
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
// MacroDroid/Tasker sin codificar: "&" y "#" en el texto, con raw al final de la dirección.
await page.goto(`${base}?via=bank&id=md1&k=${tok}&t=Nu&raw=Compraste $310.00 en H&M Perisur con tu tarjeta #4321`);
await page.locator('.hero-amount').waitFor();
const hm = await page.evaluate(() => window.fb.state.tx.find((t) => t.amount === 31000));
assert.deepEqual([hm?.desc, hm?.account], ['H&M Perisur', 'tarjeta-x']);
assert.equal(await page.evaluate(() => location.hash), '');
// Prueba de captura: la notificación de prueba regresa por la URL de Automate; no se guarda nada.
const nTx = await page.evaluate(() => window.fb.state.tx.length);
await page.goto(`${base}?via=wallet&id=com.brave.browser-7-1&k=${tok}&t=PRUEBA%20FinanciaBass&raw=${encodeURIComponent('Compraste $1.00 en PRUEBA FINANCIABASS')}`);
await page.locator('.hero-amount, #main h1').first().waitFor();
assert.equal(await page.evaluate(() => window.fb.state.tx.length), nTx);
assert.equal(await page.evaluate(() => window.fb.state.settings.capture?.testOk?.via), 'wallet');
// Si el flujo se quedó escuchando al navegador, lo que venga de ahí se ignora.
await page.goto(`${base}?via=wallet&id=com.brave.browser-9-2&k=${tok}&t=Brave&raw=${encodeURIComponent('Oferta $99.00 en tienda')}`);
await page.locator('.hero-amount').waitFor();
assert.equal(await page.evaluate(() => window.fb.state.tx.length), nTx);
// El botón de prueba manda la notificación sin errores.
// (Chromium sin pantalla siempre dice "denied" en notificaciones: se simula la API.)
await page.goto(`${base}#/mas`);
await page.evaluate(() => {
  Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
  ServiceWorkerRegistration.prototype.showNotification = async function (title, opts) { window.__notified = [title, opts.body]; };
});
await page.click('.cap-more summary'); // en el navegador, lo que abre el navegador queda en "Otras formas"
await page.click('[data-action="cap-test"]');
await page.locator('#toast:not([hidden])').waitFor();
assert.match(await page.locator('#toast').textContent(), /mandé la notificación de prueba/);
assert.deepEqual(await page.evaluate(() => window.__notified), ['PRUEBA FinanciaBass', 'Compraste $1.00 en PRUEBA FINANCIABASS']);
await page.goto(`${base}#/hoy`);
// iPhone: pegar lo que copió el atajo de Wallet (dos compras, una repetida al pegar otra vez).
await page.evaluate(() => { window.__clip = 'FB|$45.00|Starbucks|Tarjeta X|1 oct 2026 10:00\nFB|$5.00|Metro|Tarjeta X|1 oct 2026 10:30'; });
await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => window.__clip, writeText: async () => {} }, configurable: true }); });
await page.evaluate(() => window.fb.paste());
await page.evaluate(() => window.fb.paste());
const pasted = await page.evaluate(() => window.fb.state.tx.filter((t) => t.via === 'wallet' && t.amount !== 8900).map((t) => [t.amount, t.cat, t.account]));
assert.deepEqual(pasted.sort(), [[4500, 'otros', 'tarjeta-x'], [500, 'transporte', 'tarjeta-x']].sort());
await page.evaluate(() => localStorage.clear());
// Una compra que llega a un navegador sin datos avisa en vez de perderse.
await page.goto(`${base}?via=wallet&id=x1&k=abc&raw=${encodeURIComponent('$45.00 con Visa')}&t=OXXO`);
await page.getByText('pero aquí no están tus datos').waitFor();
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

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
// Eliminar pregunta con un diálogo propio (no el del sistema); "Cancelar" no borra nada.
await page.click('[data-action="sched-list"]');
await page.click('#sheet [data-row="2"]');
await page.click('#sheet [data-sheet-action="delete"]');
await page.getByText('¿Eliminar Suscripción?').waitFor();
await page.click('#dialog button[data-dlg="no"]');
assert.ok(await page.evaluate(() => window.fb.state.schedules.some((x) => x.id === 'fijo')));
await page.click('#sheet .sheet-x');
// Logros en su propio botón de Hoy, y lo apartado para transporte.
await page.goto(`${base}#/hoy`);
await page.click('.trophy');
await page.getByText('Cómo ganas puntos').waitFor();
await page.click('#sheet .sheet-x');
assert.match(await page.textContent('.aside'), /Transporte/);

// Un ingreso planeado registrado a mano se liga solo y no infla el número.
await page.goto(`${base}#/hoy`);
const before = await page.locator('.hero-amount').textContent();
await page.click('#fab');
await page.click('[data-pick="type"][data-val="income"]');
for (const k of ['1', '5', '0', '0']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="account"][data-val="banco"]');
// La fecha se elige en el calendario propio (no el del sistema).
await page.click('#sheet [data-pick-date]');
await page.click('#dialog .cal-day[data-d="2026-10-10"]');
await page.locator('#dialog').waitFor({ state: 'hidden' });
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

// "No, es otro ingreso" se respeta aunque el monto coincida con algo planeado ($800 de "Semana").
await page.goto(`${base}#/hoy`);
const pre3 = await page.evaluate(() => window.fb.dash.disponible);
await page.click('[data-action="new-income"]');
for (const k of ['8', '0', '0']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('[data-pick="account"][data-val="efectivo"]');
await page.click('#sheet [data-sheet-action="save"]');
assert.equal(await page.evaluate(() => window.fb.state.tx.at(-1).planRef), undefined);
assert.equal(await page.evaluate(() => window.fb.dash.disponible), pre3 + 80000);
// Teclado: ".50" son 50 centavos.
await page.click('#fab');
for (const k of ['.', '5', '0']) await page.click(`.keypad [data-key="${k}"]`);
assert.equal(await page.locator('.amount-display .num').textContent(), '0.50');
await page.click('#sheet [data-sheet-action="save"]');
assert.equal(await page.evaluate(() => window.fb.state.tx.at(-1).amount), 50);
// Otra pestaña (p. ej. MacroDroid) guarda una compra; lo que registres aquí no la borra.
const page2 = await ctx.newPage();
await page2.goto(`${base}?add=123&desc=Tacos&cat=comida&id=tab2&k=tok123`);
await page2.locator('.hero-amount').waitFor();
await page2.close();
await page.click('#fab');
for (const k of ['7']) await page.click(`.keypad [data-key="${k}"]`);
await page.click('#sheet [data-sheet-action="save"]');
assert.equal(await page.evaluate(() => window.fb.state.tx.filter((t) => t.desc === 'Tacos').length), 1);
await page.evaluate(() => { const st = window.fb.state; st.tx = st.tx.slice(0, -4); localStorage.setItem('financiabass:v1', JSON.stringify(st)); });
await page.reload();
assert.equal(await page.evaluate(() => window.fb.dash.disponible), pre3);

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

// App de Android (puente simulado): anota lo que guardó el lector de notificaciones, sin abrir nada.
const nctx = await browser.newContext({ viewport: { width: 360, height: 800 }, timezoneId: 'America/Mexico_City' });
await nctx.addInitScript(([st]) => {
  const T = new Date('2026-10-01T12:00:00-06:00').getTime();
  const D = Date;
  Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } };
  window.__acked = []; window.__shared = null; window.__apps = ['com.google.android.apps.walletnfcrel'];
  window.__queue = [
    { id: 'com.google.android.apps.walletnfcrel-3-1', pkg: 'com.google.android.apps.walletnfcrel', app: 'Google Wallet', title: 'OXXO', text: '$45.00 con Visa •••• 9999', when: T - 3600e3 },
    { id: 'com.nu.production-8-2', pkg: 'com.nu.production', app: 'Nu', title: 'Compra', text: 'Compraste $45.00 en OXXO con tu tarjeta •••• 9999', when: T - 3500e3 },
    { id: 'com.nu.production-9-3', pkg: 'com.nu.production', app: 'Nu', title: 'Abono', text: 'Recibiste $500.00', when: T - 3400e3 },
  ];
  window.FBAndroid = {
    version: () => 1,
    status: () => JSON.stringify({ version: 1, access: false, notify: true, battery: false, confirm: true }),
    pending: () => JSON.stringify(window.__queue),
    ack: (ids) => { window.__acked.push(...JSON.parse(ids)); window.__queue = window.__queue.filter((x) => !JSON.parse(ids).includes(x.id)); },
    apps: () => JSON.stringify({ apps: [{ pkg: 'com.google.android.apps.walletnfcrel', label: 'Google Wallet', on: window.__apps.includes('com.google.android.apps.walletnfcrel'), installed: true, n: 3 }, { pkg: 'com.nu.production', label: 'Nu', on: window.__apps.includes('com.nu.production'), installed: true, n: 9 }] }),
    allApps: () => '[]', setApps: (j) => { window.__apps = JSON.parse(j); },
    openAccess() {}, openAppInfo() {}, askNotify() {}, askBattery() {}, setConfirm() {},
    test: () => { window.__queue.push({ id: 'own-1', pkg: 'io.github.bassandres.financiabass', title: 'PRUEBA FinanciaBass', text: 'Compraste $1.00 en PRUEBA FINANCIABASS', when: Date.now() }); setTimeout(() => window.fbNative.pull(), 10); return 'ok'; },
    shareFile: (n, t) => { window.__shared = [n, t.length]; return true; },
    saveBackup: (n) => { window.__backup = n; return `Descargas/FinanciaBass/${n}`; },
    clipboard: () => window.__clip || '', openUrl() {},
  };
  if (st && !sessionStorage.getItem('noseed')) localStorage.setItem('financiabass:v1', st);
}, [JSON.stringify(state)]);
const np = await nctx.newPage();
np.on('pageerror', (e) => errors.push(`android: ${e.message}`));
await np.goto(base);
await np.locator('.hero-amount').waitFor();
const ntx = await np.evaluate(() => window.fb.state.tx.filter((t) => t.amount === 4500));
assert.equal(ntx.length, 1); // Wallet + banco = una sola compra
assert.deepEqual(ntx[0].seenBy.sort(), ['bank', 'wallet']);
assert.equal(ntx[0].date, '2026-10-01');
assert.equal(await np.evaluate(() => window.__acked.length), 3);
assert.equal(await np.evaluate(() => window.__queue.length), 0);
// No sale el aviso de "instálala" dentro de la app.
assert.equal(await np.locator('text=Instálala en tu celular').count(), 0);
// Más → Captura automática: permisos, apps y prueba de punta a punta.
await np.goto(`${base}#/mas`);
await np.getByText('Acceso a notificaciones').waitFor();
await np.click('[data-action="nat-app"][data-pkg="com.nu.production"]');
assert.deepEqual(await np.evaluate(() => window.__apps.sort()), ['com.google.android.apps.walletnfcrel', 'com.nu.production']);
await np.selectOption('[data-nat-acc="com.nu.production"]', 'tb');
assert.equal(await np.evaluate(() => window.fb.state.settings.capture.pkgAccount['com.nu.production']), 'tb');
await np.click('[data-action="nat-test"]');
await np.waitForFunction(() => window.fb.state.settings.capture?.testOk?.via === 'android');
// Respaldo: se comparte con el menú de Android; copia automática a Descargas.
await np.click('[data-action="backup"]');
assert.equal(await np.evaluate(() => window.__shared?.[0]), 'financiabass-respaldo-2026-10-01.txt');
await np.waitForFunction(() => window.__backup === 'financiabass-respaldo-2026-10-01.txt');
assert.ok(await np.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'scroll horizontal en Más (app)');
// Pasar mis datos: en una app nueva (sin datos) se pegan desde el portapapeles.
const envelope = await np.evaluate(() => JSON.stringify({ app: 'FinanciaBass', schema: 3, data: window.fb.state }));
await np.evaluate(() => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('noseed', '1'); });
await np.evaluate((t) => { window.__clip = t; }, envelope);
await np.reload();
await np.evaluate((t) => { window.__clip = t; }, envelope);
await np.click('[data-wact="paste"]');
await np.locator('.hero-amount').waitFor();
assert.ok(await np.evaluate(() => window.fb.state.tx.some((t) => t.amount === 4500)));
await nctx.close();

assert.deepEqual(errors, []);
await page.screenshot({ path: process.env.SHOT || '/tmp/financiabass-hoy.png', fullPage: true });
await browser.close();
server.close();
console.log('smoke OK');
