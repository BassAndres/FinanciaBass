import {
  computeDashboard, autoPostDue, instanceToTx, periodFor, addDays, localToday,
  parseAmount, money, parseIntent, matchInstance, decodeConfig, balancesAt,
  reminderEvents, googleCalendarLink, buildICS, describeRule, isPooledTransport, dayHistory, monthOutlook,
  parseCaptureLines, parseNotification, resolveAccount, findCaptureDuplicate, rawFromUrl,
} from './engine/index.js';
import * as store from './store.js';
import { $, esc, toast, openSheet, closeSheet, uid, platform, isStandalone } from './ui/dom.js';
import { hoyView, movsView, tarjetasView, planView, masView, entrySheet } from './ui/views.js';
import { renderWizard, clearWizard } from './ui/wizard.js';
import { icon } from './ui/icons.js';
import {
  initEditors, accountsList, accountSheet, schedulesList, scheduleSheet, instanceSheet, statementSheet, statementsList,
  faresSheet, periodSheet, breakdownSheet, cycleDueSheet,
} from './ui/editors.js';

let state = store.load();
let dash = null;
let draft = null;
const today = () => localToday();
const main = $('#main');

// ---------- estado ----------
// Antes de cambiar algo se vuelve a leer lo guardado: otra pestaña o una captura automática (MacroDroid abre
// la app en otra ventana) pudo haber guardado algo que esta copia en memoria no tiene.
function refresh() {
  const fresh = store.load();
  if (fresh) state = fresh;
}

function commit(fn, msg, undoable = false) {
  refresh();
  const before = JSON.stringify(state);
  fn(state);
  if (!store.save(state)) toast('No pude guardar: tu celular no tiene espacio. Haz un respaldo y borra datos de otras apps.');
  render();
  if (typeof msg === 'function') msg = msg();
  if (msg) toast(msg, undoable ? { label: 'Deshacer', fn: () => { state = JSON.parse(before); store.save(state); render(); } } : null);
}

// Guarda un movimiento. Si corresponde a algo planeado (una suscripción, el dinero que te dan cada semana…) lo liga para no contarlo doble.
let lastLink = null;
function addTx(s, tx) {
  const full = { id: uid(), ts: Date.now(), src: 'manual', ...tx };
  lastLink = null;
  if (full.planRef === 'none') delete full.planRef;
  else if (!full.planRef && dash) {
    const m = matchInstance(dash.instances, full);
    if (m) {
      full.planRef = m.id; lastLink = m;
      // Si ya estaba registrado en automático, el cargo real lo reemplaza.
      if (m.status === 'done') s.tx = s.tx.filter((x) => !(x.planRef === m.id && x.src === 'auto'));
    }
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
const liveAcc = (id) => (id && state.accounts.some((a) => a.id === id && !a.archived) ? id : null);
// Cualquier cuenta con la que se pueda pagar (para usuarios sin efectivo o sin banco).
const anySpendable = () => state.accounts.find((a) => !a.archived && a.type !== 'savings')?.id;

// Android/Chrome: guardar el aviso de instalación para mostrar nuestro propio botón.
let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if (state) render(); });
window.addEventListener('appinstalled', () => { installEvent = null; if (state) render(); });

// ---------- render ----------
const ROUTES = { hoy: hoyView, movs: movsView, tarjetas: tarjetasView, plan: planView, mas: masView };

function render() {
  document.body.classList.toggle('no-state', !state);
  if (!state) {
    renderWizard(main, {
      today, token: uid, toast, applyCode: applyConfigCode, loadError: store.loadError,
      finish: (s) => replaceState(s, '¡Listo! Este es tu número de hoy'),
    });
    return;
  }
  main.oninput = main.onchange = main.onclick = null;
  runAutoPost();
  const t = today();
  // El plan empieza hoy (no mañana): si la fecha de inicio quedó en el futuro, se mueve a hoy.
  if (state.settings.firstStart > t && t >= state.settings.openingDate) {
    state.settings.firstStart = t;
    store.save(state);
  }
  dash = computeDashboard(state, t);
  dash.history = dayHistory(state, t, 7);
  dash.outlook = monthOutlook(state, t);
  dash.reminders = reminderEvents(dash).map((e) => ({ ...e, gcal: googleCalendarLink(e) }));
  dash.leftover = leftoverPrompt(t);
  dash.env = { os: platform(), standalone: isStandalone(), canInstall: !!installEvent };
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
  if (liveAcc(last)) return last;
  return (type === 'expense' ? firstOf('cash') || firstOf('bank') : firstOf('bank') || firstOf('cash')) || anySpendable();
}

