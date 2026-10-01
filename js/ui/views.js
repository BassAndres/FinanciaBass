// Pantallas. Cada función regresa HTML; los botones usan data-action y los maneja app.js.
import { money, fmtDate, diffDays, describeRule } from '../engine/index.js';
import { esc } from './dom.js';
import { icon, badge, catMeta } from './icons.js';

export const CATEGORIES = ['comida', 'transporte', 'antojos', 'escuela', 'salidas', 'salud', 'ropa', 'regalos', 'suscripciones', 'otros'];

const pct = (x) => `${Math.round(x * 100)}%`;
const accName = (state, id) => state.accounts.find((a) => a.id === id)?.name || id || '—';
const liquidAccounts = (state) => state.accounts.filter((a) => (a.type === 'bank' || a.type === 'cash') && !a.archived);
const ACC_ICON = { bank: 'bank', cash: 'cash', savings: 'savings', card: 'card' };

// $1,234.56 con los centavos más chicos.
export function bigMoney(cents) {
  const [int, dec] = money(Math.abs(cents)).slice(1).split('.');
  return `${cents < 0 ? '<span class="neg">−</span>' : ''}<span class="cur">$</span>${int}<span class="dec">.${dec}</span>`;
}

const item = ({ lead, title, meta = '', trail = '', action = '', cls = '' }) =>
  `<${action ? 'button type="button"' : 'div'} class="item ${cls}" ${action}>
    ${lead || ''}<span class="item-body"><span class="item-title">${title}</span>${meta ? `<span class="item-meta">${meta}</span>` : ''}</span>${trail}
  </${action ? 'button' : 'div'}>`;

const group = (title, body, extra = '') => `<section class="group"><div class="group-head"><h2>${title}</h2>${extra}</div>${body}</section>`;

function heroTone(d) {
  if (d.safeToSpend <= 0) return 'bad';
  if (d.safeToSpend < d.base * 0.5) return 'warn';
  return 'ok';
}

