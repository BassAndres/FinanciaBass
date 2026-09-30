// Pantallas. Cada función regresa HTML; los botones usan data-action y los maneja app.js.
import { money, fmtDate, diffDays, describeRule } from '../engine/index.js';
import { esc } from './dom.js';

export const CATEGORIES = [
  ['comida', '🍔 Comida'], ['transporte', '🚇 Transporte'], ['antojos', '🍩 Antojos'], ['escuela', '📚 Escuela'],
  ['salidas', '🎉 Salidas'], ['salud', '💊 Salud'], ['ropa', '👕 Ropa'], ['regalos', '🎁 Regalos'],
  ['suscripciones', '📺 Suscripciones'], ['otros', '📦 Otros'],
];
const catLabel = (c) => (CATEGORIES.find(([k]) => k === c)?.[1]) || ({ fijo: '📌 Fijo', msi: '🗓️ MSI', ingreso: '💵 Ingreso', ahorro: '🐷 Ahorro', pago: '💳 Pago' }[c] || '📦 Otros');

const pct = (x) => `${Math.round(x * 100)}%`;
const accName = (state, id) => state.accounts.find((a) => a.id === id)?.name || id || '—';
const liquidAccounts = (state) => state.accounts.filter((a) => (a.type === 'bank' || a.type === 'cash') && !a.archived);

function heroTone(d) {
  if (d.safeToSpend <= 0) return 'bad';
  if (d.safeToSpend < d.base * 0.5) return 'warn';
  return 'ok';
}

