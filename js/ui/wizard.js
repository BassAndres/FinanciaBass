// Asistente de bienvenida: cualquier persona arma su plan (cuentas, tarjetas, ingresos, fijos y transporte)
// en unos pasos. Al final se crea el estado con buildState() y se muestra cuánto puede gastar hoy.
import { buildState, computeDashboard, money, fmtDate, parseAmount, cutForPurchase, dueForCut, dateOf, year, month } from '../engine/index.js';
import { esc, $ } from './dom.js';
import { icon } from './icons.js';

const KEY = 'financiabass:wizard';
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const INCOME_FREQ = [['monthly', 'Mensual'], ['semimonthly', 'Quincenal'], ['weekly', 'Semanal'], ['biweekly', 'Cada 2 semanas']];
const FIXED_FREQ = [['monthly', 'Mensual'], ['bimonthly', 'Cada 2 meses'], ['weekly', 'Semanal']];
const FIXED_SUGGEST = ['Renta', 'Internet', 'Celular', 'Luz', 'Agua', 'Gas', 'Streaming', 'Gimnasio', 'Seguro', 'Escuela'];
const STEPS = ['Inicio', 'Tu dinero', 'Tarjetas', 'Ingresos', 'Gastos fijos', 'Transporte', 'Listo'];

let w = null;
let step = 0;
let ctx = null; // { today, token, finish(state), importFile(), applyCode(code) }

const fresh = () => ({
  n: 3,
  accounts: [{ key: 'a1', name: 'Banco', type: 'bank', balance: '' }, { key: 'a2', name: 'Efectivo', type: 'cash', balance: '' }],
  cards: [],
  incomes: [{ key: 'i1', name: 'Sueldo', amount: '', freq: 'semimonthly', day: 'last', weekday: '5', account: 'a1' }],
  fixed: [],
  transport: { rate: '', account: 'a2', weekdays: 'all', preset: 'none' },
  fares: [],
});

function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ w, step })); } catch { /* sin almacenamiento */ } }
function restore() {
  try { const x = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (x?.w) { w = x.w; step = x.step || 0; } } catch { /* nada */ }
}
export function clearWizard() { try { sessionStorage.removeItem(KEY); } catch { /* nada */ } w = null; step = 0; }

