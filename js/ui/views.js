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
    ...(d.env?.os === 'ios' || state.settings.capture?.paste ? [`<button class="tile" data-action="paste">${icon('paste', 22)}<span>Pegar</span><b>compra</b></button>`] : []),
    `<button class="tile" data-action="new">${icon('plus', 22)}<span>Otro</span><b>&nbsp;</b></button>`,
  ].join('');

  return `
  <header class="top"><p class="eyebrow">${fmtDate(d.today)}</p><h1>Tu día</h1></header>

  <section class="hero ${heroTone(d)}" data-action="breakdown" role="button" tabindex="0" aria-label="Ver cómo se calcula">
    <p class="hero-label">${P.notStarted ? `Tu plan empieza el ${fmtDate(P.s)}` : 'Hoy puedes gastar'}<span class="hero-info">${icon('info', 16)}</span></p>
    <p class="hero-amount">${bigMoney(d.safeToSpend)}</p>
    ${d.disponible < 0 ? `<p class="hero-note">Vas ${money(d.disponible)} abajo${d.recovery ? `. Si ya no gastas, te recuperas el ${fmtDate(d.recovery)}.` : '.'}</p>` : ''}
    ${d.safeToSpend < d.disponible ? `<p class="hero-note">Llevas ${money(d.disponible)} acumulado; te muestro menos para que alcance a tus pagos.</p>` : ''}
    <div class="hero-track" title="Lo que llevas gastado de lo que tenías hoy"><i style="width:${d.startOfDay > 0 ? Math.min(100, Math.max(0, Math.round((d.todaySpent / d.startOfDay) * 100))) : 100}%"></i></div>
    <dl class="hero-stats">
      <div><dt>Empezaste hoy con</dt><dd>${money(d.startOfDay)}</dd></div>
      <div><dt>Gastado hoy</dt><dd>${money(Math.max(0, d.todaySpent))}</dd></div>
      ${yesterdayStat(d)}
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

  ${moneyGroup(state, d)}

  ${upcoming.length ? group('Próximos pagos', `<div class="panel">${upcoming.map((p) => item({
    lead: `<span class="date-chip"><b>${fmtDate(p.date, false).split(' ')[0]}</b>${fmtDate(p.date, false).split(' ')[1]}</span>`,
    title: esc(p.cardName), meta: p.onDue ? 'Fecha límite' : `Adelanto sugerido · límite ${fmtDate(p.due, false)}`, trail: `<b class="amt">${money(p.amount)}</b>`,
  })).join('')}</div>`, '<a class="link" href="#/tarjetas">Ver todo</a>') : ''}

  ${installNotice(state, d)}
  ${staleBackup ? `<div class="notice">${icon('shield')}<p><b>Haz un respaldo.</b> Tus datos solo viven en este celular.</p><div class="notice-actions"><button class="btn sm ghost" data-action="backup">Respaldar</button></div></div>` : ''}
  `;
}

// En iPhone, Safari borra los datos de un sitio que no se usa en 7 días; instalada en la pantalla de inicio no.
function installNotice(state, d) {
  const env = d.env || {};
  if (env.standalone || env.os === 'other' || state.dismissed['install']) return '';
  const how = env.os === 'ios'
    ? 'En Safari toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>. Así tus datos no se borran y se abre como app.'
    : 'En Chrome toca <b>⋮</b> y luego <b>Instalar app</b> (o <b>Agregar a la pantalla principal</b>).';
  return `<div class="notice">${icon('phone')}<p><b>Instálala en tu celular.</b> ${how}</p><div class="notice-actions">${env.canInstall ? '<button class="btn sm" data-action="install">Instalar</button>' : ''}<button class="btn sm ghost" data-action="dismiss" data-key="install">Ya entendí</button></div></div>`;
}

function yesterdayStat(d) {
  const y = (d.history || [])[1];
  if (!y) return `<div><dt>Base diaria</dt><dd>${money(d.base)}</dd></div>`;
  return y.end >= 0
    ? `<div><dt>Ayer te sobró</dt><dd class="up">+${money(y.end).slice(0)}</dd></div>`
    : `<div><dt>Ayer te pasaste</dt><dd class="down">${money(-y.end)}</dd></div>`;
}