// Cosas planeadas que este movimiento podría ser (para no contarlas doble).
function planCandidates() {
  if (!dash || (draft.type !== 'expense' && draft.type !== 'income')) return [];
  const kinds = draft.type === 'income' ? ['income'] : ['fixed', 'msi'];
  return dash.instances.filter((i) => kinds.includes(i.kind) && (i.id === draft.planRef || (i.status !== 'done' && i.status !== 'skipped'))
    && Math.abs((Date.parse(i.date) - Date.parse(draft.date || today())) / 864e5) <= 10).slice(0, 5);
}

function paintEntry() {
  if (draft.type === 'adjust' && draft.account) {
    draft.currentBal = balancesAt({ ...state, tx: state.tx.filter((t) => t.id !== draft.id) }, draft.date || today())[draft.account] || 0;
  }
  openSheet(entrySheet(state, draft, planCandidates()), (body) => {
    body.onclick = (e) => {
      const k = e.target.closest('[data-key]')?.dataset.key;
      const pick = e.target.closest('[data-pick]');
      const act = e.target.closest('[data-sheet-action]')?.dataset.sheetAction;
      if (k) {
        let t = draft.amountText || '';
        if (k === 'del') t = t.slice(0, -1);
        else if (k === '.' ? !t.includes('.') : !/\.\d{2}$/.test(t)) t = (t === '0' && k !== '.' ? '' : t === '' && k === '.' ? '0' : t) + k;
        draft.amountText = t.slice(0, 10);
        body.querySelector('.amount-display .num').textContent = draft.amountText || '0';
      } else if (pick) {
        draft[pick.dataset.pick] = pick.dataset.val;
        if (pick.dataset.pick === 'planRef' && pick.dataset.val !== 'none') {
          const i = dash.instances.find((x) => x.id === pick.dataset.val);
          if (i) { draft.amountText ||= String(i.amount / 100); draft.desc ||= i.name; draft.account = i.account; }
        }
        if (pick.dataset.pick === 'type') { draft.account = defaultAccount(draft.type); draft.to = draft.type === 'pay' ? firstOf('card') : null; }
        paintEntry();
      } else if (act === 'save') saveEntry();
      else if (act === 'delete') {
        commit((s) => {
          const gone = s.tx.find((t) => t.id === draft.id);
          s.tx = s.tx.filter((t) => t.id !== draft.id && t.group !== draft.id);
          // Un cargo automático borrado no se vuelve a registrar solo; queda como pendiente.
          if (gone?.planRef && gone.src === 'auto') s.overrides[gone.planRef] = { ...(s.overrides[gone.planRef] || {}), noAuto: true };
        }, 'Movimiento borrado', true);
        closeSheet();
      }
    };
    body.oninput = (e) => { const f = e.target.dataset.field; if (f) draft[f] = e.target.value; };
    body.querySelector('details.refund')?.addEventListener('toggle', (e) => { draft.refundOpen = e.target.open; if (!e.target.open) draft.refund = ''; });
    body.onchange = (e) => { if (e.target.dataset.field === 'date') paintEntry(); };
  });
}

