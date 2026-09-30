// Reglas de ingresos y gastos que se repiten. Cada ocurrencia es una "instancia" con id `regla@fecha`.
import { dateOf, monthIndex, weekday, eachDay } from './dates.js';

// Signo: los ingresos suman, todo lo demás (fijos, MSI, ahorro) resta.
export const signOf = (kind) => (kind === 'income' ? 1 : -1);

function datesFor(rule, from, to) {
  const out = [];
  if (rule.type === 'once') {
    if (rule.date >= from && rule.date <= to) out.push(rule.date);
  } else if (rule.type === 'weekly') {
    eachDay(from, to, (d) => { if (weekday(d) === rule.weekday) out.push(d); });
  } else if (rule.type === 'monthly') {
    const every = rule.every || 1;
    const anchor = rule.anchor ? monthIndex(rule.anchor) : null;
    for (let mi = monthIndex(from) - 1; mi <= monthIndex(to) + 1; mi++) {
      if (anchor != null && (((mi - anchor) % every) + every) % every !== 0) continue;
      const d = dateOf(Math.floor(mi / 12), (mi % 12) + 1, rule.day);
      if (d >= from && d <= to) out.push(d);
    }
  }
  return out;
}

export function expandSchedules(schedules, from, to, overrides = {}) {
  const out = [];
  for (const s of schedules) {
    if (s.archived) continue;
    const lo = s.start && s.start > from ? s.start : from;
    const hi = s.end && s.end < to ? s.end : to;
    if (lo > hi) continue;
    for (const date of datesFor(s.rule, lo, hi)) {
      const id = `${s.id}@${date}`;
      const ov = overrides[id] || {};
      const amount = ov.amount != null ? ov.amount : s.amount;
      out.push({
        id, schedId: s.id, date: ov.date || date, nominal: date, name: s.name, kind: s.kind,
        account: s.account, to: s.to, amount, signed: signOf(s.kind) * amount,
        skipped: ov.status === 'skipped', autoPost: !!s.autoPost,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Fecha nominal de una instancia a partir de su id `regla@YYYY-MM-DD`.
export const instanceDate = (planRef) => (planRef && planRef.includes('@') ? planRef.split('@').pop() : null);

export function describeRule(rule) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  if (rule.type === 'once') return `una vez (${rule.date})`;
  if (rule.type === 'weekly') return `cada ${dias[rule.weekday]}`;
  const d = rule.day === 'last' ? 'el último día' : `el día ${rule.day}`;
  if ((rule.every || 1) === 2) return `${d}, cada 2 meses`;
  return `${d} de cada mes`;
}

