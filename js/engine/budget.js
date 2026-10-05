// Motor principal: "Hoy puedes gastar $X".
//
// Idea: dinero neto N = efectivo + banco − lo que debes en tarjetas. Una compra con tarjeta cuenta como gasto
// el día que se hace; pagar la tarjeta no cambia N (es mover dinero), así nada se cuenta doble.
//
//   libre      = A(s−1) + Σ instancias planeadas del periodo − bolsa de transporte
//   R(t)       = A(t) + Σ valor de cada instancia a la fecha t + valor de la bolsa de transporte
//   disponible = R(t) − (libre − ⌊libre·k/D⌋)            (k = día del periodo, D = días del periodo)
//
// A(t) es N(t) sin los movimientos que ya están ligados a instancias (se cuentan en su "valor") ni el
// transporte del periodo (se cuenta en la bolsa). Si un día no gastas, ⌊libre·k/D⌋ crece y lo que no
// usaste se acumula; si gastas de más, el disponible queda negativo hasta que lo recuperas.
import { addDays, diffDays, weekday, eachDay, maxDate, dateOf, year, month } from './dates.js';
import { expandSchedules, instanceDate } from './schedule.js';
import { periodFor } from './periods.js';
import { indexAccounts, balancesAt, netOf, liquidOf, txNetEffect, isLiquid } from './ledger.js';
import { billsFor, cardSummaries, recommendCard } from './cards.js';
import { isPooledTransport } from './quickadd.js';


function transportDays(settings, from, to) {
  const t = settings.transport;
  if (!t || !t.rate) return 0;
  let n = 0;
  eachDay(from, to, (d) => { if (!t.weekdays || t.weekdays.includes(weekday(d))) n++; });
  return n;
}

// Contexto del periodo: todo lo que no depende de la fecha de evaluación.
function periodContext(state, P) {
  const accounts = indexAccounts(state);
  const st = state.settings;
  // Lo planeado hasta el día en que capturaste tus saldos ya está dentro de esos saldos: no se vuelve a contar.
  const from = st.openingDate && st.openingDate >= P.s ? addDays(st.openingDate, 1) : P.s;
  const instances = from <= P.e ? expandSchedules(state.schedules, from, P.e, state.overrides) : [];
  const ids = new Set(instances.map((i) => i.id));
  const Q = (st.transport?.rate || 0) * transportDays(st, P.s, P.e);
  // Movimientos que no entran en A(t): ligados a instancias de este periodo o posteriores, y transporte del periodo.
  const schedIds = new Set(state.schedules.map((x) => x.id));
  const isPlanned = (tx) => {
    if (!tx.planRef || tx.planRef.startsWith('stmt:')) return false;
    const d = instanceDate(tx.planRef);
    if (d < P.s) return false;
    // Si la regla o la instancia ya no existen, el movimiento cuenta como gasto/ingreso normal.
    return d <= P.e ? ids.has(tx.planRef) : schedIds.has(tx.planRef.slice(0, tx.planRef.lastIndexOf('@')));
  };
  // Solo el transporte diario (metro, metrobús…) sale de la bolsa; un Uber o taxi cuenta como gasto normal.
  const isTransport = (tx) => tx.date >= P.s && tx.date <= P.e && !tx.planRef && isPooledTransport(tx);
  return { accounts, st, instances, ids, Q, isPlanned, isTransport };
}