export function hoyView(state, d) {
  const P = d.period;
  const payToday = d.payPlan.filter((p) => p.date <= d.today);
  const upcoming = d.payPlan.filter((p) => p.date > d.today).slice(0, 4);
  const review = state.tx.filter((t) => t.review).slice(-5).reverse();
  const c = d.cardOfDay;
  const staleBackup = !state.settings.lastBackupAt || diffDays(d.today, state.settings.lastBackupAt) >= 7;
  const tr = d.transport;
  const quick = [
    ...(state.settings.fares || []).map((f, i) => `<button class="tile" data-action="fare" data-i="${i}">${icon(/bus/i.test(f.name) ? 'bus' : 'metro', 22)}<span>${esc(f.name)}</span><b>${money(f.amount, { decimals: false })}</b></button>`),
    `<button class="tile" data-action="new" data-cat="comida">${icon('food', 22)}<span>Comida</span><b>&nbsp;</b></button>`,
    `<button class="tile" data-action="new" data-cat="antojos">${icon('treat', 22)}<span>Antojo</span><b>&nbsp;</b></button>`,
    `<button class="tile" data-action="new-income">${icon('income', 22)}<span>Me dieron</span><b>dinero</b></button>`,
    `<button class="tile" data-action="new">${icon('plus', 22)}<span>Otro</span><b>&nbsp;</b></button>`,
  ].join('');

  return `
  <header class="top"><p class="eyebrow">${fmtDate(d.today)}</p><h1>Tu día</h1></header>

  <section class="hero ${heroTone(d)}" data-action="breakdown" role="button" tabindex="0" aria-label="Ver cómo se calcula">
    <p class="hero-label">${P.notStarted ? `Tu plan empieza el ${fmtDate(P.s)}` : 'Hoy puedes gastar'}<span class="hero-info">${icon('info', 16)}</span></p>
    <p class="hero-amount">${bigMoney(d.safeToSpend)}</p>
    ${d.disponible < 0 ? `<p class="hero-note">Vas ${money(d.disponible)} abajo${d.recovery ? `. Si ya no gastas, te recuperas el ${fmtDate(d.recovery)}.` : '.'}</p>` : ''}
    ${d.safeToSpend < d.disponible ? `<p class="hero-note">Llevas ${money(d.disponible)} acumulado; te muestro menos para que alcance a tus pagos.</p>` : ''}
    <div class="hero-track"><i style="width:${Math.min(100, Math.round((d.k / d.D) * 100))}%"></i></div>
    <dl class="hero-stats">
      <div><dt>Base diaria</dt><dd>${money(d.base)}</dd></div>
      <div><dt>Quedan</dt><dd>${d.daysLeft} días</dd></div>
      <div><dt>Transporte</dt><dd>${money(tr.spent, { decimals: false })}<small> / ${money(tr.budget, { decimals: false })}</small></dd></div>
    </dl>
  </section>

  <div class="tiles">${quick}</div>

  ${d.deficit ? `<div class="notice bad">${icon('alert')}<p><b>Este periodo no alcanza.</b> Te faltan ${money(-Math.min(d.R, d.libre))}. En <a href="#/plan">Plan</a> puedes saltar un fijo o usar tu alcancía.</p></div>` : ''}
  ${d.liquidity.short ? `<div class="notice warn">${icon('clock')}<p><b>Ojo con el ${fmtDate(d.liquidity.minDate)}.</b> Ese día te faltarían ${money(d.liquidity.short)} (${esc(d.liquidity.cause || 'pagos')}). Ya lo tomé en cuenta en tu número de hoy.</p></div>` : ''}

  ${payToday.length ? group(payToday.every((p) => !p.onDue) ? 'Puedes adelantar hoy' : 'Pagos de tarjeta', `<div class="panel">${payToday.map((p) => item({
    lead: `<span class="ic hue-ink">${icon('card', 18)}</span>`,
    title: `${money(p.amount)} a ${esc(p.cardName)}`,
    meta: p.onDue ? `Vence ${p.due <= d.today ? 'hoy' : `el ${fmtDate(p.due)}`}` : `Opcional · ya tienes el dinero. Fecha límite: ${fmtDate(p.due)}`,
    trail: `<button class="btn sm" data-action="pay" data-card="${esc(p.card)}" data-amount="${p.amount}">Ya pagué</button>`,
  })).join('')}</div>${payToday.some((p) => !p.onDue) ? '<p class="foot">Adelantar es opcional: lo importante es pagar antes de la fecha límite. Si prefieres pagar en la fecha, cámbialo en Más → Editar → Periodo.</p>' : ''}`) : ''}

  ${d.leftover ? `<div class="notice good">${icon('savings')}<p><b>Te sobraron ${money(d.leftover.amount)} el periodo pasado.</b> ¿Los mandas a tu alcancía?</p>
    <div class="notice-actions"><button class="btn sm" data-action="leftover-save">Sí, guardar</button><button class="btn sm ghost" data-action="leftover-keep">Dejarlos</button></div></div>` : ''}

  ${todayGroup(state, d)}

  ${d.prompts.length ? group('Pendientes', `<div class="panel">${d.prompts.map((i) => promptRow(state, i)).join('')}</div>`) : ''}

  ${review.length ? group('Por revisar', `<div class="panel">${review.map((t) => item({
    lead: badge(t.cat), title: `${money(t.amount)} · ${esc(t.desc)}`,
    meta: `${esc(accName(state, t.account))} · ${fmtDate(t.date)} · capturado de una notificación`,
    trail: `<span class="pair"><button class="btn sm" data-action="review-ok" data-id="${t.id}">OK</button><button class="btn sm ghost" data-action="edit-tx" data-id="${t.id}">Editar</button></span>`,
  })).join('')}</div>`) : ''}

  ${c ? group('Si hoy pagas con tarjeta', `<div class="panel">${item({
    lead: `<span class="ic hue-green">${icon('card', 18)}</span>`, title: `Usa ${esc(c.name)}`,
    meta: `La pagas hasta el ${fmtDate(c.pay.due)} (${c.pay.days} días) · uso ${c.util != null ? pct(c.util) : '—'}`,
  })}</div>`) : ''}

  ${upcoming.length ? group('Próximos pagos', `<div class="panel">${upcoming.map((p) => item({
    lead: `<span class="date-chip"><b>${fmtDate(p.date, false).split(' ')[0]}</b>${fmtDate(p.date, false).split(' ')[1]}</span>`,
    title: esc(p.cardName), meta: p.onDue ? 'Fecha límite' : `Adelanto sugerido · límite ${fmtDate(p.due, false)}`, trail: `<b class="amt">${money(p.amount)}</b>`,
  })).join('')}</div>`, '<a class="link" href="#/tarjetas">Ver todo</a>') : ''}

  ${staleBackup ? `<div class="notice">${icon('shield')}<p><b>Haz un respaldo.</b> Tus datos solo viven en este celular.</p><div class="notice-actions"><button class="btn sm ghost" data-action="backup">Respaldar</button></div></div>` : ''}
  `;
}