export function hoyView(state, d) {
  const P = d.period;
  const tone = heroTone(d);
  const payToday = d.payPlan.filter((p) => p.date <= d.today);
  const upcoming = d.payPlan.filter((p) => p.date > d.today).slice(0, 4);
  const review = state.tx.filter((t) => t.review).slice(-5).reverse();
  const c = d.cardOfDay;
  const staleBackup = !state.settings.lastBackupAt || diffDays(d.today, state.settings.lastBackupAt) >= 7;
  const leftover = d.leftover;
  return `
  <section class="hero ${tone}">
    <p class="hero-label">${P.notStarted ? `Tu plan empieza el ${fmtDate(P.s)} · ese día podrás gastar` : 'Hoy puedes gastar'}</p>
    <p class="hero-amount">${money(d.safeToSpend)}</p>
    ${d.disponible < 0 ? `<p class="hero-sub">Vas ${money(d.disponible)} abajo${d.recovery ? ` · te recuperas el ${fmtDate(d.recovery)} si ya no gastas` : ''}</p>` : ''}
    ${d.safeToSpend < d.disponible ? `<p class="hero-sub">Tienes ${money(d.disponible)} acumulado, pero te muestro menos para que alcance a los pagos que vienen.</p>` : ''}
    <div class="hero-meta">
      <span>Base <b>${money(d.base)}</b>/día</span>
      <span>Quedan <b>${d.daysLeft}</b> días (hasta ${fmtDate(P.e, false)})</span>
    </div>
    <div class="bar"><i style="width:${Math.min(100, Math.round((d.k / d.D) * 100))}%"></i></div>
  </section>

  <section class="quick">
    ${(state.settings.fares || []).map((f, i) => `<button class="chip-btn" data-action="fare" data-i="${i}">${esc(f.name)} <b>${money(f.amount, { decimals: false })}</b></button>`).join('')}
    <button class="chip-btn" data-action="new" data-cat="comida">🍔 Comida</button>
    <button class="chip-btn" data-action="new" data-cat="antojos">🍩 Antojo</button>
    <button class="chip-btn" data-action="new">＋ Otro</button>
  </section>

  ${d.deficit ? `<div class="alert bad"><b>Este periodo no alcanza.</b> Con lo que tienes y lo que te va a entrar te faltan ${money(Math.min(d.R, d.libre))}. Revisa en <a href="#/plan">Plan</a> qué fijo puedes saltar o usa tu alcancía.</div>` : ''}
  ${d.liquidity.short ? `<div class="alert warn"><b>Ojo con el ${fmtDate(d.liquidity.minDate)}:</b> ese día te faltarían ${money(d.liquidity.short)} (${esc(d.liquidity.cause || 'pagos')}). Ya lo tomé en cuenta en tu número de hoy.</div>` : ''}

  ${payToday.length ? `<h2>Paga hoy</h2>${payToday.map((p) => `
    <div class="card row">
      <div><b>${money(p.amount)}</b> a ${esc(p.cardName)}<small>${p.onDue ? `Fecha límite: ${fmtDate(p.date)}` : 'Adelántalo hoy: ya tienes el dinero'}</small></div>
      <button class="btn small" data-action="pay" data-card="${esc(p.card)}" data-amount="${p.amount}">Ya pagué</button>
    </div>`).join('')}` : ''}

  ${leftover ? `<div class="card row"><div>El periodo pasado te sobraron <b>${money(leftover.amount)}</b> 🎉<small>¿Los mandas a tu alcancía?</small></div>
    <div class="row-actions"><button class="btn small" data-action="leftover-save">Sí</button><button class="btn small ghost" data-action="leftover-keep">Dejarlos</button></div></div>` : ''}

  ${d.prompts.length ? `<h2>Pendientes</h2>${d.prompts.map((i) => promptRow(state, i)).join('')}` : ''}

  ${review.length ? `<h2>Por revisar</h2>${review.map((t) => `
    <div class="card row"><div><b>${money(t.amount)}</b> ${esc(t.desc)}<small>${esc(accName(state, t.account))} · ${fmtDate(t.date)} · capturado automático</small></div>
    <div class="row-actions"><button class="btn small" data-action="review-ok" data-id="${t.id}">OK</button><button class="btn small ghost" data-action="edit-tx" data-id="${t.id}">Editar</button></div></div>`).join('')}` : ''}

  ${c ? `<h2>Si hoy pagas con tarjeta</h2><div class="card"><b>Usa ${esc(c.name)}</b><small>Lo pagas hasta el ${fmtDate(c.pay.due)} (${c.pay.days} días) · uso ${c.util != null ? pct(c.util) : '—'} de su límite</small></div>` : ''}

  ${upcoming.length ? `<h2>Próximos pagos</h2><div class="card list">${upcoming.map((p) => `<div class="li"><span>${fmtDate(p.date)}</span><span>${esc(p.cardName)}</span><b>${money(p.amount)}</b></div>`).join('')}</div>` : ''}

  <div class="card row soft"><div>Transporte del periodo<small>${money(d.transport.spent)} de ${money(d.transport.budget)} apartados</small></div></div>
  ${staleBackup ? `<div class="card row soft"><div>Haz un respaldo<small>Tus datos solo viven en este celular.</small></div><button class="btn small ghost" data-action="backup">Respaldar</button></div>` : ''}
  `;
}

function promptRow(state, i) {
  const where = accName(state, i.account);
  const q = i.kind === 'income'
    ? (i.status === 'overdue' ? `¿Llegó ${esc(i.name)}? (${fmtDate(i.date)})` : `¿Ya llegó ${esc(i.name)}?`)
    : i.kind === 'savings' ? `¿Ya apartaste ${esc(i.name)}?` : `¿Ya se cobró ${esc(i.name)}?`;
  return `<div class="card row"><div>${q}<small>${money(i.amount)} · ${esc(where)}${i.status === 'overdue' ? ' · mientras no llegue no lo cuento' : ''}</small></div>
    <div class="row-actions">
      <button class="btn small" data-action="inst-yes" data-id="${esc(i.id)}">Sí</button>
      <button class="btn small ghost" data-action="inst-other" data-id="${esc(i.id)}">Otra $</button>
      <button class="btn small ghost" data-action="inst-skip" data-id="${esc(i.id)}">${i.kind === 'income' ? 'No' : 'Saltar'}</button>
    </div></div>`;
}