function evalAt(state, ctx, P, t) {
  const { accounts, st, instances, Q, isPlanned, isTransport } = ctx;
  const bal = balancesAt(state, t, accounts);
  let A = netOf(bal, accounts);
  const linked = {};
  let spentT = 0;
  for (const tx of state.tx) {
    if (tx.date > t) continue;
    if (isPlanned(tx)) {
      const eff = txNetEffect(tx, accounts);
      A -= eff;
      (linked[tx.planRef] ||= { eff: 0, n: 0, auto: true });
      linked[tx.planRef].eff += eff;
      linked[tx.planRef].n++;
      if (tx.src !== 'auto') linked[tx.planRef].auto = false;
    } else if (isTransport(tx)) {
      A -= txNetEffect(tx, accounts);
      spentT += tx.amount;
    }
  }
  const scheduled = {};
  for (const tx of state.tx) if (tx.date > t && tx.planRef) scheduled[tx.planRef] = tx.date;
  const grace = st.overdueGraceDays ?? 2;
  let values = 0;
  const status = [];
  for (const i of instances) {
    let value, s;
    if (linked[i.id]) { value = linked[i.id].eff; s = 'done'; }
    // Ya tiene un pago registrado con fecha futura: no se vuelve a preguntar; cuenta como planeado hasta ese día.
    else if (scheduled[i.id]) { value = i.signed; s = 'scheduled'; }
    else if (i.skipped) { value = 0; s = 'skipped'; }
    else if (i.kind === 'income' && diffDays(t, i.date) > grace) { value = 0; s = 'overdue'; }
    else { value = i.signed; s = i.date <= t ? 'due' : 'pending'; }
    values += value;
    status.push({ ...i, status: s, value, autoOnly: s === 'done' && linked[i.id].auto, scheduledFor: scheduled[i.id] });
  }
  const pool = -Math.max(Q, spentT);
  return { A, R: A + values + pool, bal, status, spentT, linked };
}

export function computeDashboard(state, today) {
  const P = periodFor(state.settings, today);
  const t = P.notStarted ? P.s : today;
  const ctx = periodContext(state, P);
  const { accounts, st, instances, Q } = ctx;

  // libre: con el dinero del día anterior al periodo y todo lo planeado a su monto original.
  const before = evalAt(state, ctx, P, addDays(P.s, -1));
  let libre = before.A + instances.reduce((s, i) => s + i.signed, 0) - Q;
  let s0 = P.s;
  let D = P.D;
  // "Repartir en los días que quedan": reinicia el reparto desde una fecha con lo que realmente quedaba.
  const rebase = (st.rebases || []).filter((r) => r > P.s && r <= t && r <= P.e).sort().pop();
  if (rebase) {
    libre = evalAt(state, ctx, P, addDays(rebase, -1)).R;
    s0 = rebase;
    D = diffDays(P.e, rebase) + 1;
  }

  const now = evalAt(state, ctx, P, t);
  const k = Math.min(D, Math.max(1, diffDays(t, s0) + 1));
  const accrued = (kk) => Math.floor((libre * kk) / D);
  const disponible = now.R - (libre - accrued(k));

  // Fecha en la que vuelves a tener saldo positivo si ya no gastas.
  let recovery = null;
  if (disponible < 0) {
    for (let kk = k + 1; kk <= D; kk++) {
      if (now.R - libre + accrued(kk) >= 0) { recovery = addDays(s0, kk - 1); break; }
    }
  }

  // Gasto variable (sin fijos planeados ni transporte de la bolsa): el que mueve tu número de cada día.
  const variable = state.tx.filter((x) => x.type === 'expense' && x.date >= s0 && x.date <= t && !ctx.isPlanned(x) && !ctx.isTransport(x));
  const variableSpent = variable.reduce((a, x) => a + x.amount, 0);
  const todayTx = state.tx.filter((x) => x.date === t && (x.type === 'expense' || x.type === 'income'));
  const todayVariable = todayTx.filter((x) => !ctx.isPlanned(x) && !ctx.isTransport(x)).reduce((a, x) => a + (x.type === 'expense' ? x.amount : -x.amount), 0);
  const liquid = liquidOf(now.bal, accounts);
  const statements = billsFor(state, accounts, now.bal, t).filter((s) => s.remaining > 0);
  const cards = cardSummaries(state, now.bal, accounts, t);
  const base = Math.floor(libre / D);
  const dueNow = now.status.filter((i) => i.status === 'due' && i.kind !== 'income' && i.date <= t && isLiquid(accounts[i.account]))
    .reduce((a, i) => a + i.amount, 0);
  const liq = liquidity(state, ctx, P, t, { liquid: liquid - dueNow, disponible, base, statements });
  const cardOfDay = recommendCard(cards);

  return {
    today, period: P, k, D, daysLeft: D - k, libre, base, disponible, accrued: accrued(k), periodStart: s0,
    variableSpent, otherChanges: libre - now.R - variableSpent,
    todaySpent: todayVariable,
    todayTx: todayTx.map((x) => ({ ...x, pooled: ctx.isTransport(x), planned: ctx.isPlanned(x) })),
    safeToSpend: Math.max(0, Math.min(disponible, liq.capped)),
    R: now.R, recovery, deficit: now.R < 0 || libre < 0,
    startOfDay: disponible + todayVariable,
    net: netOf(now.bal, accounts), liquid, balances: now.bal,
    instances: now.status,
    prompts: now.status.filter((i) => (i.status === 'due' || i.status === 'overdue') && !i.autoPost),
    transport: { budget: Q, spent: now.spentT, rate: st.transport?.rate || 0 },
    statements, payPlan: liq.plan, liquidity: liq, cards, cardOfDay,
  };
}