function todayGroup(state, d) {
  const txs = [...d.todayTx].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!txs.length) return group('Hoy', `<div class="panel"><div class="item"><span class="ic hue-gray">${icon('list', 18)}</span><span class="item-body"><span class="item-title">Aún no registras gastos hoy</span><span class="item-meta">Usa los botones de arriba o el + para registrar</span></span></div></div>`);
  return group('Hoy', `<div class="panel">${txs.map((t) => item({
    action: `data-action="edit-tx" data-id="${t.id}"`,
    lead: badge(t.type === 'income' ? (t.cat === 'reembolso' ? 'reembolso' : 'ingreso') : t.planned ? 'fijo' : t.cat),
    title: esc(t.desc || catMeta(t.type === 'income' ? 'ingreso' : t.cat).label),
    meta: `${esc(accName(state, t.account))}${t.pooled ? ' · del apartado de transporte' : t.planned ? ' · ya estaba contemplado' : t.type === 'income' ? ' · suma a tu número' : ''}`,
    trail: `<b class="amt ${t.pooled || t.planned ? 'mute' : t.type === 'income' ? 'pos' : ''}">${t.type === 'income' ? money(t.amount, { sign: true }) : money(-t.amount)}</b>`,
  })).join('')}</div>`, `<span class="group-sum">${d.todaySpent > 0 ? `−${money(d.todaySpent)} de tu número` : d.todaySpent < 0 ? `+${money(-d.todaySpent)} a tu número` : ''}</span>`);
}

function promptRow(state, i) {
  const q = i.kind === 'income'
    ? (i.status === 'overdue' ? `¿Llegó ${esc(i.name)}?` : `¿Ya llegó ${esc(i.name)}?`)
    : i.kind === 'savings' ? `¿Apartaste ${esc(i.name)}?` : `¿Ya se cobró ${esc(i.name)}?`;
  const lead = badge(i.kind === 'income' ? 'ingreso' : i.kind === 'savings' ? 'ahorro' : i.kind === 'msi' ? 'msi' : 'fijo');
  return `<div class="item stack">${lead}<span class="item-body"><button type="button" class="item-title plain" data-action="inst-open" data-id="${esc(i.id)}">${q} ${icon('chevron', 14, 'mute inline')}</button>
    <span class="item-meta">${money(i.amount)} · ${esc(accName(state, i.account))} · ${fmtDate(i.date)}${i.status === 'overdue' ? ' · no lo cuento hasta que llegue' : ''}</span>
    <span class="pair">
      <button class="btn sm" data-action="inst-yes" data-id="${esc(i.id)}">Sí</button>
      <button class="btn sm ghost" data-action="inst-open" data-id="${esc(i.id)}">Otra cantidad</button>
      <button class="btn sm ghost" data-action="inst-skip" data-id="${esc(i.id)}">${i.kind === 'income' ? 'No llegó' : 'Saltar'}</button>
    </span></span></div>`;
}