export function movsView(state, d) {
  const P = d.period;
  const list = state.tx.filter((t) => t.date >= P.s && t.date <= d.today).sort((a, b) => (a.date === b.date ? (b.ts || 0) - (a.ts || 0) : a.date < b.date ? 1 : -1));
  const byDay = {};
  for (const t of list) (byDay[t.date] ||= []).push(t);
  const sign = (t) => (t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0);
  return `<h1>Movimientos</h1><p class="muted">Del ${fmtDate(P.s)} a hoy</p>
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([day, txs]) => `
      <h2>${fmtDate(day)}</h2><div class="card list">${txs.map((t) => `
        <button class="li tx" data-action="edit-tx" data-id="${t.id}">
          <span>${catLabel(t.type === 'transfer' ? (t.cat || 'pago') : t.type === 'adjust' ? 'otros' : t.cat)}</span>
          <span class="grow">${esc(t.desc || (t.type === 'transfer' ? `${accName(state, t.account)} → ${accName(state, t.to)}` : t.type === 'adjust' ? 'Ajuste de saldo' : ''))}<small>${esc(accName(state, t.account))}${t.review ? ' · por revisar' : ''}</small></span>
          <b class="${sign(t) > 0 ? 'pos' : sign(t) < 0 ? '' : 'muted'}">${t.type === 'adjust' ? money(t.amount, { sign: true }) : money(sign(t) * t.amount || t.amount)}</b>
        </button>`).join('')}</div>`).join('') : '<div class="empty">Aún no hay movimientos en este periodo.</div>'}`;
}

export function tarjetasView(state, d) {
  const stByCard = {};
  for (const s of d.statements) (stByCard[s.card] ||= []).push(s);
  return `<h1>Tarjetas</h1>
  ${d.cards.map((c) => {
    const tone = c.util == null ? '' : c.util <= 0.3 ? 'ok' : c.util <= 0.5 ? 'warn' : 'bad';
    return `<div class="card">
      <div class="row"><div><b>${esc(c.name)}</b>${c.blocked ? ' <span class="tag">bloqueada</span>' : ''}<small>${c.pay ? `Corte ${fmtDate(c.pay.cut, false)} · compra hoy → pagas ${fmtDate(c.pay.due)}` : 'Sin fechas de corte'}</small></div><b>${money(c.owed)}</b></div>
      ${c.limit ? `<div class="bar ${tone}"><i style="width:${Math.min(100, Math.round((c.util || 0) * 100))}%"></i></div>
      <small>Uso ${pct(c.util || 0)} de ${money(c.limit, { decimals: false })}${c.msi ? ` (incluye ${money(c.msi)} a meses)` : ''} · meta: menos de 30%</small>` : ''}
      ${(stByCard[c.id] || []).map((s) => `<div class="stmt">Pago para no generar intereses: <b>${money(s.remaining)}</b> antes del ${fmtDate(s.due)}${s.payFrom && s.payFrom > d.today ? ` · se puede pagar desde el ${fmtDate(s.payFrom)}` : ''}${s.paid ? ` · ya abonaste ${money(s.paid)}` : ''}</div>`).join('')}
      <div class="row-actions">
        <button class="btn small" data-action="pay" data-card="${esc(c.id)}">Pagar</button>
        <button class="btn small ghost" data-action="stmt-new" data-card="${esc(c.id)}">Capturar estado de cuenta</button>
        <button class="btn small ghost" data-action="adjust" data-acc="${esc(c.id)}">Ajustar saldo</button>
      </div>
    </div>`;
  }).join('')}
  ${d.payPlan.length ? `<h2>Plan de pagos (lo antes posible)</h2><div class="card list">${d.payPlan.map((p) => `<div class="li"><span>${fmtDate(p.date)}</span><span class="grow">${esc(p.cardName)}${p.onDue ? ' · en su fecha' : ''}</span><b>${money(p.amount)}</b></div>`).join('')}</div>
  <p class="muted">Se recalcula cada vez que registras algo. Siempre deja al menos ${money(state.settings.liquidityFloor)} en tu cuenta.</p>` : '<div class="empty">No tienes pagos pendientes registrados. 🎉</div>'}`;
}