// Simulación de efectivo día por día: ¿alcanza para los pagos que vienen? y plan para pagar lo antes posible.
function liquidity(state, ctx, P, t, { liquid, disponible, base, statements }) {
  const { accounts, st } = ctx;
  const floor = st.liquidityFloor ?? 0;
  const horizon = statements.reduce((m, s) => maxDate(m, s.due), P.e);
  const future = expandSchedules(state.schedules, addDays(t, 1), horizon, state.overrides);
  const done = new Set(state.tx.filter((x) => x.planRef).map((x) => x.planRef));
  const days = diffDays(horizon, t) + 1;
  const flow = new Array(days).fill(0);
  const inflowDays = new Set();
  const causes = new Array(days).fill(null).map(() => []);
  const tr = st.transport;
  for (const i of future) {
    if (done.has(i.id) || i.skipped) continue;
    const idx = diffDays(i.date, t);
    if (idx < 1 || idx >= days) continue;
    const a = accounts[i.account];
    if (i.kind === 'income' && isLiquid(a)) { flow[idx] += i.amount; inflowDays.add(idx); }
    else if (i.kind !== 'income' && isLiquid(a)) { flow[idx] -= i.amount; causes[idx].push(i.name); }
  }
  for (let idx = 1; idx < days; idx++) {
    const d = addDays(t, idx);
    if (d <= P.e) flow[idx] -= Math.max(0, base);
    if (tr?.rate && isLiquid(accounts[tr.account]) && (!tr.weekdays || tr.weekdays.includes(weekday(d)))) flow[idx] -= tr.rate;
  }
  const c = new Array(days);
  let run = liquid - Math.max(0, disponible);
  for (let idx = 0; idx < days; idx++) { run += idx === 0 ? 0 : flow[idx]; c[idx] = run; }
  // Cada estado de cuenta se paga en su fecha límite…
  const due = statements.map((s) => ({ s, idx: Math.max(0, Math.min(days - 1, diffDays(s.due, t))) }));
  for (const { s, idx } of due) for (let j = idx; j < days; j++) { c[j] -= s.remaining; if (j === idx) causes[j].push(`pago ${s.cardName}`); }
  // …y luego se adelanta todo lo posible: hoy y cada día que entra dinero, sin bajar del piso.
  const plan = [];
  for (const { s, idx } of due) {
    let remaining = s.remaining;
    const from = s.payFrom ? Math.max(0, diffDays(s.payFrom, t)) : 0;
    // "En su fecha límite": no se adelanta nada. "Lo antes posible": se abona hoy y cada día que entra dinero.
    const candidates = st.payStrategy === 'due' ? []
      : [...new Set([0, from, ...inflowDays])].sort((a, b) => a - b).filter((z) => z >= from && z < idx);
    for (const z of candidates) {
      if (remaining <= 0) break;
      let m = Infinity;
      for (let j = z; j < idx; j++) m = Math.min(m, c[j]);
      const x = Math.min(remaining, m - floor);
      if (x <= 0) continue;
      for (let j = z; j < idx; j++) c[j] -= x;
      plan.push({ date: addDays(t, z), card: s.card, cardName: s.cardName, amount: x, statement: s.id, due: s.due });
      remaining -= x;
    }
    if (remaining > 0) plan.push({ date: addDays(t, idx), card: s.card, cardName: s.cardName, amount: remaining, statement: s.id, due: s.due, onDue: true });
  }
  let min = Infinity, minIdx = 0;
  for (let idx = 0; idx < days; idx++) if (c[idx] < min) { min = c[idx]; minIdx = idx; }
  const short = min < floor ? floor - min : 0;
  return {
    min, minDate: addDays(t, minIdx), cause: causes[minIdx].join(', '), short,
    capped: short ? Math.max(0, disponible - short) : disponible,
    plan: plan.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  };
}