export function movsView(state, d) {
  const P = d.period;
  const list = state.tx.filter((t) => t.date >= P.s && t.date <= d.today).sort((a, b) => (a.date === b.date ? (b.ts || 0) - (a.ts || 0) : a.date < b.date ? 1 : -1));
  const byDay = {};
  for (const t of list) (byDay[t.date] ||= []).push(t);
  const spent = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const sign = (t) => (t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0);
  const catOf = (t) => (t.type === 'transfer' ? (t.cat === 'ahorro' ? 'ahorro' : t.cat === 'pago' ? 'pago' : 'mover') : t.type === 'adjust' ? 'ajuste' : t.type === 'income' ? 'ingreso' : t.cat);
  return `<header class="top"><p class="eyebrow">Desde el ${fmtDate(P.s)}</p><h1>Movimientos</h1></header>
    <div class="summary"><div><small>Gastado en el periodo</small><b>${money(spent)}</b></div><div><small>Movimientos</small><b>${list.length}</b></div></div>
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, txs]) => group(fmtDate(day), `<div class="panel">${txs.map((t) => item({
      action: `data-action="edit-tx" data-id="${t.id}"`,
      lead: badge(catOf(t)),
      title: esc(t.desc || (t.type === 'transfer' ? `${accName(state, t.account)} → ${accName(state, t.to)}` : catMeta(catOf(t)).label)),
      meta: `${esc(accName(state, t.account))}${t.review ? ' · por revisar' : ''}`,
      trail: `<b class="amt ${sign(t) > 0 ? 'pos' : sign(t) === 0 ? 'mute' : ''}">${t.type === 'adjust' ? money(t.amount, { sign: true }) : sign(t) > 0 ? money(t.amount, { sign: true }) : sign(t) < 0 ? money(-t.amount) : money(t.amount)}</b>`,
    })).join('')}</div>`)).join('') : `<div class="empty">${icon('list', 28)}<p>Aún no hay movimientos en este periodo.</p></div>`}`;
}

export function tarjetasView(state, d) {
  const stByCard = {};
  for (const s of d.statements) (stByCard[s.card] ||= []).push(s);
  const total = d.cards.reduce((s, c) => s + c.owed, 0);
  return `<header class="top"><p class="eyebrow">Debes en total ${money(total)}</p><h1>Tarjetas</h1></header>
  ${d.cards.map((c) => {
    const tone = c.util == null ? '' : c.util <= 0.3 ? 'ok' : c.util <= 0.5 ? 'warn' : 'bad';
    return `<article class="ccard">
      <div class="ccard-head">
        <div><button type="button" class="ccard-name plain" data-action="acc-edit" data-acc="${esc(c.id)}">${esc(c.name)}${c.blocked ? ' <span class="tag">bloqueada</span>' : ''} ${icon('adjust', 14, 'mute inline')}</button>
        <p class="ccard-sub">${c.pay ? `Próximo corte ${fmtDate(c.pay.cut, false)} · si compras hoy, lo pagas hasta el ${fmtDate(c.pay.due, false)}` : 'Sin fechas de corte'}</p></div>
        <p class="ccard-owed">${bigMoney(c.owed)}</p>
      </div>
      ${c.limit ? `<div class="meter ${tone}"><i style="width:${Math.min(100, Math.round((c.util || 0) * 100))}%"></i><span class="meter-mark"></span></div>
      <p class="ccard-sub">Usas ${pct(c.util || 0)} de ${money(c.limit, { decimals: false })}${c.msi ? ` · incluye ${money(c.msi)} a meses` : ''}</p>` : ''}
      ${(stByCard[c.id] || []).map((s) => {
    const sugg = d.payPlan.filter((p) => p.statement === s.id && !p.onDue);
    return `<div class="due" data-action="stmt-edit" data-id="${esc(s.id)}" role="button">${icon('calendar', 18)}<p>
      <b>${money(s.remaining)}</b> a pagar a más tardar el <b>${fmtDate(s.due)}</b> (fecha límite, sin intereses).
      ${s.payFrom && s.payFrom > d.today ? `<br>${s.cut ? `Es lo que llevas en este ciclo: corta el ${fmtDate(s.cut, false)}. ` : ''}El banco te deja pagarlo desde el ${fmtDate(s.payFrom)}.` : ''}
      ${s.paid ? `<br>Ya abonaste ${money(s.paid)}.` : ''}
      ${sugg.length ? `<br><span class="sugg">Sugerido: ${sugg.map((p) => `${money(p.amount)} ${p.date <= d.today ? 'hoy' : `el ${fmtDate(p.date, false)}`}`).join(', ')}</span>` : ''}</p></div>`;
  }).join('')}
      <div class="ccard-actions">
        <button class="btn sm" data-action="pay" data-card="${esc(c.id)}">${icon('pay', 16)}Pagar</button>
        <button class="btn sm ghost" data-action="stmt-new" data-card="${esc(c.id)}">Estado de cuenta</button>
        <button class="btn sm ghost" data-action="adjust" data-acc="${esc(c.id)}">Saldo real</button>
      </div>
    </article>`;
  }).join('')}
  ${d.payPlan.length ? group('Plan de pagos', `<div class="panel">${d.payPlan.map((p) => item({
    lead: `<span class="date-chip"><b>${fmtDate(p.date, false).split(' ')[0]}</b>${fmtDate(p.date, false).split(' ')[1]}</span>`,
    title: esc(p.cardName), meta: p.onDue ? 'En su fecha límite' : `Adelanto opcional · límite ${fmtDate(p.due, false)}`, trail: `<b class="amt">${money(p.amount)}</b>`,
  })).join('')}</div><p class="foot">${state.settings.payStrategy === 'due' ? 'Pagas cada tarjeta en su fecha límite.' : 'Te sugiero abonar en cuanto tengas el dinero (lo elegiste así). La fecha que importa es la límite.'} Siempre deja al menos ${money(state.settings.liquidityFloor)} en tu cuenta.</p>`)
    : `<div class="empty">${icon('check', 28)}<p>Sin pagos pendientes registrados.</p></div>`}`;
}