function saveEntry() {
  const amount = parseAmount(draft.amountText);
  if (draft.type !== 'adjust' && !amount) return toast('Escribe el monto');
  if (!liveAcc(draft.account)) return toast('Elige la cuenta');
  if (draft.type === 'adjust' && !String(draft.amountText || '').trim()) return toast('Escribe cuánto hay realmente');
  const base = { date: draft.date || today(), desc: (draft.desc || '').trim() };
  let tx;
  if (draft.type === 'expense') tx = { ...base, type: 'expense', account: draft.account, amount, cat: draft.cat || 'otros', ...(draft.pool != null ? { pool: draft.pool } : {}) };
  else if (draft.type === 'income') tx = { ...base, type: 'income', account: draft.account, amount, cat: 'ingreso' };
  else if (draft.type === 'pay' || draft.type === 'transfer') {
    if (!liveAcc(draft.to) || draft.to === draft.account) return toast('Elige a dónde va');
    tx = { ...base, type: 'transfer', account: draft.account, to: draft.to, amount, cat: draft.type === 'pay' ? 'pago' : 'mover', desc: base.desc || (draft.type === 'pay' ? 'Pago de tarjeta' : '') };
  } else {
    const real = parseAmount(draft.amountText) ?? 0;
    const current = balancesAt({ ...state, tx: state.tx.filter((t) => t.id !== draft.id) }, base.date)[draft.account] || 0;
    tx = { ...base, type: 'adjust', account: draft.account, amount: real - current, desc: 'Ajuste: saldo real' };
    if (!tx.amount) { closeSheet(); return toast('El saldo ya coincide'); }
    // "Lo pasé de otra cuenta": no es dinero nuevo ni perdido, es un movimiento (no cambia tu número).
    if (draft.adjReason === 'move' && draft.moveFrom && !draft.id) {
      const diff = tx.amount;
      tx = diff > 0
        ? { ...base, type: 'transfer', account: draft.moveFrom, to: draft.account, amount: diff, cat: 'mover', desc: 'Pasé dinero' }
        : { ...base, type: 'transfer', account: draft.account, to: draft.moveFrom, amount: -diff, cat: 'mover', desc: 'Pasé dinero' };
    }
  }
  // "No, es otro" se respeta: addTx no intenta ligarlo a nada planeado.
  if (draft.planRef) tx.planRef = draft.planRef;
  const editing = draft.id;
  commit((s) => {
    s.settings.lastAccount = { ...(s.settings.lastAccount || {}), [draft.type]: draft.account };
    if (editing) {
      const i = s.tx.findIndex((t) => t.id === editing);
      s.tx[i] = { ...s.tx[i], ...tx, review: false };
      if (draft.planRef === 'none' || !draft.planRef) delete s.tx[i].planRef;
    } else {
      const saved = addTx(s, tx);
      const refund = draft.type === 'expense' ? parseAmount(draft.refund) : 0;
      if (refund) {
        addTx(s, { type: 'income', account: liveAcc(draft.refundAccount) || firstOf('cash') || firstOf('bank') || draft.account, amount: Math.min(refund, amount), date: tx.date,
          cat: 'reembolso', desc: `Me regresaron · ${tx.desc || 'gasto'}`, planRef: 'none', group: saved.id });
        lastLink = null;
      }
    }
  }, () => (editing ? 'Cambios guardados' : (parseAmount(draft.refund) && draft.type === 'expense' ? `Gastaste ${money(amount - Math.min(parseAmount(draft.refund), amount))} netos` : savedMsg(tx))), true);
  closeSheet();
}

function savedMsg(tx) {
  if (lastLink) return `${money(tx.amount)} · lo tomé como ${lastLink.name} (ya estaba apartado)`;
  if (state.settings.transport?.rate && isPooledTransport(tx)) return `${money(tx.amount)} · sale de tu apartado de transporte`;
  if (tx.type === 'expense') return `${money(tx.amount)} menos para hoy`;
  if (tx.type === 'income') return `+${money(tx.amount)} registrado`;
  return `${money(tx.amount || 0)} registrado`;
}