export function planView(state, d) {
  const P = d.period;
  const icon = { done: '✅', skipped: '⏭️', overdue: '⚠️', due: '⏳', pending: '·' };
  return `<h1>Plan</h1>
  <div class="card">
    <div class="li"><span>Periodo</span><b>${fmtDate(P.s, false)} → ${fmtDate(P.e, false)} (${P.D} días)</b></div>
    <div class="li"><span>Libre para gastar en el periodo</span><b>${money(d.libre)}</b></div>
    <div class="li"><span>Base diaria</span><b>${money(d.base)}</b></div>
    <div class="li"><span>Transporte apartado</span><b>${money(d.transport.budget)}</b></div>
    <div class="li"><span>Dinero neto hoy (efectivo + banco − tarjetas)</span><b>${money(d.net)}</b></div>
    <button class="btn small ghost" data-action="rebase">Repartir lo que queda en los días que faltan</button>
  </div>
  <h2>Lo planeado en este periodo</h2>
  <div class="card list">${d.instances.map((i) => `
    <div class="li"><span>${icon[i.status]}</span><span class="grow">${esc(i.name)}<small>${fmtDate(i.date)} · ${esc(accName(state, i.account))}</small></span>
    <b class="${i.kind === 'income' ? 'pos' : ''}">${money(i.signed)}</b>
    ${i.status === 'done' ? '' : `<button class="btn tiny ghost" data-action="${i.skipped ? 'inst-unskip' : 'inst-skip'}" data-id="${esc(i.id)}">${i.skipped ? 'Volver' : 'Saltar'}</button>`}</div>`).join('')}</div>
  <h2>Reglas que se repiten</h2>
  <div class="card list">${state.schedules.map((s) => `
    <div class="li"><span class="grow">${esc(s.name)}<small>${describeRule(s.rule)} · ${esc(accName(state, s.account))}${s.autoPost ? ' · se registra solo' : ''}</small></span>
    <b class="${s.kind === 'income' ? 'pos' : ''}">${money(s.amount)}</b>
    <button class="btn tiny ghost" data-action="sched-edit" data-id="${esc(s.id)}">Editar</button></div>`).join('')}</div>
  <button class="btn ghost" data-action="sched-new">＋ Agregar ingreso o gasto fijo</button>
  <h2>Recordatorios</h2>
  <div class="card">
    <p>Las apps web no pueden avisarte solas. Agrega tus pagos a tu calendario:</p>
    <button class="btn small" data-action="ics">Descargar calendario (.ics)</button>
    <div class="list">${(d.reminders || []).map((e) => `<a class="li" href="${esc(e.gcal)}" target="_blank" rel="noopener"><span>${fmtDate(e.date)}</span><span class="grow">${esc(e.title)}</span><span>＋ Google</span></a>`).join('')}</div>
  </div>`;
}

