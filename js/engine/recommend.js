// ¿Con qué tarjeta conviene pagar cada gasto fijo? La que te da más días entre el cargo y su fecha límite
// (un cargo justo después del corte se paga hasta ~50 días después), sin pasar del 30% de uso, y repartiendo
// para que cada tarjeta tenga algún cargo y no se quede inactiva. Solo fijos que ya van a tarjeta de crédito:
// lo que pagas con débito o efectivo no se toca, y los MSI no se pueden mover.
import { addDays, dateOf, year, month } from './dates.js';
import { expandSchedules } from './schedule.js';
import { daysToPay } from './cards.js';

// Monto mensual aproximado de una regla (para saber cuánto carga cada tarjeta al mes).
export function monthlyAmount(s) {
  const r = s.rule || {};
  if (r.type === 'weekly') return Math.round(s.amount * 52 / 12);
  if (r.type === 'biweekly') return Math.round(s.amount * 26 / 12);
  if (r.type === 'semimonthly') return s.amount * 2;
  if (r.type === 'monthly') return Math.round(s.amount / (r.every || 1));
  return 0;
}

const isCard = (a) => a && a.type === 'card' && !a.archived;

export function recommendScheduleCards(state, today, bal = {}) {
  const acc = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const cards = state.accounts.filter((a) => isCard(a) && !a.blocked && a.cutDay);
  const recurring = state.schedules.filter((s) => s.kind === 'fixed' && isCard(acc[s.account]) && s.rule?.type !== 'once' && !s.archived
    && (!s.end || s.end >= today));
  // Cuántos cargos fijos y cuánto al mes tiene cada tarjeta hoy.
  const load = Object.fromEntries(cards.map((c) => [c.id, { n: 0, monthly: 0 }]));
  for (const s of state.schedules) {
    if ((s.kind !== 'fixed' && s.kind !== 'msi') || !load[s.account] || (s.end && s.end < today)) continue;
    load[s.account].n++; load[s.account].monthly += monthlyAmount(s);
  }
  const out = [];
  for (const s of recurring) {
    const next = expandSchedules([s], today, addDays(today, 75), state.overrides).find((i) => !i.skipped && !state.tx.some((x) => x.planRef === i.id));
    if (!next) continue;
    const options = cards.map((c) => {
      const { cut, due, days } = daysToPay(c, next.date);
      const mine = c.id === s.account;
      const monthly = load[c.id].monthly + (mine ? 0 : monthlyAmount(s));
      const owed = Math.max(0, bal[c.id] || 0);
      const util = c.limit ? (owed + (mine ? 0 : s.amount)) / c.limit : null;
      return { card: c.id, name: c.name, cut, due, days, util, monthly, charges: load[c.id].n + (mine ? 0 : 1), over: util != null && util > 0.3 };
    });
    if (!options.length) continue;
    const score = (o) => o.days - (o.over ? 30 : 0) - (o.charges > 3 ? 2 : 0);
    const ranked = [...options].sort((a, b) => score(b) - score(a) || a.charges - b.charges);
    const current = options.find((o) => o.card === s.account) || null;
    let best = ranked[0];
    // Cambiar solo vale la pena si ganas al menos 5 días (o si la actual ya pasa del 30%).
    if (current && best.card !== current.card && score(best) - score(current) < 5 && !current.over) best = current;
    out.push({ schedule: s.id, name: s.name, amount: s.amount, next: next.date, current, best, options: ranked, move: !!current && best.card !== current.card });
  }
  // Tarjetas sin ningún cargo fijo: conviene ponerles uno chico para que el banco no las dé por inactivas.
  const idle = cards.filter((c) => !load[c.id].n && !out.some((r) => r.move && r.best.card === c.id)).map((c) => ({ card: c.id, name: c.name }));
  return { items: out.sort((a, b) => (b.move - a.move) || (a.next < b.next ? -1 : 1)), idle };
}

// Pasa un gasto fijo a otra cuenta desde su siguiente cargo: lo ya registrado se queda donde estaba.
export function changeScheduleAccount(state, schedId, account, today, uid) {
  const s = state.schedules.find((x) => x.id === schedId);
  if (!s || s.account === account) return state;
  const linked = state.tx.filter((x) => x.planRef?.startsWith(`${schedId}@`)).map((x) => x.planRef.split('@')[1]).sort();
  if (!linked.length) { s.account = account; return state; }
  const last = linked.at(-1);
  const monthlyRule = s.rule.type === 'monthly' || s.rule.type === 'semimonthly';
  const start = monthlyRule ? dateOf(year(last), month(last) + 1, 1) : addDays(last, 1);
  const nid = uid();
  const copy = { ...s, id: nid, account, start: s.start && s.start > start ? s.start : start };
  if (s.autoPost) copy.autoSince = s.autoSince && s.autoSince > today ? s.autoSince : today;
  s.end = last;
  state.schedules.push(copy);
  for (const [k, o] of Object.entries(state.overrides)) {
    const [id, date] = k.split('@');
    if (id === schedId && date >= start) state.overrides[`${nid}@${date}`] = { ...o };
  }
  return state;
}