// Movimientos automáticos (p. ej. mensualidades MSI y suscripciones con autoPost) que ya debieron cargarse.
export function autoPostDue(state, today) {
  const done = new Set(state.tx.filter((x) => x.planRef).map((x) => x.planRef));
  const auto = state.schedules.filter((s) => s.autoPost);
  const from = state.settings.openingDate ? addDays(state.settings.openingDate, 1) : today;
  if (from > today) return [];
  return expandSchedules(auto, from, today, state.overrides)
    .filter((i) => i.autoPost && !done.has(i.id) && !i.skipped)
    .map((i) => instanceToTx(i, i.date, 'auto'));
}

export function instanceToTx(i, date, src = 'manual', amount = i.amount) {
  if (i.kind === 'income') return { type: 'income', account: i.account, amount, date, desc: i.name, cat: 'ingreso', planRef: i.id, src };
  if (i.kind === 'savings') return { type: 'transfer', account: i.account, to: i.to, amount, date, desc: i.name, cat: 'ahorro', planRef: i.id, src };
  return { type: 'expense', account: i.account, amount, date, desc: i.name, cat: i.kind === 'msi' ? 'msi' : 'fijo', planRef: i.id, src };
}

// Cómo te fue cada día: con cuánto empezaste, cuánto gastaste y con cuánto terminaste (lo que pasa al día siguiente).
export function dayHistory(state, today, n = 7) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(today, -i);
    const P = periodFor(state.settings, d);
    if (P.notStarted || d < state.settings.firstStart) break;
    const x = computeDashboard(state, d);
    out.push({ date: d, start: x.disponible + x.todaySpent, spent: x.todaySpent, end: x.disponible, base: x.base, closed: d < today });
  }
  return out;
}

// Un mes normal (el siguiente completo): cuánto entra, cuánto es fijo y tu "techo" diario.
// Si gastas en promedio más que el techo, empiezas a endeudarte; por debajo, todo lo que sobra es ahorro.
export function monthOutlook(state, today) {
  const from = dateOf(year(today), month(today) + 1, 1);
  const to = dateOf(year(today), month(today) + 1, 'last');
  const days = diffDays(to, from) + 1;
  const inst = expandSchedules(state.schedules, from, to, {});
  const sum = (f) => inst.filter(f).reduce((a, i) => a + i.amount, 0);
  const income = sum((i) => i.kind === 'income');
  const fixed = sum((i) => i.kind === 'fixed' || i.kind === 'msi');
  const savings = sum((i) => i.kind === 'savings');
  const t = state.settings.transport;
  let transport = 0;
  eachDay(from, to, (d) => { if (t?.rate && (!t.weekdays || t.weekdays.includes(weekday(d)))) transport += t.rate; });
  const free = income - fixed - transport;
  return { from, to, days, income, fixed, transport, savings, free, ceiling: Math.floor(free / days), withSavings: Math.floor((free - savings) / days) };
}
