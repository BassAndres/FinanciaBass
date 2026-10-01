import {
  computeDashboard, autoPostDue, instanceToTx, periodFor, addDays, localToday, dateOf, year, month,
  parseAmount, money, parseIntent, matchInstance, decodeConfig, emptyState, balancesAt,
  reminderEvents, googleCalendarLink, buildICS, describeRule,
} from './engine/index.js';
import * as store from './store.js';
import { $, esc, toast, openSheet, closeSheet, uid } from './ui/dom.js';
import { hoyView, movsView, tarjetasView, planView, masView, onboardingView, entrySheet } from './ui/views.js';
import { icon } from './ui/icons.js';

let state = store.load();
let dash = null;
let draft = null;
const today = () => localToday();
const main = $('#main');

// ---------- estado ----------
function commit(fn, msg, undoable = false) {
  const before = JSON.stringify(state);
  fn(state);
  store.save(state);
  render();
  if (msg) toast(msg, undoable ? { label: 'Deshacer', fn: () => { state = JSON.parse(before); store.save(state); render(); } } : null);
}

function addTx(s, tx) {
  const full = { id: uid(), ts: Date.now(), src: 'manual', ...tx };
  if (!full.planRef && full.type === 'expense' && dash) {
    const m = matchInstance(dash.instances, full);
    if (m) full.planRef = m.id;
  }
  s.tx.push(full);
  return full;
}

function runAutoPost() {
  const posts = autoPostDue(state, today());
  if (!posts.length) return;
  for (const p of posts) state.tx.push({ id: uid(), ts: Date.now(), ...p });
  store.save(state);
}

const firstOf = (type) => state.accounts.find((a) => a.type === type && !a.archived)?.id;

// ---------- render ----------
const ROUTES = { hoy: hoyView, movs: movsView, tarjetas: tarjetasView, plan: planView, mas: masView };