function editTx(id) {
  const t = state.tx.find((x) => x.id === id);
  if (!t) return;
  const type = t.type === 'transfer' ? (state.accounts.find((a) => a.id === t.to)?.type === 'card' ? 'pay' : 'transfer') : t.type;
  const amountText = t.type === 'adjust' ? String(((balancesAt(state, t.date)[t.account]) || 0) / 100) : String(t.amount / 100);
  openEntry({ ...t, type, amountText });
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
    const account = liveAcc(state.settings.transport?.account) || defaultAccount('expense');
    if (!account) return toast('Primero agrega una cuenta en Más → Editar');
    commit((s) => addTx(s, { type: 'expense', account, amount: f.amount, cat: 'transporte', desc: f.name, date: today(), pool: true }),
      `${f.name} ${money(f.amount)} · sale de tu apartado de transporte`, true);
  },
  new: (el) => openEntry({ cat: el.dataset.cat }),
  paste: () => pasteCapture(),
  'cap-os': (el) => commit((s) => { s.settings.capture = { ...(s.settings.capture || {}), os: el.dataset.os }; }),
  'cap-app': (el) => commit((s) => { s.settings.capture = { ...(s.settings.capture || {}), app: el.dataset.app }; }),
  dismiss: (el) => commit((s) => { s.dismissed[el.dataset.key] = true; }),
  async install() {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch { /* nada */ }
    installEvent = null; render();
  },
  'new-income': () => openEntry({ type: 'income', account: firstOf('cash'), planRef: 'none' }),
  pay: (el) => openEntry({ type: 'pay', to: el.dataset.card, amountText: el.dataset.amount ? String(Number(el.dataset.amount) / 100) : '' }),
  adjust: (el) => openEntry({ type: 'adjust', account: el.dataset.acc }),
  'edit-tx': (el) => editTx(el.dataset.id),
  'review-ok': (el) => commit((s) => { const t = s.tx.find((x) => x.id === el.dataset.id); if (t) t.review = false; }),
  'inst-yes'(el) {
    const i = dash.instances.find((x) => x.id === el.dataset.id);
    const date = i.kind === 'income' ? today() : (i.date <= today() ? i.date : today());
    commit((s) => addTx(s, instanceToTx(i, date)), `${i.name}: registrado`, true);
  },
  'inst-open': (el) => instanceSheet(dash.instances.find((x) => x.id === el.dataset.id)),
  breakdown: () => breakdownSheet(dash),
  'acc-list': () => accountsList(),
  'acc-edit': (el) => accountSheet(state.accounts.find((a) => a.id === el.dataset.acc)),
  'sched-list': () => schedulesList(),
  'stmt-list': () => statementsList(),
  'stmt-edit': (el) => {
    const bill = dash.statements.find((x) => x.id === el.dataset.id);
    const st = state.statements.find((x) => x.id === el.dataset.id);
    if (bill?.live === 'open') cycleDueSheet(bill);
    else if (bill?.live === 'bill') statementSheet(bill.card, null, { amount: bill.remaining, due: bill.due });
    else if (st) statementSheet(st.card, st);
  },
  fares: () => faresSheet(),
  period: () => periodSheet(),
  'inst-skip': (el) => commit((s) => { s.overrides[el.dataset.id] = { ...(s.overrides[el.dataset.id] || {}), status: 'skipped' }; }, 'Marcado como saltado', true),
  'inst-unskip': (el) => commit((s) => { const o = { ...(s.overrides[el.dataset.id] || {}) }; delete o.status; s.overrides[el.dataset.id] = o; }),
  'leftover-save'() {
    const l = dash.leftover;
    commit((s) => { addTx(s, { type: 'transfer', account: firstOf('bank') || firstOf('cash'), to: firstOf('savings'), amount: l.amount, date: l.date, cat: 'ahorro', desc: 'Sobrante del periodo' }); s.dismissed[l.key] = true; }, `${money(l.amount)} a tu alcancía`, true);
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
  async 'recovery-download'() {
    const raw = store.recoveryData();
    if (raw) await shareOrDownload(`financiabass-recuperado-${today()}.txt`, raw, 'text/plain');
  },
  'auto-backups'() {
    const list = store.listBackups();
    openSheet(`<h2>Copias automáticas</h2><p class="foot top0">Cada día, antes del primer cambio, guardo cómo estaban tus datos (últimos 7 días, solo en este celular).</p>
      <div class="panel">${list.map((b, i) => `<button type="button" class="item" data-i="${i}"><span class="ic hue-gray">${icon('clock', 18)}</span><span class="item-body"><span class="item-title">Como estaban el ${esc(b.date)}</span><span class="item-meta">Toca para restaurar</span></span>${icon('chevron', 16, 'mute')}</button>`).join('') || '<div class="empty small">Todavía no hay copias</div>'}</div>`, (body) => {
      body.onclick = (e) => {
        const i = e.target.closest('[data-i]')?.dataset.i;
        if (i == null) return;
        try {
          const data = store.restoreBackup(Number(i));
          if (!confirm('Esto reemplaza tus datos actuales con esa copia. ¿Continuar?')) return;
          closeSheet(); replaceState(data, 'Copia restaurada');
        } catch (err) { toast(err.message); }
      };
    });
  },
  config() {
    openSheet(`<h2>Código de configuración</h2><p class="foot top0">Pega el código que empieza con FB1. Reemplaza todos tus datos.</p><textarea id="config-code" rows="5" placeholder="FB1…"></textarea><button type="button" class="btn wide lg" data-sheet-action="apply">Cargar</button>`, (body) => {
      body.onclick = (e) => { if (e.target.closest('[data-sheet-action]')) { closeSheet(); applyConfigCode($('#config-code', body).value); } };
    });
  },
  'config-apply': () => applyConfigCode($('#config-code').value),
  async 'copy-macro'(el) {
    try { await navigator.clipboard.writeText(el.dataset.text); toast('Copiado'); } catch { toast('Mantén presionado el texto para copiarlo'); }
  },
  reset() {
    if (!confirm('¿Borrar TODOS tus datos de este celular?')) return;
    if (!confirm('De verdad: no se puede deshacer. ¿Hiciste respaldo?')) return;
    store.reset(true); clearWizard(); state = null; location.hash = ''; render();
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

window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh(); render(); } });
// Otra pestaña guardó algo: lo tomo para no pisarlo.
window.addEventListener('storage', (e) => { if (e.key === store.KEY) { refresh(); if (!document.querySelector('#sheet:not([hidden])')) render(); } });

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
  // Texto de notificación al final de la dirección: se recupera completo aunque traiga "&" o "#" sin codificar.
  const lenient = rawFromUrl(location.search, hash);
  if (lenient != null) params.set('raw', lenient);
  const keepHash = hash.startsWith('#/') ? hash : '';
  history.replaceState(null, '', location.pathname + keepHash);
  if (!state) return;
  if (params.get('view') && ROUTES[params.get('view')]) { location.hash = `#/${params.get('view')}`; }
  const intent = parseIntent(params, state.settings);
  if (!intent) {
    if (params.get('new') === 'income') openEntry({ type: 'income', account: firstOf('cash'), planRef: 'none' });
    else if (params.get('new') !== null) openEntry({ cat: params.get('cat') || undefined });
    else if (params.get('paste') !== null) pasteSheet();
    return;
  }
  if (intent.ignore) return toast(`No registré la notificación: ${intent.ignore}`);
  const tx = intent.tx;
  tx.date ||= today();
  if (!liveAcc(tx.account)) {
    tx.account = resolveAccount(state.accounts, { src: tx.account, last4: intent.last4, text: intent.text, sources: state.settings.quickAdd?.sources })
      || (tx.cat === 'transporte' ? liveAcc(state.settings.transport?.account) : null) || defaultAccount('expense');
  }
  if (!tx.account) return openEntry({ type: 'expense', cat: tx.cat, desc: tx.desc, date: tx.date, amountText: String(tx.amount / 100) });
  if (intent.trusted) captureTx(tx, intent.via, intent.extId);
  else openEntry({ type: 'expense', account: tx.account, cat: tx.cat, desc: tx.desc, date: tx.date, amountText: String(tx.amount / 100) });
}

