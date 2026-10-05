// Arma el estado inicial a partir del asistente de bienvenida (cualquier persona, sin código FB1).
import { emptyState } from './state.js';
import { suggestFirstEnd } from './periods.js';
import { cutForPurchase, dueForCut } from './cards.js';
import { dateOf, year, month, addDays, weekday } from './dates.js';
import { parseAmount } from './money.js';

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'cuenta';
const cents = (v) => (typeof v === 'number' ? Math.round(v) : parseAmount(v) || 0);

// Regla de repetición a partir de lo que eligió la persona.
export function ruleFrom({ freq = 'monthly', day = 1, weekday: wd = 5, date, anchor } = {}, today) {
  if (freq === 'weekly') return { type: 'weekly', weekday: Number(wd) };
  if (freq === 'biweekly') return { type: 'biweekly', anchor: anchor || nextWeekday(today, Number(wd)) };
  if (freq === 'semimonthly') return { type: 'semimonthly' };
  if (freq === 'once') return { type: 'once', date: date || today };
  const d = day === 'last' ? 'last' : Number(day) || 1;
  if (freq === 'bimonthly') return { type: 'monthly', day: d, every: 2, anchor: dateOf(year(today), month(today), 1) };
  return { type: 'monthly', day: d };
}
const nextWeekday = (from, wd) => addDays(from, (wd - weekday(from) + 7) % 7);

// Ciclo de pago (para los periodos) a partir de la regla del ingreso principal.
export function cycleFromRule(rule) {
  if (!rule) return { type: 'monthly', day: 'last' };
  if (rule.type === 'weekly') return { type: 'weekly', weekday: rule.weekday };
  if (rule.type === 'biweekly') return { type: 'biweekly', anchor: rule.anchor };
  if (rule.type === 'semimonthly') return { type: 'semimonthly' };
  if (rule.type === 'monthly' && (rule.every || 1) === 1) return { type: 'monthly', day: rule.day };
  return { type: 'monthly', day: 'last' };
}

// w = { accounts:[{name,type,balance,last4}], cards:[{name,owed,limit,cutDay,dueDay,statement,last4}],
//       incomes:[{name,amount,freq,day,weekday,account}], fixed:[{…, autoPost}], cycle?, transport:{rate,account,weekdays}, fares:[] }
export function buildState(w, today, token) {
  const s = emptyState(today);
  const used = new Set();
  const idFor = (name) => { let id = slug(name), i = 2; while (used.has(id)) id = `${slug(name)}-${i++}`; used.add(id); return id; };
  const byName = {};
  for (const a of w.accounts || []) {
    if (!a.name?.trim()) continue;
    const acc = { id: idFor(a.name), name: a.name.trim(), type: a.type || 'bank', opening: cents(a.balance) };
    if (a.last4) acc.last4 = String(a.last4).slice(-4);
    s.accounts.push(acc); byName[a.key ?? a.name] = acc.id;
  }
  for (const c of w.cards || []) {
    if (!c.name?.trim()) continue;
    const acc = { id: idFor(c.name), name: c.name.trim(), type: 'card', opening: cents(c.owed), limit: cents(c.limit),
      cutDay: Number(c.cutDay) || 1, dueDay: Number(c.dueDay) || 20 };
    if (c.last4) acc.last4 = String(c.last4).slice(-4);
    s.accounts.push(acc); byName[c.key ?? c.name] = acc.id;
    // Lo que ya cortó y falta pagar (el "pago para no generar intereses" del último estado de cuenta).
    const st = Math.min(cents(c.statement), acc.opening);
    if (st > 0) {
      const cut = cutForPurchase(acc, today);
      const prevCut = dateOf(year(cut), month(cut) - 1, acc.cutDay);
      s.statements.push({ id: `st-${acc.id}`, card: acc.id, amount: st, due: dueForCut(acc, prevCut), createdAt: today });
    }
  }
  if (!s.accounts.some((a) => a.type === 'cash')) s.accounts.push({ id: idFor('efectivo'), name: 'Efectivo', type: 'cash', opening: 0 });
  if (!s.accounts.some((a) => a.type === 'savings')) s.accounts.push({ id: idFor('ahorro'), name: 'Ahorro', type: 'savings', opening: 0 });
  const firstLiquid = s.accounts.find((a) => a.type === 'bank')?.id || s.accounts.find((a) => a.type === 'cash')?.id;
  const accOf = (k) => byName[k] || (s.accounts.some((a) => a.id === k) ? k : null);
  const sched = (x, kind) => {
    const amount = cents(x.amount);
    if (!x.name?.trim() || !amount) return null;
    const rule = ruleFrom(x, today);
    const auto = kind !== 'income' && !!x.autoPost;
    return { id: idFor(`${kind}-${x.name}`), kind, name: x.name.trim(), amount, account: accOf(x.account) || firstLiquid, rule,
      start: today, ...(auto ? { autoPost: true, autoSince: today } : {}) };
  };
  s.schedules = [...(w.incomes || []).map((x) => sched(x, 'income')), ...(w.fixed || []).map((x) => sched(x, 'fixed'))].filter(Boolean);
  // Periodos: del día de pago del ingreso principal (el más grande que se repite) al día antes del siguiente.
  const main = s.schedules.filter((x) => x.kind === 'income' && x.rule.type !== 'once').sort((a, b) => b.amount - a.amount)[0];
  const cycle = w.cycle || cycleFromRule(main?.rule);
  s.settings.payCycle = cycle;
  s.settings.firstStart = today;
  s.settings.firstEnd = suggestFirstEnd(cycle, today);
  s.settings.quickAdd = { token: token || '', sources: {} };
  const t = w.transport || {};
  s.settings.transport = { rate: cents(t.rate), account: accOf(t.account) || firstLiquid || null,
    weekdays: t.weekdays === 'lv' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6] };
  s.settings.fares = (w.fares || []).filter((f) => f.name && cents(f.amount)).map((f) => ({ name: f.name, amount: cents(f.amount) }));
  s.settings.setupAt = today;
  return s;
}