// Cuánto dinero tienes y en dónde, y con qué tarjeta conviene pagar hoy.
function moneyGroup(state, d) {
  const pockets = state.accounts.filter((a) => !a.archived && a.type !== 'card');
  const rec = d.cardOfDay;
  const cards = d.cards.filter((c) => c.limit);
  return group('Tu dinero', `
    <div class="pockets">${pockets.map((a) => `<button type="button" class="pocket" data-action="adjust" data-acc="${esc(a.id)}">
      ${icon(ACC_ICON[a.type], 18)}<span>${esc(a.name)}</span><b>${money(d.balances[a.id] || 0)}</b></button>`).join('')}</div>
    ${cards.length ? `<div class="panel">${cards.map((c) => {
      const room = Math.max(0, Math.floor(c.limit * 0.3) - c.owed - c.msi);
      const isRec = rec && rec.id === c.id;
      return item({
        lead: `<span class="ic ${isRec ? 'hue-ink' : 'hue-gray'}">${icon('card', 18)}</span>`,
        title: `${esc(c.name)}${isRec ? ' <span class="badge">Mejor hoy</span>' : ''}${c.blocked ? ' <span class="tag">bloqueada</span>' : ''}`,
        meta: c.pay ? `${isRec ? 'Lo que compres hoy lo pagas' : 'Pagas lo de hoy'} hasta el ${fmtDate(dueToday(d, c), false)} (${daysTo(d, dueToday(d, c))} días)` : '',
        trail: `<span class="trail-col"><b class="amt">${money(room, { decimals: false })}</b><small class="mute">${room ? 'sin pasar 30%' : 'ya pasaste 30%'}</small></span>`,
      });
    }).join('')}</div><p class="foot">Con tarjeta, usa la marcada como "Mejor hoy": te da más días para pagar y no subes tu uso de más del 30%. Tu número de hoy aplica igual en efectivo o tarjeta.</p>` : ''}`);
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
    ${(d.history || []).length ? group('Cómo te fue', `<div class="panel">${d.history.map((h) => item({
      lead: `<span class="date-chip"><b>${fmtDate(h.date, false).split(' ')[0]}</b>${fmtDate(h.date, false).split(' ')[1]}</span>`,
      title: h.closed ? (h.end >= 0 ? `Te sobraron ${money(h.end)}` : `Te pasaste ${money(-h.end)}`) : `Hoy: te quedan ${money(h.end)}`,
      meta: `Empezaste con ${money(h.start)} · gastaste ${money(Math.max(0, h.spent))}`,
      trail: `<span class="dot ${h.end >= 0 ? 'ok' : 'bad'}"></span>`,
    })).join('')}</div><p class="foot">Lo que sobra (o lo que te pasas) se suma al día siguiente.</p>`) : ''}
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, txs]) => group(fmtDate(day), `<div class="panel">${txs.map((t) => item({
      action: `data-action="edit-tx" data-id="${t.id}"`,
      lead: badge(catOf(t)),
      title: esc(t.desc || (t.type === 'transfer' ? `${accName(state, t.account)} → ${accName(state, t.to)}` : catMeta(catOf(t)).label)),
      meta: `${esc(accName(state, t.account))}${t.review ? ' · por revisar' : ''}`,
      trail: `<b class="amt ${sign(t) > 0 ? 'pos' : sign(t) === 0 ? 'mute' : ''}">${t.type === 'adjust' ? money(t.amount, { sign: true }) : sign(t) > 0 ? money(t.amount, { sign: true }) : sign(t) < 0 ? money(-t.amount) : money(t.amount)}</b>`,
    })).join('')}</div>`)).join('') : `<div class="empty">${icon('list', 28)}<p>Aún no hay movimientos en este periodo.</p></div>`}`;
}

// Fecha en que pagas lo que compres hoy: si ya capturaste el estado de cuenta de ese corte, manda su fecha.
const dueToday = (d, c) => d.statements.find((s) => s.card === c.id && s.cut && s.cut === c.pay?.cut)?.due || c.pay?.due;
const daysTo = (d, date) => Math.round((Date.parse(date) - Date.parse(d.today)) / 864e5);

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
        <p class="ccard-sub">${c.pay ? `Próximo corte ${fmtDate(c.pay.cut, false)} · lo que compres hoy entra en ese corte y lo pagas a más tardar el ${fmtDate(dueToday(d, c), false)}` : 'Sin fechas de corte'}</p></div>
        <p class="ccard-owed">${bigMoney(c.owed)}</p>
      </div>
      ${c.limit ? `<div class="meter ${tone}"><i style="width:${Math.min(100, Math.round((c.util || 0) * 100))}%"></i><span class="meter-mark"></span></div>
      <p class="ccard-sub">Usas ${pct(c.util || 0)} de ${money(c.limit, { decimals: false })}${c.msi ? ` · incluye ${money(c.msi)} a meses` : ''}</p>` : ''}
      ${(stByCard[c.id] || []).map((s) => {
    const sugg = d.payPlan.filter((p) => p.statement === s.id && !p.onDue);
    return `<div class="due" data-action="stmt-edit" data-id="${esc(s.id)}" role="button">${icon('calendar', 18)}<p>
      <b>${money(s.remaining)}</b> a pagar a más tardar el <b>${fmtDate(s.due)}</b> (fecha límite, sin intereses).
      ${s.live === 'bill' ? `<br>Ya cortó el ${fmtDate(s.cut, false)}: es lo que debías a esa fecha menos lo que ya pagaste.` : ''}
      ${s.payFrom && s.payFrom > d.today ? `<br>${s.cut ? `Es lo que llevas en este ciclo (se actualiza con cada compra): corta el ${fmtDate(s.cut, false)}. ` : ''}El banco te deja pagarlo desde el ${fmtDate(s.payFrom)}.` : ''}
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
  const st = { done: ['check', 'green'], skipped: ['skip', 'gray'], overdue: ['alert', 'amber'], due: ['clock', 'amber'], pending: ['clock', 'gray'], scheduled: ['calendar', 'blue'] };
  return `<header class="top"><p class="eyebrow">${fmtDate(P.s, false)} – ${fmtDate(P.e, false)} · ${P.D} días</p><h1>Plan</h1></header>
  <div class="summary">
    <div><small>Libre en el periodo</small><b>${money(d.libre)}</b></div>
    <div><small>Base diaria</small><b>${money(d.base)}</b></div>
    <div><small>Dinero neto hoy</small><b>${money(d.net)}</b></div>
  </div>
  ${d.outlook ? `<div class="panel pad outlook">
    <p class="ol-title">${icon('trend', 18)} ¿Sales adelante?</p>
    <p class="ol-big">${d.outlook.free > 0 ? 'Sí.' : 'Ojo.'} Tu techo es <b>${money(d.outlook.ceiling)}</b> al día</p>
    <p class="foot top0">En un mes normal te entran ${money(d.outlook.income, { decimals: false })}, tus fijos son ${money(d.outlook.fixed, { decimals: false })} y el transporte ${money(d.outlook.transport, { decimals: false })}. Si en promedio gastas más de ${money(d.outlook.ceiling, { decimals: false })} al día, empiezas a acumular deuda. Gastando ${money(d.outlook.withSavings, { decimals: false })} al día ahorras ${money(d.outlook.savings, { decimals: false })} al mes.</p>
  </div>` : ''}
  <p class="foot">Dinero neto = efectivo + banco − lo que debes en tarjetas. <button class="link" data-action="rebase">Repartir lo que queda en los días que faltan</button></p>

  ${group('Este periodo', `<div class="panel">${d.instances.map((i) => item({
    action: `data-action="inst-open" data-id="${esc(i.id)}"`,
    lead: `<span class="ic hue-${st[i.status][1]}">${icon(st[i.status][0], 18)}</span>`,
    title: esc(i.name), meta: `${fmtDate(i.date)} · ${esc(accName(state, i.account))} · ${(i.status === 'scheduled' ? `programado para el ${fmtDate(i.scheduledFor, false)}` : { done: i.kind === 'income' ? 'llegó' : 'pagado', skipped: 'saltado', overdue: 'no ha llegado', due: 'pendiente', pending: 'próximo' }[i.status])}`,
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

// Captura automática: Android (MacroDroid con Google Wallet o el banco) y iPhone (atajo de Wallet + Pegar).
function captureGroup(state, d) {
  const st = state.settings;
  const os = st.capture?.os || (d.env?.os === 'ios' ? 'ios' : 'android');
  const base = location.href.split(/[?#]/)[0];
  const tok = st.quickAdd?.token || '';
  const url = (via) => `${base}?raw={notification}&t={not_title}&via=${via}&id={system_time}&k=${tok}`;
  const copyBox = (text, rows = 3) => `<textarea readonly class="mono" rows="${rows}">${esc(text)}</textarea>
    <button class="btn sm" data-action="copy-macro" data-text="${esc(text)}">${icon('copy', 16)}Copiar</button>`;
  const missing4 = state.accounts.filter((a) => !a.archived && (a.type === 'card' || a.type === 'bank') && !a.last4);
  const tabs = `<div class="seg full">${[['android', 'Android'], ['ios', 'iPhone']].map(([k, l]) => `<button type="button" class="${os === k ? 'on' : ''}" data-action="cap-os" data-os="${k}">${l}</button>`).join('')}</div>`;
  const app = st.capture?.app || 'automate';
  // Automate: fórmula con urlEncode(); el id (app-notificación-hora) no cambia si la notificación se actualiza.
  const formula = (via) => `"${base}?raw=" ++ urlEncode(coalesce(texto, "")) ++ "&t=" ++ urlEncode(coalesce(titulo, "")) ++ "&via=${via}&id=" ++ urlEncode(pkg ++ "-" ++ nid ++ "-" ++ coalesce(cuando, Now)) ++ "&k=${tok}"`;
  const apps = `<div class="chips mt">${[['automate', 'Automate · gratis'], ['automation', 'Automation · código abierto'], ['paid', 'MacroDroid o Tasker · de pago']]
    .map(([k, l]) => `<button type="button" class="chip ${app === k ? 'on' : ''}" data-action="cap-app" data-app="${k}">${l}</button>`).join('')}</div>`;
  const perms = (name) => `<li>Dale permisos en los Ajustes de Android: <b>Aplicaciones → Acceso especial → Mostrar sobre otras apps → ${name} → Permitir</b> (sin esto no se abre la app cuando estás en otra, y no avisa). En <b>Aplicaciones → ${name} → Batería</b> elige <b>Sin restricciones</b>. En Xiaomi, Redmi o POCO activa también <b>Otros permisos → Mostrar ventanas emergentes en segundo plano</b>.</li>`;
  const automate = `
    <ol class="steps">
      <li>Instala <b>Automate</b> (de LlamaLab) desde Play Store. Es gratis para siempre, sin anuncios; solo limita a 30 bloques y esto usa unos 10.</li>
      ${perms('Automate')}
      <li>En Automate toca <b>Flows → +</b>. Con la lupa busca y agrega el bloque <b>Notification posted</b> y configúralo:
        <i>Proceed</i>: <b>When transition</b> · <i>Package</i>: <code>com.google.android.apps.walletnfcrel</code> (Google Wallet) · <i>Exclude flags</i>: <b>Group summary</b> ·
        y en las variables de salida escribe: Package → <code>pkg</code>, Title → <code>titulo</code>, Message → <code>texto</code>, Notification id → <code>nid</code>, When timestamp → <code>cuando</code>.</li>
      <li>Agrega el bloque <b>Variable set</b>. En <i>Variable</i> escribe <code>url</code>; en <i>Value</i> toca <b>fx</b> y pega esto (ya trae tu clave):</li>
    </ol>
    ${copyBox(formula('wallet'), 5)}
    <ol class="steps" start="5">
      <li>Agrega el bloque <b>App start</b>: <i>Action</i> <b>View</b> y en <i>Data URI</i> toca <b>fx</b> y escribe <code>url</code>. Deja lo demás vacío.</li>
      <li>Conecta los puntos: <b>Flow beginning</b> → Notification posted; su salida <b>YES</b> → Variable set → App start → de regreso a la entrada de Notification posted. Su salida <b>NO</b> también regrésala a su propia entrada, para que siempre siga escuchando.</li>
      <li>Guarda (✓) y toca <b>Start</b>; acepta el <b>acceso a notificaciones</b>. En <b>☰ → Settings</b> activa <b>Run on system startup</b> para que siga después de reiniciar.</li>
      <li>Para tu banco (compras en línea o con la tarjeta física): en la lista usa <b>⋮ → Duplicate</b>, en <i>Package</i> elige la app de tu banco y en Variable set pega esta otra fórmula:</li>
    </ol>
    ${copyBox(formula('bank'), 5)}
    <p class="foot">Prueba con una compra chica teniendo otra app abierta: debe abrirse FinanciaBass con “Registrado”. Si no pasa nada, revisa “Mostrar sobre otras apps” y la batería; el registro de lo que pasó está en el flujo, <b>⋮ → Log</b>.</p>`;
  const automation = `
    <p class="foot top0">De código abierto (GPL) y gratis. Funciona, pero en algunos celulares lee mal el texto de la notificación; si una compra sale rara, usa Automate.</p>
    <ol class="steps">
      <li>Instala <b>F-Droid</b> desde f-droid.org y dentro busca <b>Automation</b> (de Jens Schröder). Si al dar acceso a notificaciones sale “Configuración restringida”: <b>Ajustes → Aplicaciones → Automation → ⋮ → Permitir configuración restringida</b>.</li>
      ${perms('Automation')}
      <li>Crea una regla con el disparador <b>Notificaciones de otras apps</b>: app <b>Google Wallet</b>, texto <b>contiene</b> <code>$</code>.</li>
      <li>Acciones, en este orden: <b>Establecer variable</b> <code>fbtit</code> = <code>[notificationTitle]</code>; <b>Establecer variable</b> <code>fbtxt</code> = <code>[notificationText]</code>; <b>Iniciar otro programa</b> por acción <code>android.intent.action.VIEW</code>, con un parámetro tipo <b>Uri</b> llamado <code>IntentData</code> con este valor:</li>
    </ol>
    ${copyBox(`${base}?raw=[variable-fbtxt]&t=[variable-fbtit]&via=wallet&id=[Y][m][d][H][i][s][ms]&k=${tok}`)}
    <ol class="steps" start="5">
      <li>Última acción: <b>Cerrar notificaciones</b> de Google Wallet (así no la vuelve a registrar si el celular se reinicia).</li>
      <li>Para tu banco, repite la regla con su app, otras variables (por ejemplo <code>bntit</code> y <code>bntxt</code>) y <code>via=bank</code>.</li>
    </ol>`;
  const paid = `
    <p class="foot top0"><b>MacroDroid Pro</b> (pago único): disparador <b>Notificación recibida</b> de Google Wallet (y otra macro con tu banco, cambiando <code>via=wallet</code> por <code>via=bank</code>), acción <b>Abrir sitio web/URL</b> con esta dirección. La versión gratis ya solo es una prueba de unos días.</p>
    ${copyBox(url('wallet'))}
    <p class="foot"><b>Tasker</b> (MX$95, pago único): evento <b>IU → Notificación</b> de Google Wallet; el título está en <code>%evtprm2</code> y el texto en <code>%evtprm3</code>. Codifícalos con <b>Convertir variable → Codificar URL</b> y ábrelos con <b>Navegar a URL</b> usando la misma dirección.</p>
    <p class="foot">En ambos da “Mostrar sobre otras apps” y batería “Sin restricciones”.</p>`;
  const android = `
    <p class="foot top0"><b>Lo más rápido: la notificación de Google Wallet.</b> Sale en cuanto acercas el celular a la terminal. Una app de automatización la lee y abre FinanciaBass con la compra. Si también llega la del banco, solo se registra una vez.</p>
    ${apps}
    ${app === 'automation' ? automation : app === 'paid' ? paid : automate}
    <p class="foot">Si la compra se abre en Chrome en vez de la app: <b>Ajustes → Aplicaciones → FinanciaBass → Abrir de forma predeterminada → Abrir vínculos compatibles</b>. Usa Chrome como navegador; en otros la app no guarda la compra.</p>`;
  const ios = `
    <p class="foot top0"><b>Con Apple Pay, al instante:</b> el iPhone avisa a la app Atajos en cuanto se confirma el pago en Wallet. iPhone no deja que una app web se abra sola, así que el atajo copia la compra y tú la pegas con un toque.</p>
    <ol class="steps">
      ${d.env?.standalone ? '' : '<li>Primero agrégala a tu pantalla de inicio: en Safari, <b>Compartir → Agregar a pantalla de inicio</b>.</li>'}
      <li>Abre <b>Atajos → Automatización → Nueva automatización → Transacción</b>. Elige tus tarjetas y marca <b>Ejecutar inmediatamente</b>.</li>
      <li>Agrega la acción <b>Texto</b> y escribe esto, cambiando cada [ ] por la variable del mismo nombre (tócala en la barra de variables):</li>
    </ol>
    ${copyBox('FB|[Monto]|[Comerciante]|[Tarjeta]|[Fecha actual]', 2)}
    <ol class="steps" start="${d.env?.standalone ? 3 : 4}">
      <li>Agrega la acción <b>Copiar al portapapeles</b>.</li>
      <li>Opcional: <b>Mostrar notificación</b> con el texto “Abre FinanciaBass y toca Pegar”.</li>
      <li>Cuando pagues, abre la app y toca <b>Pegar compra</b> en Hoy. iPhone te pedirá permiso para pegar.</li>
    </ol>
    <p class="foot">¿Pagas varias veces antes de abrir la app? Al inicio del texto pon la variable <b>Portapapeles</b> y un salto de línea: se van juntando y la app no repite las que ya registró. Con la tarjeta física, usa el + o pega la notificación del banco.</p>`;
  return group('Captura automática', `<div class="panel pad">
    ${tabs}
    <div class="cap-body">${os === 'ios' ? ios : android}</div>
    ${missing4.length ? `<p class="foot">${icon('info', 14, 'inline')} Para saber con qué tarjeta pagaste, pon los <b>últimos 4 dígitos</b> de ${missing4.map((a) => esc(a.name)).join(', ')} en <button class="link" data-action="acc-list">Cuentas y tarjetas</button>.</p>` : ''}
    <p class="foot">Lo que parece transporte va a tu apartado de transporte. Lo demás queda en “Por revisar” para que le pongas categoría. Las compras rechazadas y los pagos que recibes se ignoran.</p>
  </div>`);
}

export function masView(state, d) {
  const st = state.settings;
  const util = d.cards.filter((c) => c.util != null);
  const totalLimit = util.reduce((s, c) => s + c.limit, 0);
  const totalUsed = util.reduce((s, c) => s + c.owed + c.msi, 0);
  const tips = [
    ['check', 'Paga siempre el <b>pago para no generar intereses</b>. Nunca solo el mínimo.'],
    ['clock', 'Paga desde el mismo banco o 2 días hábiles antes. Si la fecha cae en día inhábil se recorre, pero no lo dejes al final.'],
    ['card', 'Deja 1 o 2 cargos chicos fijos en cada tarjeta y domicilia el pago: así todas se mantienen activas.'],
    ['calendar', 'Compras grandes justo después del corte: así tienes el máximo de días para pagar (la app te dice cuál tarjeta conviene hoy).'],
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

  ${captureGroup(state, d)}

  ${group('Editar', `<div class="panel">
    ${[
    ['acc-list', 'card', 'Cuentas y tarjetas', 'Nombres, límites, días de corte y de pago'],
    ['sched-list', 'calendar', 'Ingresos y gastos fijos', 'Sueldo, renta, suscripciones, MSI, ahorro'],
    ['stmt-list', 'pay', 'Estados de cuenta', 'Lo que debes pagar de cada tarjeta'],
    ['fares', 'metro', 'Botones rápidos', 'Pasajes que pagas seguido (metro, camión…)'],
    ['period', 'more', 'Periodo, transporte y colchón', 'Cada cuándo te pagan, apartado diario, mínimo en cuenta'],
  ].map(([a, ic, t, m]) => item({ action: `data-action="${a}"`, lead: `<span class="ic hue-gray">${icon(ic, 18)}</span>`, title: t, meta: m, trail: icon('chevron', 16, 'mute') })).join('')}
  </div>`)}

  ${group('Respaldo', `<div class="panel pad">
    <p class="foot top0">Tus datos viven solo en este celular. Si borras los datos del navegador o desinstalas la app sin respaldo, se pierden. Último respaldo: <b>${st.lastBackupAt ? fmtDate(st.lastBackupAt) : 'nunca'}</b>.</p>
    <div class="pair wrap">
      <button class="btn sm" data-action="backup">${icon('download', 16)}Respaldar</button>
      <button class="btn sm ghost" data-action="import">${icon('upload', 16)}Restaurar</button>
      <button class="btn sm ghost" data-action="config">${icon('code', 16)}Código FB1</button>
      <button class="btn sm ghost" data-action="auto-backups">${icon('clock', 16)}Copias automáticas</button>
    </div>
    <input type="file" id="import-file" accept=".txt,.json,application/json,text/plain" hidden>
  </div>`)}
  <button class="btn ghost danger wide" data-action="reset">${icon('trash', 18)}Borrar todo</button>
  <p class="colophon">FinanciaBass · tus números nunca salen de tu celular</p>`;
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
  ${draft.type === 'adjust' && draft.account ? `<p class="foot top0 adj-now">La app tiene ${money(draft.currentBal || 0)}${state.accounts.find((a) => a.id === draft.account)?.type === 'card' ? ' de deuda' : ''}. Escribe lo que dice tu banco o lo que traes.</p>
    ${['bank', 'cash'].includes(state.accounts.find((a) => a.id === draft.account)?.type) ? `<p class="label">¿De dónde salió la diferencia?</p><div class="chips">
      <button type="button" class="chip ${draft.adjReason !== 'move' ? 'on' : ''}" data-pick="adjReason" data-val="unknown">No sé / no lo registré</button>
      <button type="button" class="chip ${draft.adjReason === 'move' ? 'on' : ''}" data-pick="adjReason" data-val="move">${icon('move', 16)}Lo pasé de/a otra cuenta</button></div>
      ${draft.adjReason === 'move' ? `<div class="chips mt">${liquidAccounts(state).filter((a) => a.id !== draft.account).map((a) => `<button type="button" class="chip ${draft.moveFrom === a.id ? 'on' : ''}" data-pick="moveFrom" data-val="${esc(a.id)}">${icon(ACC_ICON[a.type], 16)}${esc(a.name)}</button>`).join('')}</div>
      <p class="foot">Se registra como movimiento entre tus cuentas: no cambia lo que puedes gastar.</p>` : '<p class="foot">Si no sabes, se ajusta tal cual y tu número sube o baja por la diferencia.</p>'}` : ''}` : ''}
  ${draft.type === 'pay' || draft.type === 'transfer' ? `<p class="label">${draft.type === 'pay' ? 'Tarjeta' : 'Hacia'}</p>${chips(toList.filter((a) => a.id !== draft.account), 'to', draft.to)}` : ''}
  ${candidates.length ? `<p class="label">¿Es algo que ya tenías planeado?</p><div class="chips">
    <button type="button" class="chip ${!draft.planRef || draft.planRef === 'none' ? 'on' : ''}" data-pick="planRef" data-val="none">No, es otro ${draft.type === 'income' ? 'ingreso' : 'gasto'}</button>
    ${candidates.map((i) => `<button type="button" class="chip ${draft.planRef === i.id ? 'on' : ''}" data-pick="planRef" data-val="${esc(i.id)}">${icon(i.kind === 'income' ? 'income' : 'pin', 16)}${esc(i.name)} · ${money(i.amount, { decimals: false })} · ${fmtDate(i.date, false)}</button>`).join('')}
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