// Guarda una compra capturada (notificación, Wallet, atajo de iPhone). Evita duplicados entre fuentes:
// la misma compra puede llegar de Google Wallet y luego del banco, o ya la habías registrado a mano.
function captureTx(tx, via, extId, quiet = false) {
  if (extId && state.processedExtIds.includes(extId)) { if (!quiet) toast('Eso ya estaba registrado'); return 'seen'; }
  const dup = findCaptureDuplicate(state.tx, tx, via);
  commit((s) => {
    if (dup) {
      const x = s.tx.find((t) => t.id === dup.id);
      x.seenBy = [...(x.seenBy || []), via];
      if (!x.account && tx.account) x.account = tx.account;
    } else addTx(s, { ...tx, via, seenBy: [via] });
    if (extId) s.processedExtIds = [...s.processedExtIds, extId].slice(-500);
  }, quiet ? null : () => dup ? `Ya lo tenía: ${money(tx.amount)} ${dup.desc || ''}` : `Registrado: ${money(tx.amount)} ${tx.desc || ''}`, !dup);
  return dup ? 'dup' : 'new';
}

// iPhone: el atajo de Wallet copia "FB|monto|comercio|tarjeta|fecha" al portapapeles. Aquí se pega.
async function pasteCapture(text) {
  if (text == null) {
    try { text = await navigator.clipboard.readText(); } catch { text = null; }
    if (text == null) return pasteSheet();
  }
  const lines = parseCaptureLines(text);
  if (!lines.length) {
    const n = parseNotification(text);
    if (n.ignore) { toast(text.trim() ? 'No encontré una compra en lo que copiaste' : 'No hay nada copiado'); return pasteSheet(); }
    const account = resolveAccount(state.accounts, { last4: n.last4, text }) || defaultAccount('expense');
    return openEntry({ type: 'expense', account, cat: n.cat || undefined, desc: n.merchant, amountText: String(n.amount / 100) });
  }
  let added = 0, dups = 0, seen = 0;
  for (const l of lines) {
    const account = resolveAccount(state.accounts, { last4: l.last4, text: l.card, sources: state.settings.quickAdd?.sources })
      || (l.cat === 'transporte' ? liveAcc(state.settings.transport?.account) : null) || defaultAccount('expense');
    const r = captureTx({ type: 'expense', amount: l.amount, desc: l.merchant, cat: l.cat || 'otros', account, date: today(), src: 'capture', review: !l.cat }, 'wallet', l.extId, true);
    if (r === 'new') added++; else if (r === 'dup') dups++; else seen++;
  }
  toast(added ? `${added} compra${added > 1 ? 's' : ''} registrada${added > 1 ? 's' : ''}${dups ? ` (${dups} ya estaba)` : ''}. Revísalas en Hoy.` : 'Esas compras ya estaban registradas');
}

function pasteSheet() {
  openSheet(`<h2>Pegar compra</h2><p class="foot top0">Mantén presionado el cuadro y elige <b>Pegar</b>. Sirve con lo que copia el atajo de Wallet o con el texto de una notificación de tu banco.</p>
    <textarea id="paste-box" rows="4" placeholder="FB|$45.00|OXXO|Nu|…"></textarea><button type="button" class="btn wide lg" data-sheet-action="go">Registrar</button>`, (body) => {
    body.onclick = (e) => { if (e.target.closest('[data-sheet-action]')) { const v = $('#paste-box', body).value; closeSheet(); if (v.trim()) pasteCapture(v); } };
  });
}

// ---------- arranque ----------
initEditors({
  get state() { return state; }, commit, today, firstOf, addTx, editTx,
});
document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22); });
$('#fab').onclick = () => (state ? openEntry({}) : null);
render();
handleIntents();

if ('serviceWorker' in navigator) {
  // Si llega una versión nueva de la app, se recarga una sola vez para mostrarla.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

// Para depurar desde la consola
window.fb = { get state() { return state; }, get dash() { return dash; }, describeRule, paste: (t) => pasteCapture(t) };
