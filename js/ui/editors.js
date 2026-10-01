// Hojas para editar todo: cuentas y tarjetas, fijos e ingresos, cada cobro del mes, estados de cuenta,
// accesos rápidos, periodo y la explicación de "¿por qué este número?".
import { money, fmtDate, parseAmount, describeRule, instanceToTx, dateOf, year, month, addDays } from '../engine/index.js';
import { esc, openSheet, closeSheet, toast, uid } from './dom.js';
import { icon } from './icons.js';

let ctx; // { get state, commit, today, firstOf, addTx, editTx, render }
export const initEditors = (c) => { ctx = c; };

const ACC_TYPES = [['bank', 'Banco / débito'], ['cash', 'Efectivo'], ['card', 'Tarjeta de crédito'], ['savings', 'Alcancía / ahorro']];
const KINDS = [['fixed', 'Gasto fijo'], ['income', 'Ingreso'], ['msi', 'Meses sin intereses'], ['savings', 'Ahorro']];
const FREQS = [['monthly', 'Cada mes'], ['bimonthly', 'Cada 2 meses'], ['weekly', 'Cada semana'], ['once', 'Una vez']];
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((d, i) => [String(i), d]);
const MONTHDAYS = [...Array.from({ length: 31 }, (_, i) => [String(i + 1), `Día ${i + 1}`]), ['last', 'Último día del mes']];
const accOptions = (filter = () => true) => ctx.state.accounts.filter((a) => !a.archived && filter(a)).map((a) => [a.id, a.name]);
const pesos = (c) => (c == null || c === '' ? '' : String(c / 100));