export function masView(state, d) {
  const st = state.settings;
  const base = location.href.split(/[?#]/)[0];
  const tok = st.quickAdd?.token || '';
  const macro = `${base}?raw={notification}&src=nu&id={system_time}&k=${tok}`;
  const util = d.cards.filter((c) => c.util != null);
  const totalLimit = util.reduce((s, c) => s + c.limit, 0);
  const totalUsed = util.reduce((s, c) => s + c.owed + c.msi, 0);
  return `<h1>Más</h1>
  <h2>Consejos para tu historial</h2>
  <div class="card tips">
    ${totalLimit ? `<p>Usas <b>${pct(totalUsed / totalLimit)}</b> de tu crédito total (${money(totalUsed, { decimals: false })} de ${money(totalLimit, { decimals: false })}). Menos de 30% es bueno; menos de 10% es excelente.</p>` : ''}
    <ul>
      <li>Paga siempre el <b>pago para no generar intereses</b>. Nunca solo el mínimo.</li>
      <li>Paga desde la cuenta del mismo banco o 2 días hábiles antes. Si la fecha cae en día inhábil, el banco la recorre, pero no lo dejes al final.</li>
      <li>Deja 1–2 cargos chicos fijos en cada tarjeta (metro, Spotify, internet) y domicilia el pago para no generar intereses: así todas se mantienen activas.</li>
      <li>Compras grandes: justo después del corte (hasta ~50 días para pagar en Santander/Banamex, ~40 en Nu).</li>
      <li>Meses sin intereses solo si ya tienes el dinero: la app cuenta cada mensualidad en su mes.</li>
      <li>Nunca saques efectivo con tarjeta de crédito, no abras más tarjetas y no canceles la más antigua.</li>
      <li>Pide tu Reporte de Crédito Especial gratis una vez al año en Buró y en Círculo de Crédito.</li>
    </ul>
  </div>

  <h2>Mis cuentas</h2>
  <div class="card list">${state.accounts.filter((a) => !a.archived).map((a) => `
    <div class="li"><span class="grow">${esc(a.name)}<small>${{ bank: 'Banco', cash: 'Efectivo', savings: 'Alcancía (no se gasta)', card: 'Tarjeta de crédito' }[a.type]}</small></span>
    <b>${money(d.balances[a.id] || 0)}</b><button class="btn tiny ghost" data-action="adjust" data-acc="${esc(a.id)}">Saldo real</button></div>`).join('')}</div>

  <h2>Captura automática (Android)</h2>
  <div class="card">
    <ol class="steps">
      <li>Instala <b>MacroDroid</b> (gratis) desde Play Store.</li>
      <li>Nueva macro → Disparador: <b>Notificación recibida</b> → App: <b>Nu</b> (y tus apps de banco).</li>
      <li>Acción: <b>Abrir sitio web / URL</b> y pega esta dirección:</li>
    </ol>
    <textarea readonly class="mono" rows="3">${esc(macro)}</textarea>
    <button class="btn small" data-action="copy-macro" data-text="${esc(macro)}">Copiar dirección</button>
    <p class="muted">Cambia <code>src=nu</code> por el nombre corto de cada banco (${Object.keys(st.quickAdd?.sources || {}).map(esc).join(', ') || 'configúralo abajo'}). El metro se va solo a Transporte; lo demás queda "Por revisar". Las compras rechazadas y los pagos se ignoran.</p>
    <p class="muted">También puedes mantener presionado el ícono de la app para registrar Metro o un gasto.</p>
  </div>

  <h2>Ajustes</h2>
  <div class="card list">
    <label class="li"><span class="grow">Transporte diario apartado</span><input type="number" inputmode="decimal" step="0.5" data-setting="transport.rate" value="${(st.transport?.rate || 0) / 100}"></label>
    <label class="li"><span class="grow">Dinero mínimo que siempre dejo en la cuenta</span><input type="number" inputmode="decimal" data-setting="liquidityFloor" value="${(st.liquidityFloor || 0) / 100}"></label>
    <label class="li"><span class="grow">Tarjeta/cuenta del transporte</span><select data-setting="transport.account">${state.accounts.filter((a) => a.type !== 'savings').map((a) => `<option value="${esc(a.id)}" ${a.id === st.transport?.account ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
  </div>

  <h2>Respaldo</h2>
  <div class="card">
    <p class="muted">Tus datos viven solo en este celular. Si borras los datos de Chrome sin respaldo, se pierden.</p>
    <div class="row-actions">
      <button class="btn small" data-action="backup">Respaldar (compartir)</button>
      <button class="btn small ghost" data-action="import">Restaurar respaldo</button>
      <button class="btn small ghost" data-action="config">Pegar código FB1</button>
    </div>
    <input type="file" id="import-file" accept=".txt,.json,application/json,text/plain" hidden>
    <p class="muted">Último respaldo: ${st.lastBackupAt ? fmtDate(st.lastBackupAt) : 'nunca'}</p>
  </div>
  <button class="btn ghost danger" data-action="reset">Borrar todo</button>
  <p class="muted center">FinanciaBass · tus números nunca salen de tu celular</p>`;
}

export function onboardingView() {
  return `<section class="onboard">
    <h1>FinanciaBass</h1>
    <p>Sabe cada día cuánto puedes gastar, paga tus tarjetas a tiempo y ahorra lo que no uses.</p>
    <div class="card">
      <h2>¿Tienes un código de configuración?</h2>
      <p class="muted">Empieza con <code>FB1.</code>. Trae tus cuentas, tarjetas, ingresos y pagos ya capturados.</p>
      <textarea id="config-code" rows="4" placeholder="FB1...."></textarea>
      <button class="btn" data-action="config-apply">Cargar mis datos</button>
    </div>
    <div class="card">
      <h2>¿Empezar desde cero?</h2>
      <p class="muted">Crea una cuenta de banco y efectivo; después agregas tarjetas e ingresos en Plan y Más.</p>
      <label class="li"><span class="grow">¿Cuánto tienes en el banco?</span><input id="ob-bank" type="number" inputmode="decimal"></label>
      <label class="li"><span class="grow">¿Y en efectivo?</span><input id="ob-cash" type="number" inputmode="decimal"></label>
      <button class="btn ghost" data-action="blank-start">Empezar</button>
    </div>
    <p class="muted center">Tus datos se guardan solo en este celular.</p>
  </section>`;
}

// Hoja para registrar un movimiento.
export function entrySheet(state, draft) {
  const types = [['expense', 'Gasto'], ['income', 'Ingreso'], ['pay', 'Pagar tarjeta'], ['transfer', 'Mover'], ['adjust', 'Saldo real']];
  const accs = state.accounts.filter((a) => !a.archived);
  const fromList = draft.type === 'expense' ? accs.filter((a) => a.type !== 'savings')
    : draft.type === 'income' ? accs.filter((a) => a.type !== 'card')
      : draft.type === 'pay' ? liquidAccounts(state) : accs;
  const toList = draft.type === 'pay' ? accs.filter((a) => a.type === 'card') : accs;
  const chips = (list, key, sel) => `<div class="chips">${list.map((a) => `<button type="button" class="chip ${a.id === sel ? 'on' : ''}" data-pick="${key}" data-val="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>`;
  return `
  <div class="tabs">${types.map(([k, l]) => `<button type="button" class="tab ${draft.type === k ? 'on' : ''}" data-pick="type" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="amount-display">${draft.type === 'adjust' ? '<small>Saldo real</small>' : ''}$<span>${esc(draft.amountText || '0')}</span></div>
  <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => `<button type="button" data-key="${k}">${k}</button>`).join('')}</div>
  <p class="label">${draft.type === 'income' ? 'Entra a' : draft.type === 'adjust' ? 'Cuenta' : draft.type === 'expense' ? 'Pagué con' : 'Sale de'}</p>
  ${chips(fromList, 'account', draft.account)}
  ${draft.type === 'pay' || draft.type === 'transfer' ? `<p class="label">${draft.type === 'pay' ? 'Tarjeta' : 'Hacia'}</p>${chips(toList.filter((a) => a.id !== draft.account), 'to', draft.to)}` : ''}
  ${draft.type === 'expense' ? `<p class="label">Categoría</p><div class="chips">${CATEGORIES.map(([k, l]) => `<button type="button" class="chip ${draft.cat === k ? 'on' : ''}" data-pick="cat" data-val="${k}">${l}</button>`).join('')}</div>` : ''}
  ${draft.type !== 'adjust' ? `<input class="desc" type="text" placeholder="Descripción (opcional)" value="${esc(draft.desc || '')}" data-field="desc">` : ''}
  <label class="li"><span class="grow">Fecha</span><input type="date" value="${esc(draft.date)}" data-field="date"></label>
  ${draft.id ? '<button type="button" class="btn ghost danger small" data-sheet-action="delete">Borrar movimiento</button>' : ''}
  <button type="button" class="btn full" data-sheet-action="save">${draft.id ? 'Guardar cambios' : 'Guardar'}</button>`;
}