export function planView(state, d) {
  const P = d.period;
  const st = { done: ['check', 'green'], skipped: ['skip', 'gray'], overdue: ['alert', 'amber'], due: ['clock', 'amber'], pending: ['clock', 'gray'] };
  return `<header class="top"><p class="eyebrow">${fmtDate(P.s, false)} – ${fmtDate(P.e, false)} · ${P.D} días</p><h1>Plan</h1></header>
  <div class="summary">
    <div><small>Libre en el periodo</small><b>${money(d.libre)}</b></div>
    <div><small>Base diaria</small><b>${money(d.base)}</b></div>
    <div><small>Dinero neto hoy</small><b>${money(d.net)}</b></div>
  </div>
  <p class="foot">Dinero neto = efectivo + banco − lo que debes en tarjetas. <button class="link" data-action="rebase">Repartir lo que queda en los días que faltan</button></p>

  ${group('Este periodo', `<div class="panel">${d.instances.map((i) => item({
    action: `data-action="inst-open" data-id="${esc(i.id)}"`,
    lead: `<span class="ic hue-${st[i.status][1]}">${icon(st[i.status][0], 18)}</span>`,
    title: esc(i.name), meta: `${fmtDate(i.date)} · ${esc(accName(state, i.account))} · ${{ done: i.kind === 'income' ? 'llegó' : 'pagado', skipped: 'saltado', overdue: 'no ha llegado', due: 'pendiente', pending: 'próximo' }[i.status]}`,
    trail: `<b class="amt ${i.kind === 'income' ? 'pos' : ''} ${i.status === 'skipped' ? 'strike' : ''}">${money(i.status === 'done' ? i.value : i.signed, { sign: i.kind === 'income' })}</b>${icon('chevron', 16, 'mute')}`,
  })).join('')}</div><p class="foot">Toca cualquiera para marcarlo, cambiar el monto de este mes o saltarlo.</p>`)}

  ${group('Se repite', `<div class="panel">${state.schedules.map((s) => item({
    action: `data-action="sched-edit" data-id="${esc(s.id)}"`,
    lead: badge(s.kind === 'income' ? 'ingreso' : s.kind === 'savings' ? 'ahorro' : s.kind === 'msi' ? 'msi' : 'fijo'),
    title: esc(s.name), meta: `${describeRule(s.rule)} · ${esc(accName(state, s.account))}${s.autoPost ? ' · automático' : ''}`,
    trail: `<b class="amt ${s.kind === 'income' ? 'pos' : ''}">${money(s.amount)}</b>${icon('chevron', 16, 'mute')}`,
  })).join('')}</div><button class="btn ghost wide" data-action="sched-new">${icon('plus', 18)}Agregar ingreso o gasto fijo</button>`)}

  ${group('Recordatorios', `<div class="panel">
    ${item({ lead: `<span class="ic hue-blue">${icon('bell', 18)}</span>`, title: 'Agrega tus pagos a tu calendario', meta: 'La app no puede avisarte sola; tu calendario sí.', trail: `<button class="btn sm ghost" data-action="ics">${icon('download', 16)}.ics</button>` })}
    ${(d.reminders || []).map((e) => `<a class="item" href="${esc(e.gcal)}" target="_blank" rel="noopener">
      <span class="date-chip"><b>${fmtDate(e.date, false).split(' ')[0]}</b>${fmtDate(e.date, false).split(' ')[1]}</span>
      <span class="item-body"><span class="item-title">${esc(e.title)}</span><span class="item-meta">Agregar a Google Calendar</span></span>${icon('arrow', 16, 'mute')}</a>`).join('')}
  </div>`)}`;
}