function render() {
  document.body.classList.toggle('no-state', !state);
  if (!state) { main.innerHTML = onboardingView(); return; }
  runAutoPost();
  const t = today();
  dash = computeDashboard(state, t);
  dash.reminders = reminderEvents(dash).map((e) => ({ ...e, gcal: googleCalendarLink(e) }));
  dash.leftover = leftoverPrompt(t);
  const route = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'hoy';
  main.innerHTML = (ROUTES[route] || hoyView)(state, dash);
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${route}`));
  if ('setAppBadge' in navigator) {
    const n = dash.payPlan.filter((p) => p.date <= addDays(t, 3)).length + dash.prompts.length;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }
}

function leftoverPrompt(t) {
  const P = dash.period;
  if (P.first || dash.k > 7) return null;
  const prev = periodFor(state.settings, addDays(P.s, -1));
  const key = `leftover:${prev.s}`;
  if (state.dismissed[key] || !firstOf('savings')) return null;
  const amount = computeDashboard(state, prev.e).R;
  return amount > 0 ? { amount, date: prev.e, key } : null;
}

// ---------- hoja de registro ----------
function openEntry(d) {
  draft = { type: 'expense', date: today(), amountText: '', ...d };
  if (!draft.account) draft.account = defaultAccount(draft.type);
  if (draft.type === 'pay' && !draft.to) draft.to = firstOf('card');
  paintEntry();
}

function defaultAccount(type) {
  const last = state.settings.lastAccount?.[type];
  if (last && state.accounts.some((a) => a.id === last)) return last;
  return type === 'expense' ? (state.settings.transport?.account || firstOf('cash')) : firstOf('bank') || firstOf('cash');
}

function paintEntry() {
  openSheet(entrySheet(state, draft), (body) => {
    body.onclick = (e) => {
      const k = e.target.closest('[data-key]')?.dataset.key;
      const pick = e.target.closest('[data-pick]');
      const act = e.target.closest('[data-sheet-action]')?.dataset.sheetAction;
      if (k) {
        let t = draft.amountText || '';
        if (k === 'del') t = t.slice(0, -1);
        else if (k === '.' ? !t.includes('.') : !/\.\d{2}$/.test(t)) t = (t === '0' && k !== '.' ? '' : t) + k;
        draft.amountText = t.slice(0, 10);
        body.querySelector('.amount-display .num').textContent = draft.amountText || '0';
      } else if (pick) {
        draft[pick.dataset.pick] = pick.dataset.val;
        if (pick.dataset.pick === 'type') { draft.account = defaultAccount(draft.type); draft.to = draft.type === 'pay' ? firstOf('card') : null; }
        paintEntry();
      } else if (act === 'save') saveEntry();
      else if (act === 'delete') {
        commit((s) => { s.tx = s.tx.filter((t) => t.id !== draft.id); }, 'Movimiento borrado', true);
        closeSheet();
      }
    };
    body.oninput = (e) => { const f = e.target.dataset.field; if (f) draft[f] = e.target.value; };
  });
}

function saveEntry() {
  const amount = parseAmount(draft.amountText);
  if (draft.type !== 'adjust' && !amount) return toast('Escribe el monto');
  if (!draft.account) return toast('Elige la cuenta');
  const base = { date: draft.date || today(), desc: (draft.desc || '').trim() };
  let tx;
  if (draft.type === 'expense') tx = { ...base, type: 'expense', account: draft.account, amount, cat: draft.cat || 'otros' };
  else if (draft.type === 'income') tx = { ...base, type: 'income', account: draft.account, amount, cat: 'ingreso' };
  else if (draft.type === 'pay' || draft.type === 'transfer') {
    if (!draft.to) return toast('Elige a dónde va');
    tx = { ...base, type: 'transfer', account: draft.account, to: draft.to, amount, cat: draft.type === 'pay' ? 'pago' : 'mover', desc: base.desc || (draft.type === 'pay' ? 'Pago de tarjeta' : '') };
  } else {
    const real = parseAmount(draft.amountText) ?? 0;
    const current = balancesAt({ ...state, tx: state.tx.filter((t) => t.id !== draft.id) }, base.date)[draft.account] || 0;
    tx = { ...base, type: 'adjust', account: draft.account, amount: real - current, desc: 'Ajuste: saldo real' };
    if (!tx.amount) { closeSheet(); return toast('El saldo ya coincide'); }
  }
  if (draft.planRef) tx.planRef = draft.planRef;
  const editing = draft.id;
  commit((s) => {
    s.settings.lastAccount = { ...(s.settings.lastAccount || {}), [draft.type]: draft.account };
    if (editing) {
      const i = s.tx.findIndex((t) => t.id === editing);
      s.tx[i] = { ...s.tx[i], ...tx, review: false };
    } else addTx(s, tx);
  }, editing ? 'Cambios guardados' : `Registrado ${money(amount || 0)}`, true);
  closeSheet();
}

function editTx(id) {
  const t = state.tx.find((x) => x.id === id);
  if (!t) return;
  const type = t.type === 'transfer' ? (state.accounts.find((a) => a.id === t.to)?.type === 'card' ? 'pay' : 'transfer') : t.type;
  const amountText = t.type === 'adjust' ? String(((balancesAt(state, t.date)[t.account]) || 0) / 100) : String(t.amount / 100);
  openEntry({ ...t, type, amountText });
}

// ---------- hojas pequeñas ----------
function formSheet(title, fields, onSave, extra = '') {
  openSheet(`<h2>${esc(title)}</h2><div class="panel">${fields.map((f) => `<label class="item"><span class="item-body"><span class="item-title">${esc(f.label)}</span></span>${
    f.options ? `<select name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : `<input name="${f.name}" type="${f.type || 'text'}" ${f.type === 'number' ? 'inputmode="decimal" step="0.01"' : ''} value="${esc(f.value ?? '')}" ${f.type === 'checkbox' && f.value ? 'checked' : ''}>`}</label>`).join('')}
    </div><button type="button" class="btn wide lg" data-sheet-action="ok">Guardar</button>${extra}`, (body) => {
    body.onclick = (e) => {
      const act = e.target.closest('[data-sheet-action]')?.dataset.sheetAction;
      if (!act) return;
      const vals = Object.fromEntries([...body.querySelectorAll('[name]')].map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
      if (onSave(act, vals) !== false) closeSheet();
    };
  });
}

function scheduleSheet(s) {
  const isNew = !s;
  s = s || { id: uid(), kind: 'fixed', name: '', amount: 0, account: firstOf('bank'), rule: { type: 'monthly', day: 1 } };
  const accOpts = state.accounts.filter((a) => !a.archived).map((a) => [a.id, a.name]);
  const ruleVal = s.rule.type === 'weekly' ? 'weekly' : (s.rule.every || 1) === 2 ? 'bimonthly' : 'monthly';
  formSheet(isNew ? 'Nuevo ingreso o gasto fijo' : `Editar: ${s.name}`, [
    { name: 'name', label: 'Nombre', value: s.name },
    { name: 'kind', label: 'Tipo', value: s.kind, options: [['income', 'Ingreso'], ['fixed', 'Gasto fijo'], ['msi', 'Meses sin intereses'], ['savings', 'Ahorro (a la alcancía)']] },
    { name: 'amount', label: 'Monto', type: 'number', value: s.amount / 100 },
    { name: 'account', label: 'Cuenta / tarjeta', value: s.account, options: accOpts },
    { name: 'freq', label: 'Frecuencia', value: ruleVal, options: [['monthly', 'Cada mes'], ['bimonthly', 'Cada 2 meses'], ['weekly', 'Cada semana']] },
    { name: 'day', label: 'Día (1–31, "last" o día de la semana 0=dom…6=sáb)', value: s.rule.type === 'weekly' ? s.rule.weekday : s.rule.day },
    { name: 'autoPost', label: 'Se cobra solo (registrarlo automático)', type: 'checkbox', value: s.autoPost },
    { name: 'end', label: 'Termina (opcional)', type: 'date', value: s.end || '' },
  ], (act, v) => {
    if (act === 'archive') { commit((st) => { st.schedules = st.schedules.filter((x) => x.id !== s.id); }, 'Eliminado', true); return; }
    const amount = parseAmount(v.amount);
    if (!v.name || !amount) { toast('Pon nombre y monto'); return false; }
    const day = v.day === 'last' ? 'last' : Number(v.day);
    const rule = v.freq === 'weekly' ? { type: 'weekly', weekday: Math.min(6, Math.max(0, day | 0)) }
      : { type: 'monthly', day: day === 'last' ? 'last' : Math.min(31, Math.max(1, day | 0)), ...(v.freq === 'bimonthly' ? { every: 2, anchor: s.rule.anchor || dateOf(year(today()), month(today()), 1) } : {}) };
    const next = { ...s, name: v.name, kind: v.kind, amount, account: v.account, rule, autoPost: !!v.autoPost, end: v.end || undefined,
      to: v.kind === 'savings' ? (s.to || firstOf('savings')) : undefined, start: s.start || (isNew ? today() : undefined) };
    commit((st) => { const i = st.schedules.findIndex((x) => x.id === s.id); if (i >= 0) st.schedules[i] = next; else st.schedules.push(next); }, 'Guardado', true);
  }, isNew ? '' : `<button type="button" class="btn ghost danger wide" data-sheet-action="archive">${icon('trash', 18)}Eliminar</button>`);
}

function statementSheet(card) {
  const acc = state.accounts.find((a) => a.id === card);
  formSheet(`Estado de cuenta · ${acc.name}`, [
    { name: 'amount', label: 'Pago para no generar intereses', type: 'number' },
    { name: 'due', label: 'Fecha límite de pago', type: 'date' },
    { name: 'payFrom', label: '¿Desde cuándo se puede pagar? (opcional)', type: 'date' },
  ], (act, v) => {
    const amount = parseAmount(v.amount);
    if (!amount || !v.due) { toast('Pon monto y fecha límite'); return false; }
    commit((s) => { s.statements.push({ id: uid(), card, amount, due: v.due, payFrom: v.payFrom || undefined, createdAt: today() }); }, 'Estado de cuenta guardado', true);
  });
}

// ---------- archivos ----------
async function shareOrDownload(filename, text, mime) {
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

function replaceState(next, msg) {
  state = next;
  store.save(state);
  store.requestPersist();
  location.hash = '#/hoy';
  render();
  toast(msg);
}

function applyConfigCode(code) {
  try {
    const data = store.importEnvelope(JSON.stringify(decodeConfig(code)));
    if (state && !confirm('Esto reemplaza todos tus datos actuales por los del código. ¿Continuar?')) return;
    replaceState(data, '¡Listo! Tus datos quedaron cargados');
  } catch (e) { toast(e.message); }
}

// ---------- acciones ----------
const actions = {
  fare(el) {
    const f = state.settings.fares[Number(el.dataset.i)];
    const account = state.settings.transport?.account || defaultAccount('expense');
    commit((s) => addTx(s, { type: 'expense', account, amount: f.amount, cat: 'transporte', desc: f.name, date: today() }), `${f.name} ${money(f.amount)} registrado`, true);
  },
  new: (el) => openEntry({ cat: el.dataset.cat }),
  pay: (el) => openEntry({ type: 'pay', to: el.dataset.card, amountText: el.dataset.amount ? String(Number(el.dataset.amount) / 100) : '' }),
  adjust: (el) => openEntry({ type: 'adjust', account: el.dataset.acc }),
  'edit-tx': (el) => editTx(el.dataset.id),
  'review-ok': (el) => commit((s) => { const t = s.tx.find((x) => x.id === el.dataset.id); if (t) t.review = false; }),
  'inst-yes'(el) {
    const i = dash.instances.find((x) => x.id === el.dataset.id);
    const date = i.kind === 'income' ? today() : (i.date <= today() ? i.date : today());
    commit((s) => addTx(s, instanceToTx(i, date)), `${i.name}: registrado`, true);
  },
  'inst-other'(el) {
    const i = dash.instances.find((x) => x.id === el.dataset.id);
    const tx = instanceToTx(i, today());
    openEntry({ type: tx.type === 'transfer' ? 'transfer' : tx.type, account: tx.account, to: tx.to, cat: tx.cat, desc: tx.desc, planRef: i.id, amountText: String(i.amount / 100) });
  },
  'inst-skip': (el) => commit((s) => { s.overrides[el.dataset.id] = { ...(s.overrides[el.dataset.id] || {}), status: 'skipped' }; }, 'Marcado como saltado', true),
  'inst-unskip': (el) => commit((s) => { delete s.overrides[el.dataset.id]; }),
  'leftover-save'() {
    const l = dash.leftover;
    commit((s) => { addTx(s, { type: 'transfer', account: firstOf('bank'), to: firstOf('savings'), amount: l.amount, date: l.date, cat: 'ahorro', desc: 'Sobrante del periodo' }); s.dismissed[l.key] = true; }, `${money(l.amount)} a tu alcancía`, true);
  },
  'leftover-keep': () => commit((s) => { s.dismissed[dash.leftover.key] = true; }),
  rebase() {
    if (!confirm('Tomar lo que te queda y repartirlo parejo en los días que faltan (lo acumulado deja de verse como extra de hoy). ¿Seguro?')) return;
    commit((s) => { s.settings.rebases = [...(s.settings.rebases || []).filter((r) => r !== today()), today()]; }, 'Listo, repartido en los días que faltan', true);
  },
  'sched-edit': (el) => scheduleSheet(state.schedules.find((s) => s.id === el.dataset.id)),
  'sched-new': () => scheduleSheet(null),
  'stmt-new': (el) => statementSheet(el.dataset.card),
  async ics() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    await shareOrDownload('pagos-financiabass.ics', buildICS(dash.reminders, stamp), 'text/calendar');
  },
  async backup() {
    const ok = await shareOrDownload(`financiabass-respaldo-${today()}.txt`, store.exportEnvelope(state), 'text/plain');
    if (ok) commit((s) => { s.settings.lastBackupAt = today(); }, 'Respaldo listo');
  },
  import() { $('#import-file').click(); },
  config() {
    openSheet(`<h2>Código de configuración</h2><p class="foot top0">Pega el código que empieza con FB1. Reemplaza todos tus datos.</p><textarea id="config-code" rows="5" placeholder="FB1…"></textarea><button type="button" class="btn wide lg" data-sheet-action="apply">Cargar</button>`, (body) => {
      body.onclick = (e) => { if (e.target.closest('[data-sheet-action]')) { closeSheet(); applyConfigCode($('#config-code', body).value); } };
    });
  },
  'config-apply': () => applyConfigCode($('#config-code').value),
  'blank-start'() {
    const t = today();
    const s = emptyState(t);
    const last = dateOf(year(t), month(t), 'last');
    s.settings.firstStart = t;
    s.settings.firstEnd = addDays(t >= last ? dateOf(year(t), month(t) + 1, 'last') : last, -1);
    s.settings.quickAdd.token = uid();
    s.accounts = [
      { id: 'banco', name: 'Banco', type: 'bank', opening: parseAmount($('#ob-bank').value) || 0 },
      { id: 'efectivo', name: 'Efectivo', type: 'cash', opening: parseAmount($('#ob-cash').value) || 0 },
      { id: 'alcancia', name: 'Alcancía', type: 'savings', opening: 0 },
    ];
    s.settings.transport.account = 'efectivo';
    replaceState(s, 'Listo. Agrega tus ingresos y gastos fijos en Plan');
  },
  async 'copy-macro'(el) {
    try { await navigator.clipboard.writeText(el.dataset.text); toast('Copiado'); } catch { toast('Mantén presionado el texto para copiarlo'); }
  },
  reset() {
    if (!confirm('¿Borrar TODOS tus datos de este celular?')) return;
    if (!confirm('De verdad: no se puede deshacer. ¿Hiciste respaldo?')) return;
    store.reset(); state = null; render();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) { e.preventDefault(); actions[el.dataset.action](el); }
  if (e.target.closest('[data-close]')) closeSheet();
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'import-file' && el.files[0]) {
    try {
      const data = store.importEnvelope(await el.files[0].text());
      if (confirm('Esto reemplaza tus datos actuales con el respaldo. ¿Continuar?')) replaceState(data, 'Respaldo restaurado');
    } catch { toast('Ese archivo no es un respaldo válido'); }
    el.value = '';
  }
  const path = el.dataset.setting;
  if (path) {
    commit((s) => {
      const keys = path.split('.');
      const obj = keys.slice(0, -1).reduce((o, k) => (o[k] ||= {}), s.settings);
      const k = keys.at(-1);
      obj[k] = el.type === 'number' ? parseAmount(el.value) || 0 : el.value;
    }, 'Ajuste guardado');
  }
});

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });

// ---------- entrada por URL (atajos, MacroDroid, compartir) ----------
function handleIntents() {
  const hash = location.hash;
  if (hash.startsWith('#setup=')) {
    history.replaceState(null, '', location.pathname);
    applyConfigCode(decodeURIComponent(hash.slice(7)));
    return;
  }
  const params = new URLSearchParams(location.search);
  if (![...params.keys()].length) return;
  history.replaceState(null, '', location.pathname + (location.hash || ''));
  if (!state) return;
  if (params.get('view') && ROUTES[params.get('view')]) { location.hash = `#/${params.get('view')}`; }
  const intent = parseIntent(params, state.settings);
  if (!intent) {
    if (params.get('new') !== null) openEntry({ cat: params.get('cat') || undefined });
    return;
  }
  if (intent.ignore) return toast(`No registré la notificación: ${intent.ignore}`);
  if (intent.extId && state.processedExtIds.includes(intent.extId)) return toast('Eso ya estaba registrado');
  const tx = intent.tx;
  tx.date ||= today();
  if (!state.accounts.some((a) => a.id === tx.account)) tx.account = tx.cat === 'transporte' ? state.settings.transport?.account : defaultAccount('expense');
  if (intent.trusted) {
    commit((s) => {
      addTx(s, tx);
      if (intent.extId) s.processedExtIds = [...s.processedExtIds, intent.extId].slice(-500);
    }, `Registrado: ${money(tx.amount)} ${tx.desc || ''}`, true);
  } else {
    openEntry({ type: 'expense', account: tx.account, cat: tx.cat, desc: tx.desc, date: tx.date, amountText: String(tx.amount / 100) });
  }
}

// ---------- arranque ----------
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22); });
$('#fab').onclick = () => (state ? openEntry({}) : null);
render();
handleIntents();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Hay una versión nueva', { label: 'Actualizar', fn: () => location.reload() });
      });
    });
  }).catch(() => {});
}

// Para depurar desde la consola
window.fb = { get state() { return state; }, get dash() { return dash; }, describeRule };