// ---------- formulario genérico ----------
function field(f) {
  if (f.type === 'hidden') return `<input type="hidden" name="${f.name}" value="${esc(f.value ?? '')}">`;
  const show = f.when ? `data-when='${esc(JSON.stringify(f.when))}'` : '';
  if (f.type === 'seg') {
    return `<div class="fgroup" ${show}><p class="label">${esc(f.label)}</p><div class="seg full" data-seg="${f.name}">${f.options.map(([v, l]) =>
      `<button type="button" class="${String(v) === String(f.value) ? 'on' : ''}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>
      <input type="hidden" name="${f.name}" value="${esc(f.value ?? '')}"></div>`;
  }
  const input = f.options
    ? `<select name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    : f.type === 'checkbox'
      ? `<input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}>`
      : `<input name="${f.name}" type="${f.type === 'money' ? 'text' : f.type || 'text'}" ${f.type === 'money' ? 'inputmode="decimal" placeholder="0.00"' : ''} ${f.type === 'int' ? 'inputmode="numeric"' : ''} value="${esc(f.value ?? '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
  return `<label class="item field-row ${f.type === 'checkbox' ? 'check' : ''}" ${show}><span class="item-body"><span class="item-title">${esc(f.label)}</span>${f.hint ? `<span class="item-meta">${esc(f.hint)}</span>` : ''}</span>${f.type === 'money' ? '<span class="pre">$</span>' : ''}${input}</label>`;
}

export function formSheet({ title, subtitle, fields, onSave, saveLabel = 'Guardar', extra = [] }) {
  const groups = [];
  let panel = [];
  for (const f of fields) {
    if (f.type === 'seg') { if (panel.length) groups.push(`<div class="panel">${panel.join('')}</div>`); panel = []; groups.push(field(f)); }
    else panel.push(field(f));
  }
  if (panel.length) groups.push(`<div class="panel">${panel.join('')}</div>`);
  openSheet(`<h2>${esc(title)}</h2>${subtitle ? `<p class="foot top0">${subtitle}</p>` : ''}<div class="form">${groups.join('')}</div>
    <button type="button" class="btn wide lg" data-sheet-action="ok">${esc(saveLabel)}</button>
    ${extra.map((x) => `<button type="button" class="btn ghost wide ${x.danger ? 'danger' : ''}" data-sheet-action="${x.id}">${x.icon ? icon(x.icon, 18) : ''}${esc(x.label)}</button>`).join('')}`, (body) => {
    const values = () => Object.fromEntries([...body.querySelectorAll('[name]')].map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.value]));
    const sync = () => {
      const v = values();
      body.querySelectorAll('[data-when]').forEach((el) => {
        const w = JSON.parse(el.dataset.when);
        el.hidden = !Object.entries(w).every(([k, opts]) => opts.includes(v[k]));
      });
    };
    sync();
    body.onchange = sync;
    body.onclick = (e) => {
      const seg = e.target.closest('[data-seg] button');
      if (seg) {
        const box = seg.parentElement;
        box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg));
        body.querySelector(`input[name="${box.dataset.seg}"]`).value = seg.dataset.val;
        sync();
        return;
      }
      const act = e.target.closest('[data-sheet-action]')?.dataset.sheetAction;
      if (act && onSave(act, values()) !== false) closeSheet();
    };
  });
}

// ---------- lista genérica dentro de una hoja ----------
function listSheet(title, subtitle, rows, addLabel, onAdd) {
  openSheet(`<h2>${esc(title)}</h2>${subtitle ? `<p class="foot top0">${subtitle}</p>` : ''}
    <div class="panel">${rows.map((r, i) => `<button type="button" class="item" data-row="${i}">${r.lead || ''}<span class="item-body"><span class="item-title">${esc(r.title)}</span>${r.meta ? `<span class="item-meta">${esc(r.meta)}</span>` : ''}</span>${r.trail || ''}${icon('chevron', 16, 'mute')}</button>`).join('') || '<div class="empty small">Nada todavía</div>'}</div>
    ${addLabel ? `<button type="button" class="btn ghost wide" data-add>${icon('plus', 18)}${esc(addLabel)}</button>` : ''}`, (body) => {
    body.onclick = (e) => {
      const row = e.target.closest('[data-row]');
      if (row) rows[Number(row.dataset.row)].open();
      else if (e.target.closest('[data-add]')) onAdd();
    };
  });
}

// ---------- cuentas y tarjetas ----------
export function accountsList() {
  const icons = { bank: 'bank', cash: 'cash', card: 'card', savings: 'savings' };
  listSheet('Cuentas y tarjetas', 'Nombre, límite, día de corte y de pago. El saldo se corrige con "Saldo real".',
    ctx.state.accounts.filter((a) => !a.archived).map((a) => ({
      lead: `<span class="ic hue-gray">${icon(icons[a.type], 18)}</span>`, title: a.name,
      meta: a.type === 'card' ? `Corte día ${a.cutDay ?? '—'} · pago día ${a.dueDay ?? (a.dueDays ? `+${a.dueDays}` : '—')} · límite ${a.limit ? money(a.limit, { decimals: false }) : '—'}${a.blocked ? ' · bloqueada' : ''}` : ACC_TYPES.find(([t]) => t === a.type)[1],
      open: () => accountSheet(a),
    })), 'Agregar cuenta o tarjeta', () => accountSheet(null));
}

export function accountSheet(a) {
  const isNew = !a;
  a = a || { id: uid(), type: 'card', name: '', opening: 0 };
  formSheet({
    title: isNew ? 'Nueva cuenta o tarjeta' : a.name,
    fields: [
      { name: 'name', label: 'Nombre', value: a.name, placeholder: 'Ej. Nu, BBVA débito' },
      ...(isNew ? [{ name: 'type', label: 'Tipo', type: 'seg', value: a.type, options: ACC_TYPES.map(([v, l]) => [v, l.split(' /')[0]]) },
        { name: 'opening', label: 'Saldo de hoy', hint: 'En tarjeta: lo que debes', type: 'money', value: '' }] : []),
      { name: 'limit', label: 'Límite de crédito', type: 'money', value: pesos(a.limit), when: { type: ['card'] } },
      { name: 'cutDay', label: 'Día de corte', options: MONTHDAYS.slice(0, 31), value: String(a.cutDay || 1), when: { type: ['card'] } },
      { name: 'dueDay', label: 'Día límite de pago', hint: 'El que viene en tu estado de cuenta', options: MONTHDAYS.slice(0, 31), value: String(a.dueDay || ((a.cutDay || 1) + 19) % 31 + 1), when: { type: ['card'] } },
      { name: 'blocked', label: 'Bloqueada (no recomendarla)', type: 'checkbox', value: a.blocked, when: { type: ['card'] } },
      ...(isNew ? [] : [{ name: 'type', type: 'hidden', value: a.type }]),
    ],
    extra: isNew ? [] : [{ id: 'archive', label: 'Ocultar esta cuenta', icon: 'trash', danger: true }],
    onSave(act, v) {
      if (act === 'archive') {
        if (!confirm(`¿Ocultar ${a.name}? Sus movimientos se conservan.`)) return false;
        ctx.commit((s) => { s.accounts.find((x) => x.id === a.id).archived = true; }, 'Cuenta ocultada', true);
        return;
      }
      if (!v.name.trim()) { toast('Ponle nombre'); return false; }
      const type = isNew ? v.type : a.type;
      const next = { ...a, name: v.name.trim(), type };
      if (isNew) next.opening = parseAmount(v.opening) || 0;
      if (type === 'card') {
        Object.assign(next, { limit: parseAmount(v.limit) || 0, cutDay: Number(v.cutDay), dueDay: Number(v.dueDay), blocked: !!v.blocked });
        delete next.dueDays;
      }
      ctx.commit((s) => { const i = s.accounts.findIndex((x) => x.id === a.id); if (i >= 0) s.accounts[i] = next; else s.accounts.push(next); }, 'Guardado', true);
    },
  });
}

// ---------- ingresos y gastos que se repiten ----------
export function schedulesList() {
  listSheet('Ingresos y gastos fijos', 'Sueldo, beca, suscripciones, MSI, ahorro… Toca uno para cambiar monto, día o tarjeta.',
    ctx.state.schedules.map((s) => ({
      lead: `<span class="ic hue-${s.kind === 'income' ? 'green' : s.kind === 'savings' ? 'green' : 'gray'}">${icon(s.kind === 'income' ? 'income' : s.kind === 'savings' ? 'savings' : s.kind === 'msi' ? 'msi' : 'pin', 18)}</span>`,
      title: s.name, meta: `${money(s.amount)} · ${describeRule(s.rule)}`, open: () => scheduleSheet(s),
    })), 'Agregar ingreso o gasto fijo', () => scheduleSheet(null));
}

export function scheduleSheet(s) {
  const isNew = !s;
  const t = ctx.today();
  s = s || { id: uid(), kind: 'fixed', name: '', amount: 0, account: ctx.firstOf('bank'), rule: { type: 'monthly', day: Number(t.slice(8)) } };
  const freq = s.rule.type === 'weekly' ? 'weekly' : s.rule.type === 'once' ? 'once' : (s.rule.every || 1) === 2 ? 'bimonthly' : 'monthly';
  formSheet({
    title: isNew ? 'Nuevo ingreso o gasto fijo' : s.name,
    subtitle: isNew ? '' : 'Los cambios aplican de hoy en adelante; lo que ya registraste no se mueve.',
    fields: [
      { name: 'kind', label: 'Tipo', type: 'seg', value: s.kind, options: KINDS },
      { name: 'name', label: 'Nombre', value: s.name, placeholder: 'Ej. TotalPass' },
      { name: 'amount', label: 'Monto', type: 'money', value: pesos(s.amount) },
      { name: 'account', label: 'Se paga con / entra a', options: accOptions((a) => a.type !== 'savings'), value: s.account },
      { name: 'freq', label: 'Cada cuándo', type: 'seg', value: freq, options: FREQS },
      { name: 'day', label: 'Qué día', options: MONTHDAYS, value: String(s.rule.day ?? 1), when: { freq: ['monthly', 'bimonthly'] } },
      { name: 'weekday', label: 'Qué día', options: WEEKDAYS, value: String(s.rule.weekday ?? 6), when: { freq: ['weekly'] } },
      { name: 'date', label: 'Fecha', type: 'date', value: s.rule.date || t, when: { freq: ['once'] } },
      { name: 'autoPost', label: 'Se cobra solo', hint: 'Lo registro automático y no te pregunto', type: 'checkbox', value: s.autoPost, when: { kind: ['fixed', 'msi'] } },
      { name: 'end', label: 'Termina el', hint: 'Opcional', type: 'date', value: s.end || '' },
    ],
    extra: isNew ? [] : [{ id: 'delete', label: 'Eliminar', icon: 'trash', danger: true }],
    onSave(act, v) {
      if (act === 'delete') {
        if (!confirm(`¿Eliminar ${s.name}? Ya no se contará en tu plan.`)) return false;
        ctx.commit((st) => { st.schedules = st.schedules.filter((x) => x.id !== s.id); }, 'Eliminado', true);
        return;
      }
      const amount = parseAmount(v.amount);
      if (!v.name.trim() || !amount) { toast('Pon nombre y monto'); return false; }
      const day = v.day === 'last' ? 'last' : Number(v.day);
      const rule = v.freq === 'weekly' ? { type: 'weekly', weekday: Number(v.weekday) }
        : v.freq === 'once' ? { type: 'once', date: v.date }
          : { type: 'monthly', day, ...(v.freq === 'bimonthly' ? { every: 2, anchor: s.rule.anchor || dateOf(year(t), month(t), 1) } : {}) };
      const changedRule = !isNew && (JSON.stringify(rule) !== JSON.stringify(s.rule) || amount !== s.amount || v.account !== s.account);
      const autoPost = ['fixed', 'msi'].includes(v.kind) && !!v.autoPost;
      const next = { ...s, name: v.name.trim(), kind: v.kind, amount, account: v.account, rule, autoPost, end: v.end || undefined,
        // Al activar "se cobra solo" no se registran meses pasados (ya están en tus saldos).
        autoSince: autoPost ? (s.autoPost ? s.autoSince : t) : undefined,
        to: v.kind === 'savings' ? (s.to || ctx.firstOf('savings')) : undefined, start: isNew ? t : s.start };
      ctx.commit((st) => {
        // Si cambia monto, día o cuenta: lo pasado (ya registrado) queda igual y lo nuevo aplica desde hoy.
        if (changedRule && st.tx.some((x) => x.planRef?.startsWith(`${s.id}@`))) {
          const old = st.schedules.find((x) => x.id === s.id);
          const lastDone = st.tx.filter((x) => x.planRef?.startsWith(`${s.id}@`)).map((x) => x.planRef.split('@')[1]).sort().pop();
          old.end = lastDone;
          // La regla nueva empieza después del último registrado (mes siguiente si es mensual) para no duplicar.
          // Lo pendiente de este mes (si no estaba pagado) se vuelve a crear con los datos nuevos.
          const after = rule.type === 'monthly' ? dateOf(year(lastDone), month(lastDone) + 1, 1) : addDays(lastDone, 1);
          st.schedules.push({ ...next, id: uid(), start: after });
        } else {
          const i = st.schedules.findIndex((x) => x.id === s.id);
          if (i >= 0) st.schedules[i] = next; else st.schedules.push(next);
        }
      }, 'Guardado', true);
    },
  });
}

// ---------- un cobro / ingreso concreto de este periodo ----------
export function instanceSheet(inst) {
  const st = ctx.state;
  const linked = st.tx.filter((x) => x.planRef === inst.id);
  const verb = inst.kind === 'income' ? 'llegó' : inst.kind === 'savings' ? 'aparté' : 'se cobró';
  if (linked.length) {
    const tx = linked[0];
    openSheet(`<h2>${esc(inst.name)}</h2><p class="foot top0">${fmtDate(inst.nominal)} · ya ${verb}: <b>${money(linked.reduce((a, x) => a + x.amount, 0))}</b> el ${fmtDate(tx.date)}.</p>
      <button type="button" class="btn wide lg" data-a="edit">${icon('adjust', 18)}Editar el movimiento</button>
      <button type="button" class="btn ghost wide" data-a="rule">Cambiar ${esc(inst.name)} para los próximos meses</button>
      <button type="button" class="btn ghost wide danger" data-a="undo">${icon('x', 18)}Marcar como no ${verb.replace('se ', '')}</button>`, (body) => {
      body.onclick = (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'edit') ctx.editTx(tx.id);
        else if (a === 'rule') scheduleSheet(st.schedules.find((x) => x.id === inst.schedId));
        else if (a === 'undo') {
          closeSheet();
          ctx.commit((s) => {
            s.tx = s.tx.filter((x) => x.planRef !== inst.id);
            s.overrides[inst.id] = { ...(s.overrides[inst.id] || {}), noAuto: true }; // que no se vuelva a registrar solo
          }, 'Listo, vuelve a estar pendiente', true);
        }
      };
    });
    return;
  }
  const isPast = inst.date <= ctx.today();
  formSheet({
    title: inst.name,
    subtitle: `${inst.skipped ? 'Saltado este mes. ' : ''}Planeado: ${money(inst.amount)} el ${fmtDate(inst.date)}.`,
    saveLabel: inst.kind === 'income' ? 'Ya llegó' : inst.kind === 'savings' ? 'Ya lo aparté' : 'Ya se cobró',
    fields: [
      { name: 'amount', label: inst.kind === 'income' ? '¿Cuánto llegó?' : '¿Cuánto fue?', type: 'money', value: pesos(inst.amount) },
      { name: 'date', label: 'Fecha', type: 'date', value: isPast ? (inst.kind === 'income' ? ctx.today() : inst.date) : ctx.today() },
      { name: 'account', label: inst.kind === 'income' ? 'Entró a' : 'Con', options: accOptions((a) => (inst.kind === 'income' ? a.type !== 'card' : a.type !== 'savings')), value: inst.account },
    ],
    extra: [
      { id: 'only', label: 'Solo cambiar el monto de este mes' },
      { id: inst.skipped ? 'unskip' : 'skip', label: inst.skipped ? 'Volver a contarlo este mes' : (inst.kind === 'income' ? 'Este mes no llega' : 'Este mes no se cobra'), icon: 'skip' },
      { id: 'rule', label: 'Cambiar para los próximos meses', icon: 'calendar' },
    ],
    onSave(act, v) {
      const amount = parseAmount(v.amount);
      if (act === 'rule') { scheduleSheet(st.schedules.find((x) => x.id === inst.schedId)); return false; }
      if (act === 'skip') return void ctx.commit((s) => { s.overrides[inst.id] = { ...(s.overrides[inst.id] || {}), status: 'skipped' }; }, 'Listo, no lo cuento este mes', true);
      if (act === 'unskip') return void ctx.commit((s) => { const o = { ...(s.overrides[inst.id] || {}) }; delete o.status; s.overrides[inst.id] = o; }, 'Vuelve a contar', true);
      if (!amount) { toast('Pon el monto'); return false; }
      if (act === 'only') return void ctx.commit((s) => { s.overrides[inst.id] = { ...(s.overrides[inst.id] || {}), amount }; }, `Este mes: ${money(amount)}`, true);
      const tx = instanceToTx({ ...inst, account: v.account }, v.date, 'manual', amount);
      ctx.commit((s) => ctx.addTx(s, tx), `${inst.name}: registrado`, true);
    },
  });
}

// ---------- estados de cuenta ----------
export function statementSheet(card, stmt) {
  const acc = ctx.state.accounts.find((a) => a.id === (stmt?.card || card));
  formSheet({
    title: `Estado de cuenta · ${acc.name}`,
    subtitle: 'Lo que dice tu estado de cuenta o la app del banco.',
    fields: [
      { name: 'amount', label: 'Pago para no generar intereses', type: 'money', value: pesos(stmt?.amount) },
      { name: 'due', label: 'Fecha límite de pago', type: 'date', value: stmt?.due || '' },
      { name: 'payFrom', label: 'Se puede pagar desde', hint: 'Opcional (p. ej. después del corte)', type: 'date', value: stmt?.payFrom || '' },
    ],
    extra: stmt ? [{ id: 'delete', label: 'Borrar este estado de cuenta', icon: 'trash', danger: true }] : [],
    onSave(act, v) {
      if (act === 'delete') return void ctx.commit((s) => { s.statements = s.statements.filter((x) => x.id !== stmt.id); }, 'Borrado', true);
      const amount = parseAmount(v.amount);
      if (!amount || !v.due) { toast('Pon monto y fecha límite'); return false; }
      ctx.commit((s) => {
        if (stmt) Object.assign(s.statements.find((x) => x.id === stmt.id), { amount, due: v.due, payFrom: v.payFrom || undefined });
        else s.statements.push({ id: uid(), card: acc.id, amount, due: v.due, payFrom: v.payFrom || undefined, createdAt: ctx.today() });
      }, 'Estado de cuenta guardado', true);
    },
  });
}

export function statementsList() {
  const st = ctx.state;
  listSheet('Estados de cuenta', 'Lo que tienes que pagar de cada tarjeta y para cuándo.',
    st.statements.map((s) => ({
      lead: `<span class="ic hue-gray">${icon('card', 18)}</span>`,
      title: `${st.accounts.find((a) => a.id === s.card)?.name || s.card} · ${money(s.amount)}`,
      meta: `Antes del ${fmtDate(s.due)}`, open: () => statementSheet(s.card, s),
    })), 'Agregar estado de cuenta', () => {
      const cards = st.accounts.filter((a) => a.type === 'card' && !a.archived);
      formSheet({ title: '¿De qué tarjeta?', fields: [{ name: 'card', label: 'Tarjeta', options: cards.map((c) => [c.id, c.name]), value: cards[0]?.id }], saveLabel: 'Siguiente',
        onSave(_, v) { setTimeout(() => statementSheet(v.card), 0); } });
    });
}

// ---------- accesos rápidos (tarifas) ----------
export function faresSheet() {
  const fares = ctx.state.settings.fares || [];
  const fields = [];
  for (let i = 0; i < 4; i++) {
    fields.push({ name: `n${i}`, label: `Botón ${i + 1}`, value: fares[i]?.name || '', placeholder: i < 2 ? 'Ej. Metro' : 'Vacío' });
    fields.push({ name: `a${i}`, label: 'Monto', type: 'money', value: pesos(fares[i]?.amount) });
  }
  formSheet({
    title: 'Botones rápidos', subtitle: 'Aparecen en Hoy. Un toque y queda registrado (sale de tu apartado de transporte).',
    fields,
    onSave(_, v) {
      const next = [0, 1, 2, 3].map((i) => ({ name: v[`n${i}`].trim(), amount: parseAmount(v[`a${i}`]) })).filter((f) => f.name && f.amount);
      ctx.commit((s) => { s.settings.fares = next; }, 'Botones guardados', true);
    },
  });
}

// ---------- periodo, transporte y colchón ----------
export function periodSheet() {
  const st = ctx.state.settings;
  formSheet({
    title: 'Periodo y transporte',
    fields: [
      { name: 'firstEnd', label: 'Fin del primer periodo', hint: 'Después, cada periodo va de día de pago a día de pago', type: 'date', value: st.firstEnd },
      { name: 'rate', label: 'Transporte diario apartado', type: 'money', value: pesos(st.transport?.rate) },
      { name: 'tacc', label: 'Con qué pago el transporte', options: accOptions((a) => a.type !== 'savings'), value: st.transport?.account },
      { name: 'wk', label: 'Días con transporte', type: 'seg', value: (st.transport?.weekdays || []).length === 5 ? 'lv' : 'all', options: [['all', 'Todos los días'], ['lv', 'Lunes a viernes']] },
      { name: 'floor', label: 'Mínimo que siempre dejo en la cuenta', type: 'money', value: pesos(st.liquidityFloor) },
      { name: 'grace', label: 'Días de espera para un ingreso', hint: 'Si no llega en ese tiempo, deja de contarse', options: [['1', '1 día'], ['2', '2 días'], ['3', '3 días'], ['5', '5 días'], ['7', '7 días']], value: String(st.overdueGraceDays ?? 2) },
    ],
    onSave(_, v) {
      if (!v.firstEnd || v.firstEnd < st.firstStart) { toast('Revisa la fecha'); return false; }
      ctx.commit((s) => {
        Object.assign(s.settings, { firstEnd: v.firstEnd, liquidityFloor: parseAmount(v.floor) || 0, overdueGraceDays: Number(v.grace) });
        s.settings.transport = { ...s.settings.transport, rate: parseAmount(v.rate) || 0, account: v.tacc, weekdays: v.wk === 'lv' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6] };
      }, 'Ajustes guardados', true);
    },
  });
}

// ---------- ¿por qué este número? ----------
export function breakdownSheet(d) {
  const row = (label, value, cls = '', hint = '') => `<div class="brow ${cls}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><b>${value}</b></div>`;
  const other = d.otherChanges;
  openSheet(`<h2>¿Cómo sale tu número?</h2>
    <div class="panel pad breakdown">
      ${row('Te tocan por día', money(d.base), '', `${money(d.libre)} libres ÷ ${d.D} días`)}
      ${row(`Acumulado al día ${d.k}`, money(d.accrued), '', d.k > 1 ? 'lo que no gastaste se suma' : '')}
      ${row('Gastado en el periodo', money(-d.variableSpent), 'neg', 'sin fijos ni metro')}
      ${other ? row(other > 0 ? 'Otros cambios' : 'A tu favor', money(-other, { sign: true }), other > 0 ? 'neg' : 'pos', other > 0 ? 'ingresos que no han llegado, fijos más caros, ajustes' : 'ingresos extra, fijos que no se cobraron') : ''}
      <div class="brow total"><span>Disponible</span><b>${money(d.disponible)}</b></div>
      ${d.safeToSpend < Math.max(0, d.disponible) ? row('Te muestro', money(d.safeToSpend), '', `para que el ${fmtDate(d.liquidity.minDate)} alcance a tus pagos`) : ''}
    </div>
    <p class="foot">El metro y tus fijos (TotalPass, Claude, internet…) ya están apartados: no bajan tu número salvo que cuesten más de lo planeado. Las compras con tarjeta sí cuentan el día que las haces; pagar la tarjeta no.</p>
    <div class="panel pad breakdown">
      ${row('Transporte del periodo', `${money(d.transport.spent)} de ${money(d.transport.budget)}`)}
      ${row('Dinero neto hoy', money(d.net), '', 'efectivo + banco − tarjetas')}
    </div>`);
}