export function masView(state, d) {
  const st = state.settings;
  const base = location.href.split(/[?#]/)[0];
  const tok = st.quickAdd?.token || '';
  const macro = `${base}?raw={notification}&src=nu&id={system_time}&k=${tok}`;
  const util = d.cards.filter((c) => c.util != null);
  const totalLimit = util.reduce((s, c) => s + c.limit, 0);
  const totalUsed = util.reduce((s, c) => s + c.owed + c.msi, 0);
  const tips = [
    ['check', 'Paga siempre el <b>pago para no generar intereses</b>. Nunca solo el mínimo.'],
    ['clock', 'Paga desde el mismo banco o 2 días hábiles antes. Si la fecha cae en día inhábil se recorre, pero no lo dejes al final.'],
    ['card', 'Deja 1 o 2 cargos chicos fijos en cada tarjeta y domicilia el pago: así todas se mantienen activas.'],
    ['calendar', 'Compras grandes justo después del corte: hasta ~50 días para pagar en Santander y Banamex, ~40 en Nu.'],
    ['msi', 'Meses sin intereses solo si ya tienes el dinero. La app cuenta cada mensualidad en su mes.'],
    ['shield', 'No saques efectivo con tarjeta de crédito, no abras más tarjetas y no canceles la más antigua.'],
    ['trend', 'Pide gratis tu Reporte de Crédito Especial una vez al año en Buró y en Círculo de Crédito.'],
  ];
  return `<header class="top"><p class="eyebrow">Ajustes y consejos</p><h1>Más</h1></header>

  ${totalLimit ? `<div class="summary"><div><small>Uso de tu crédito</small><b>${pct(totalUsed / totalLimit)}</b></div><div><small>De un total de</small><b>${money(totalLimit, { decimals: false })}</b></div></div>
  <p class="foot">Menos de 30% es bueno para tu historial; menos de 10% es excelente.</p>` : ''}

  ${group('Para tu historial', `<div class="panel">${tips.map(([ic, t]) => `<div class="item"><span class="ic hue-gray">${icon(ic, 18)}</span><span class="item-body"><span class="item-text">${t}</span></span></div>`).join('')}</div>`)}

  ${group('Mis cuentas', `<div class="panel">${state.accounts.filter((a) => !a.archived).map((a) => item({
    action: `data-action="adjust" data-acc="${esc(a.id)}"`,
    lead: `<span class="ic hue-gray">${icon(ACC_ICON[a.type], 18)}</span>`,
    title: esc(a.name), meta: { bank: 'Banco', cash: 'Efectivo', savings: 'Alcancía, no se gasta', card: 'Lo que debes' }[a.type],
    trail: `<b class="amt">${money(d.balances[a.id] || 0)}</b>${icon('adjust', 16, 'mute')}`,
  })).join('')}</div><p class="foot">Toca una cuenta para poner su saldo real si no cuadra.</p>`)}

  ${group('Captura automática', `<div class="panel pad">
    <ol class="steps">
      <li>Instala <b>MacroDroid</b> desde Play Store. La versión gratis alcanza.</li>
      <li>Toca <b>Agregar macro</b>. En <i>Disparadores</i> elige <b>Notificación → Notificación recibida</b> y selecciona la app <b>Nu</b>.</li>
      <li>En <i>Acciones</i> elige <b>Aplicaciones → Abrir sitio web/URL</b> y pega la dirección de abajo.</li>
      <li>Guarda la macro y haz una compra de prueba (el metro sirve).</li>
    </ol>
    <textarea readonly class="mono" rows="3">${esc(macro)}</textarea>
    <button class="btn sm" data-action="copy-macro" data-text="${esc(macro)}">${icon('copy', 16)}Copiar dirección</button>
    <p class="foot">Para otro banco copia la macro y cambia <code>src=nu</code> por ${Object.keys(st.quickAdd?.sources || {}).filter((k) => k !== 'nu').map((k) => `<code>${esc(k)}</code>`).join(', ') || 'su nombre'}. El metro va solo a Transporte; lo demás queda en “Por revisar”.</p>
  </div>`)}

  ${group('Editar', `<div class="panel">
    ${[
    ['acc-list', 'card', 'Cuentas y tarjetas', 'Nombres, límites, días de corte y de pago'],
    ['sched-list', 'calendar', 'Ingresos y gastos fijos', 'Sueldo, beca, TotalPass, Claude, MSI, ahorro'],
    ['stmt-list', 'pay', 'Estados de cuenta', 'Lo que debes pagar de cada tarjeta'],
    ['fares', 'metro', 'Botones rápidos', 'Metro, Metrobús y los que quieras'],
    ['period', 'more', 'Periodo, transporte y colchón', 'Fechas, apartado diario, mínimo en cuenta'],
  ].map(([a, ic, t, m]) => item({ action: `data-action="${a}"`, lead: `<span class="ic hue-gray">${icon(ic, 18)}</span>`, title: t, meta: m, trail: icon('chevron', 16, 'mute') })).join('')}
  </div>`)}

  ${group('Respaldo', `<div class="panel pad">
    <p class="foot top0">Tus datos viven solo en este celular. Si borras los datos de Chrome sin respaldo, se pierden. Último respaldo: <b>${st.lastBackupAt ? fmtDate(st.lastBackupAt) : 'nunca'}</b>.</p>
    <div class="pair wrap">
      <button class="btn sm" data-action="backup">${icon('download', 16)}Respaldar</button>
      <button class="btn sm ghost" data-action="import">${icon('upload', 16)}Restaurar</button>
      <button class="btn sm ghost" data-action="config">${icon('code', 16)}Código FB1</button>
    </div>
    <input type="file" id="import-file" accept=".txt,.json,application/json,text/plain" hidden>
  </div>`)}
  <button class="btn ghost danger wide" data-action="reset">${icon('trash', 18)}Borrar todo</button>
  <p class="colophon">FinanciaBass · tus números nunca salen de tu celular</p>`;
}

export function onboardingView() {
  return `<section class="onboard">
    <div class="brand-mark">${icon('savings', 30)}</div>
    <h1>FinanciaBass</h1>
    <p class="lead">Cada día sabes cuánto puedes gastar. Pagas tus tarjetas a tiempo y lo que no uses se ahorra.</p>
    <div class="panel pad">
      <h2>¿Tienes un código?</h2>
      <p class="foot top0">Empieza con <code>FB1.</code> y trae tus cuentas, tarjetas, ingresos y pagos.</p>
      <textarea id="config-code" rows="4" placeholder="FB1…"></textarea>
      <button class="btn wide" data-action="config-apply">Cargar mis datos</button>
    </div>
    <div class="panel pad">
      <h2>Empezar desde cero</h2>
      <label class="item"><span class="item-body"><span class="item-title">¿Cuánto tienes en el banco?</span></span><input id="ob-bank" type="number" inputmode="decimal"></label>
      <label class="item"><span class="item-body"><span class="item-title">¿Y en efectivo?</span></span><input id="ob-cash" type="number" inputmode="decimal"></label>
      <button class="btn ghost wide" data-action="blank-start">Empezar</button>
    </div>
    <p class="colophon">${icon('shield', 16)} Tus datos se guardan solo en este celular.</p>
  </section>`;
}

// Hoja para registrar un movimiento.
export function entrySheet(state, draft, candidates = []) {
  const types = [['expense', 'Gasto'], ['income', 'Ingreso'], ['pay', 'Pagar tarjeta'], ['transfer', 'Mover'], ['adjust', 'Saldo real']];
  const accs = state.accounts.filter((a) => !a.archived);
  const fromList = draft.type === 'expense' ? accs.filter((a) => a.type !== 'savings')
    : draft.type === 'income' ? accs.filter((a) => a.type !== 'card')
      : draft.type === 'pay' ? liquidAccounts(state) : accs;
  const toList = draft.type === 'pay' ? accs.filter((a) => a.type === 'card') : accs;
  const chips = (list, key, sel) => `<div class="chips">${list.map((a) => `<button type="button" class="chip ${a.id === sel ? 'on' : ''}" data-pick="${key}" data-val="${esc(a.id)}">${icon(ACC_ICON[a.type], 16)}${esc(a.name)}</button>`).join('')}</div>`;
  return `
  <div class="seg">${types.map(([k, l]) => `<button type="button" class="${draft.type === k ? 'on' : ''}" data-pick="type" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="amount-display">${draft.type === 'adjust' ? '<small>¿Cuánto hay realmente?</small>' : ''}<span class="cur">$</span><span class="num">${esc(draft.amountText || '0')}</span></div>
  <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => `<button type="button" data-key="${k}" ${k === 'del' ? 'aria-label="Borrar"' : ''}>${k === 'del' ? icon('backspace', 22) : k}</button>`).join('')}</div>
  <p class="label">${draft.type === 'income' ? 'Entra a' : draft.type === 'adjust' ? 'Cuenta' : draft.type === 'expense' ? 'Pagué con' : 'Sale de'}</p>
  ${chips(fromList, 'account', draft.account)}
  ${draft.type === 'pay' || draft.type === 'transfer' ? `<p class="label">${draft.type === 'pay' ? 'Tarjeta' : 'Hacia'}</p>${chips(toList.filter((a) => a.id !== draft.account), 'to', draft.to)}` : ''}
  ${candidates.length ? `<p class="label">¿Es algo que ya tenías planeado?</p><div class="chips">
    <button type="button" class="chip ${!draft.planRef || draft.planRef === 'none' ? 'on' : ''}" data-pick="planRef" data-val="none">No, es otro ${draft.type === 'income' ? 'ingreso' : 'gasto'}</button>
    ${candidates.map((i) => `<button type="button" class="chip ${draft.planRef === i.id ? 'on' : ''}" data-pick="planRef" data-val="${esc(i.id)}">${icon(i.kind === 'income' ? 'income' : 'pin', 16)}${esc(i.name)} · ${money(i.amount, { decimals: false })}</button>`).join('')}
  </div>` : ''}
  ${draft.type === 'expense' ? `<p class="label">Categoría</p><div class="chips">${CATEGORIES.map((k) => `<button type="button" class="chip ${draft.cat === k ? 'on' : ''}" data-pick="cat" data-val="${k}">${icon(catMeta(k).icon, 16)}${catMeta(k).label}</button>`).join('')}</div>` : ''}
  ${draft.type === 'income' ? `<p class="label">¿De quién?</p><div class="chips">${['Amigo', 'Mamá', 'Papá', 'Familia', 'Venta', 'Otro'].map((w) => `<button type="button" class="chip ${draft.desc === w ? 'on' : ''}" data-pick="desc" data-val="${w}">${w}</button>`).join('')}</div>` : ''}
  ${draft.type === 'expense' && !draft.id ? `<details class="refund" ${draft.refund || draft.refundOpen ? 'open' : ''}><summary>${icon('income', 16)}¿Alguien te regresó una parte?</summary>
    <p class="foot top0">Ej.: pagaste $150 y tu amigo te dio $100 en efectivo. Solo se descuentan $50.</p>
    <div class="refund-row"><span class="pre">$</span><input class="field" type="text" inputmode="decimal" placeholder="0" value="${esc(draft.refund || '')}" data-field="refund"></div>
    <div class="chips">${state.accounts.filter((a) => (a.type === 'bank' || a.type === 'cash') && !a.archived).map((a) => `<button type="button" class="chip ${(draft.refundAccount || state.accounts.find((x) => x.type === 'cash')?.id) === a.id ? 'on' : ''}" data-pick="refundAccount" data-val="${esc(a.id)}">${icon(ACC_ICON[a.type], 16)}${esc(a.name)}</button>`).join('')}</div>
  </details>` : ''}
  <div class="fields">
    ${draft.type !== 'adjust' ? `<input class="field" type="text" placeholder="Descripción (opcional)" value="${esc(draft.desc || '')}" data-field="desc">` : ''}
    <input class="field" type="date" value="${esc(draft.date)}" data-field="date" aria-label="Fecha">
  </div>
  <button type="button" class="btn wide lg" data-sheet-action="save">${draft.id ? 'Guardar cambios' : 'Guardar'}</button>
  ${draft.id ? `<button type="button" class="btn ghost danger wide" data-sheet-action="delete">${icon('trash', 18)}Borrar movimiento</button>` : ''}`;
}