const nextKey = (p) => `${p}${w.n++}`;
const moneyAccounts = () => w.accounts.filter((a) => a.name.trim());
const payAccounts = () => [...moneyAccounts().filter((a) => a.type !== 'savings'), ...w.cards.filter((c) => c.name.trim())];
const sel = (path, options, value) => `<select data-w="${path}">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const inp = (path, value, { ph = '', money: isMoney = false, type = 'text', mode = '' } = {}) =>
  `<span class="winput ${isMoney ? 'money' : ''}">${isMoney ? '<i>$</i>' : ''}<input data-w="${path}" type="${type}" value="${esc(value ?? '')}" placeholder="${esc(ph)}" ${isMoney ? 'inputmode="decimal"' : mode ? `inputmode="${mode}"` : ''}></span>`;
const fieldL = (label, html, hint = '') => `<label class="wfield"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>${html}</label>`;
const seg = (path, options, value) => `<div class="seg full" data-wseg="${path}">${options.map(([v, l]) => `<button type="button" class="${String(v) === String(value) ? 'on' : ''}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const removeBtn = (list, i) => `<button type="button" class="wremove" data-wdel="${list}" data-i="${i}" aria-label="Quitar">${icon('x', 16)}</button>`;

function freqFields(path, x, freqs) {
  return `${seg(`${path}.freq`, freqs, x.freq)}
    ${x.freq === 'monthly' || x.freq === 'bimonthly' ? fieldL('Qué día', sel(`${path}.day`, [...DAYS.map((d) => [d, `Día ${d}`]), ['last', 'Último día del mes']], x.day)) : ''}
    ${x.freq === 'weekly' || x.freq === 'biweekly' ? fieldL(x.freq === 'biweekly' ? 'Próximo día de pago' : 'Qué día', sel(`${path}.weekday`, WEEKDAYS.map((d, i) => [String(i), d]), x.weekday)) : ''}
    ${x.freq === 'semimonthly' ? '<p class="foot top0">El 15 y el último día de cada mes.</p>' : ''}`;
}

function stepHtml(today) {
  if (step === 0) {
    return `<div class="brand-mark">${icon('savings', 30)}</div>
      <h1>FinanciaBass</h1>
      <p class="lead">Cada día sabes cuánto puedes gastar. Pagas tus tarjetas a tiempo y lo que no uses se acumula.</p>
      <div class="panel pad">
        <ol class="steps">
          <li>Pones cuánto tienes y cuánto debes.</li>
          <li>Agregas tus ingresos y gastos fijos.</li>
          <li>La app te dice cuánto puedes gastar hoy y cuándo pagar cada tarjeta.</li>
        </ol>
        <button type="button" class="btn wide lg" data-wgo="1">Empezar</button>
      </div>
      <div class="panel pad">
        <h2>¿Ya la usabas?</h2>
        <button type="button" class="btn ghost wide" data-wact="import">${icon('upload', 18)}Restaurar un respaldo</button>
        <details class="wcode"><summary>Tengo un código FB1</summary>
          <textarea id="config-code" rows="3" placeholder="FB1…"></textarea>
          <button type="button" class="btn wide" data-wact="code">Cargar código</button>
        </details>
        <input type="file" id="import-file" accept=".txt,.json,application/json,text/plain" hidden>
      </div>
      <p class="colophon">${icon('shield', 16)} Tus datos se guardan solo en este celular. No hay cuentas ni servidores.</p>`;
  }
  if (step === 1) {
    return `<h2 class="wtitle">¿Dónde tienes tu dinero?</h2>
      <p class="foot top0">Pon lo que tienes <b>ahorita</b> en cada lugar: cuentas de débito, efectivo y, si tienes, un apartado de ahorro que no quieras tocar.</p>
      ${w.accounts.map((a, i) => `<div class="wcard">
        ${removeBtn('accounts', i)}
        ${seg(`accounts.${i}.type`, [['bank', 'Banco / débito'], ['cash', 'Efectivo'], ['savings', 'Ahorro']], a.type)}
        ${fieldL('Nombre', inp(`accounts.${i}.name`, a.name, { ph: a.type === 'cash' ? 'Efectivo' : 'Ej. BBVA, Revolut, Mercado Pago' }))}
        ${fieldL('Saldo de hoy', inp(`accounts.${i}.balance`, a.balance, { money: true, ph: '0' }))}
        ${a.type === 'bank' ? fieldL('Últimos 4 dígitos de la tarjeta', inp(`accounts.${i}.last4`, a.last4, { ph: 'Opcional', mode: 'numeric' }), 'Para reconocer tus compras automáticamente') : ''}
      </div>`).join('')}
      <button type="button" class="btn ghost wide" data-wadd="accounts">${icon('plus', 18)}Agregar otra cuenta</button>`;
  }
  if (step === 2) {
    return `<h2 class="wtitle">Tarjetas de crédito</h2>
      <p class="foot top0">Si no tienes, sigue al siguiente paso. Los días de corte y de pago vienen en tu estado de cuenta o en la app del banco.</p>
      ${w.cards.map((c, i) => {
    const cut = Number(c.cutDay) || 1;
    const acc = { cutDay: cut, dueDay: Number(c.dueDay) || 20 };
    const next = cutForPurchase(acc, today);
    const prev = dateOf(year(next), month(next) - 1, cut);
    return `<div class="wcard">
        ${removeBtn('cards', i)}
        ${fieldL('Nombre', inp(`cards.${i}.name`, c.name, { ph: 'Ej. Nu, BBVA Azul, Banamex Oro' }))}
        ${fieldL('Lo que debes hoy', inp(`cards.${i}.owed`, c.owed, { money: true, ph: '0' }), 'Saldo total, sin contar meses sin intereses futuros')}
        ${fieldL('Límite de crédito', inp(`cards.${i}.limit`, c.limit, { money: true, ph: '0' }))}
        <div class="wpair">${fieldL('Día de corte', sel(`cards.${i}.cutDay`, DAYS.map((d) => [d, d]), c.cutDay))}${fieldL('Día límite de pago', sel(`cards.${i}.dueDay`, DAYS.map((d) => [d, d]), c.dueDay))}</div>
        ${fieldL('¿Cuánto te falta pagar del último corte?', inp(`cards.${i}.statement`, c.statement, { money: true, ph: '0' }), dueForCut(acc, prev) < today
          ? `El corte del ${fmtDate(prev, false)} ya venció el ${fmtDate(dueForCut(acc, prev), false)}. Si no lo pagaste, pon cuánto falta; si sí, deja 0.`
          : `Pago para no generar intereses del corte del ${fmtDate(prev, false)} (vence el ${fmtDate(dueForCut(acc, prev), false)}). Si ya lo pagaste, deja 0.`)}
        ${fieldL('Últimos 4 dígitos', inp(`cards.${i}.last4`, c.last4, { ph: 'Opcional', mode: 'numeric' }), 'Para reconocer tus compras automáticamente')}
      </div>`;
  }).join('')}
      <button type="button" class="btn ${w.cards.length ? 'ghost' : ''} wide" data-wadd="cards">${icon('plus', 18)}Agregar tarjeta</button>`;
  }
  if (step === 3) {
    const accs = moneyAccounts().filter((a) => a.type !== 'savings').map((a) => [a.key, a.name]);
    return `<h2 class="wtitle">¿Qué dinero te entra?</h2>
      <p class="foot top0">Sueldo, beca, lo que te dan tus papás, una renta… Lo que llega seguido. El más grande define tus periodos (de pago a pago).</p>
      ${w.incomes.map((x, i) => `<div class="wcard">
        ${removeBtn('incomes', i)}
        ${fieldL('Nombre', inp(`incomes.${i}.name`, x.name, { ph: 'Ej. Sueldo, Beca' }))}
        ${fieldL(x.freq === 'semimonthly' ? 'Monto de cada quincena' : 'Monto', inp(`incomes.${i}.amount`, x.amount, { money: true, ph: '0' }))}
        ${freqFields(`incomes.${i}`, x, INCOME_FREQ)}
        ${accs.length > 1 ? fieldL('Te llega a', sel(`incomes.${i}.account`, accs, x.account)) : ''}
      </div>`).join('')}
      <button type="button" class="btn ghost wide" data-wadd="incomes">${icon('plus', 18)}Agregar ingreso</button>`;
  }
  if (step === 4) {
    const accs = payAccounts().map((a) => [a.key, a.name]);
    return `<h2 class="wtitle">Gastos fijos</h2>
      <p class="foot top0">Lo que pagas cada mes sí o sí: renta, internet, celular, suscripciones, gimnasio, mensualidades… Se apartan solos y no bajan tu número del día.</p>
      <div class="chips">${FIXED_SUGGEST.filter((n) => !w.fixed.some((f) => f.name === n)).map((n) => `<button type="button" class="chip" data-wsuggest="${esc(n)}">${icon('plus', 14)}${esc(n)}</button>`).join('')}</div>
      ${w.fixed.map((x, i) => `<div class="wcard">
        ${removeBtn('fixed', i)}
        ${fieldL('Nombre', inp(`fixed.${i}.name`, x.name, { ph: 'Ej. Netflix' }))}
        ${fieldL('Monto', inp(`fixed.${i}.amount`, x.amount, { money: true, ph: '0' }))}
        ${freqFields(`fixed.${i}`, x, FIXED_FREQ)}
        ${fieldL('Se paga con', sel(`fixed.${i}.account`, accs, x.account))}
        <label class="wcheck"><input type="checkbox" data-w="fixed.${i}.autoPost" ${x.autoPost ? 'checked' : ''}><span>Se cobra solo (domiciliado)<small>Lo registro en automático y no te pregunto</small></span></label>
      </div>`).join('')}
      <button type="button" class="btn ghost wide" data-wadd="fixed">${icon('plus', 18)}Agregar gasto fijo</button>`;
  }
  if (step === 5) {
    const t = w.transport;
    const accs = payAccounts().map((a) => [a.key, a.name]);
    return `<h2 class="wtitle">Transporte diario</h2>
      <p class="foot top0">Si usas metro, camión o similar casi diario, aparto esa cantidad para que no te baje el número de cada día. Uber, Didi o taxi cuentan como gasto normal.</p>
      <div class="wcard">
        ${fieldL('¿Cuánto gastas al día?', inp('transport.rate', t.rate, { money: true, ph: '0 si no aplica' }))}
        ${seg('transport.weekdays', [['all', 'Todos los días'], ['lv', 'Lunes a viernes']], t.weekdays)}
        ${accs.length ? fieldL('Normalmente pagas con', sel('transport.account', accs, t.account)) : ''}
      </div>
      <p class="label">Botones rápidos en la pantalla de Hoy</p>
      ${seg('transport.preset', [['none', 'Ninguno'], ['cdmx', 'CDMX: Metro y Metrobús'], ['custom', 'Los míos']], t.preset)}
      ${t.preset === 'custom' ? `<div class="wcard">${[0, 1].map((i) => `<div class="wpair">${fieldL(`Botón ${i + 1}`, inp(`fares.${i}.name`, w.fares[i]?.name, { ph: i ? 'Ej. Camión' : 'Ej. Metro' }))}${fieldL('Monto', inp(`fares.${i}.amount`, w.fares[i]?.amount, { money: true, ph: '0' }))}</div>`).join('')}</div>` : ''}`;
  }
  // Resumen
  const s = build(today);
  let d = null;
  try { d = computeDashboard(s, today); } catch { /* datos incompletos */ }
  const cards = s.accounts.filter((a) => a.type === 'card');
  return `<h2 class="wtitle">Así queda tu plan</h2>
    ${d ? `<section class="hero ${d.safeToSpend > 0 ? 'ok' : 'bad'}"><p class="hero-label">Hoy puedes gastar</p><p class="hero-amount">${money(d.safeToSpend)}</p>
      <p class="hero-note">Periodo del ${fmtDate(d.period.s, false)} al ${fmtDate(d.period.e, false)} (${d.D} días) · ${money(d.base)} por día.</p></section>` : ''}
    <div class="panel">
      <div class="item"><span class="ic hue-gray">${icon('bank', 18)}</span><span class="item-body"><span class="item-title">${s.accounts.filter((a) => a.type !== 'card').length} cuentas</span><span class="item-meta">${esc(s.accounts.filter((a) => a.type !== 'card').map((a) => a.name).join(', '))}</span></span></div>
      <div class="item"><span class="ic hue-gray">${icon('card', 18)}</span><span class="item-body"><span class="item-title">${cards.length ? `${cards.length} tarjeta${cards.length > 1 ? 's' : ''}` : 'Sin tarjetas'}</span><span class="item-meta">${esc(cards.map((a) => a.name).join(', '))}</span></span></div>
      <div class="item"><span class="ic hue-gray">${icon('calendar', 18)}</span><span class="item-body"><span class="item-title">${s.schedules.length} ingresos y gastos fijos</span><span class="item-meta">Puedes cambiarlos cuando quieras en Plan</span></span></div>
    </div>
    ${d && d.deficit ? `<div class="notice bad">${icon('alert')}<p><b>Con lo que tienes no alcanza hasta tu siguiente pago.</b> Revisa tus montos o empieza igual: la app te dirá cuánto te falta.</p></div>` : ''}
    <p class="foot">Todo se puede editar después en <b>Más → Editar</b>.</p>`;
}

function build(today) {
  const fares = w.transport.preset === 'cdmx' ? [{ name: 'Metro', amount: 500 }, { name: 'Metrobús', amount: 600 }]
    : w.transport.preset === 'custom' ? w.fares.filter((f) => f?.name && parseAmount(f.amount)).map((f) => ({ name: f.name, amount: parseAmount(f.amount) })) : [];
  return buildState({ ...w, fares }, today, ctx.token());
}

export function renderWizard(main, c) {
  ctx = c;
  if (!w) { restore(); if (!w) w = fresh(); }
  const today = ctx.today();
  const last = STEPS.length - 1;
  main.innerHTML = `<section class="onboard wizard">
    ${step > 0 ? `<div class="wbar"><button type="button" class="btn sm ghost" data-wgo="${step - 1}" aria-label="Atrás">${icon('chevron', 16, 'flip')}Atrás</button>
      <span class="wsteps">${STEPS.slice(1).map((_, i) => `<i class="${i + 1 <= step ? 'on' : ''}"></i>`).join('')}</span><span class="wcount">${step} de ${last}</span></div>` : ''}
    ${stepHtml(today)}
    ${step > 0 ? `<button type="button" class="btn wide lg" data-wgo="${step === last ? 'finish' : step + 1}">${step === last ? 'Empezar a usarla' : step === 2 && !w.cards.length ? 'No tengo tarjetas' : step === 4 && !w.fixed.length ? 'Omitir por ahora' : 'Siguiente'}</button>` : ''}
  </section>`;
  bind(main);
}

function setPath(path, value) {
  const keys = path.split('.');
  let o = w;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

function validate() {
  if (step === 1 && !moneyAccounts().length) return 'Agrega al menos una cuenta';
  if (step === 2) {
    for (const c of w.cards) {
      if (!c.name.trim()) return 'Ponle nombre a cada tarjeta (o quítala)';
      if (parseAmount(c.statement) > (parseAmount(c.owed) || 0)) return `En ${c.name}, lo que falta pagar no puede ser más de lo que debes`;
    }
  }
  return null;
}

function bind(main) {
  const rerender = () => { save(); renderWizard(main, ctx); };
  main.oninput = (e) => {
    const p = e.target.dataset.w;
    if (!p) return;
    setPath(p, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    save();
  };
  main.onchange = (e) => { if (e.target.tagName === 'SELECT' && e.target.dataset.w) rerender(); };
  main.onclick = (e) => {
    const t = e.target;
    const segBtn = t.closest('[data-wseg] button');
    if (segBtn) { setPath(segBtn.parentElement.dataset.wseg, segBtn.dataset.val); return rerender(); }
    const go = t.closest('[data-wgo]')?.dataset.wgo;
    if (go === 'finish') {
      const s = build(ctx.today());
      clearWizard();
      return ctx.finish(s);
    }
    if (go != null) {
      const n = Number(go);
      if (n > step) { const err = validate(); if (err) return ctx.toast(err); }
      step = n; window.scrollTo(0, 0); return rerender();
    }
    const add = t.closest('[data-wadd]')?.dataset.wadd;
    if (add === 'accounts') w.accounts.push({ key: nextKey('a'), name: '', type: 'bank', balance: '' });
    if (add === 'cards') w.cards.push({ key: nextKey('c'), name: '', owed: '', limit: '', cutDay: '1', dueDay: '20', statement: '' });
    if (add === 'incomes') w.incomes.push({ key: nextKey('i'), name: '', amount: '', freq: 'monthly', day: '1', weekday: '5', account: w.accounts[0]?.key });
    if (add === 'fixed') w.fixed.push({ key: nextKey('f'), name: '', amount: '', freq: 'monthly', day: '1', weekday: '1', account: payAccounts()[0]?.key });
    const sug = t.closest('[data-wsuggest]')?.dataset.wsuggest;
    if (sug) w.fixed.push({ key: nextKey('f'), name: sug, amount: '', freq: 'monthly', day: '1', weekday: '1', account: payAccounts()[0]?.key });
    const del = t.closest('[data-wdel]');
    if (del) w[del.dataset.wdel].splice(Number(del.dataset.i), 1);
    if (add || sug || del) return rerender();
    const act = t.closest('[data-wact]')?.dataset.wact;
    if (act === 'import') $('#import-file').click();
    if (act === 'code') ctx.applyCode($('#config-code').value);
  };
}
