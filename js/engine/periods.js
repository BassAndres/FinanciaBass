// Periodos de presupuesto. Un periodo va del día de pago al día antes del siguiente pago. El ciclo de pago se
// configura (settings.payCycle):
//   { type: 'monthly', day: 'last' | 1..31 }   una vez al mes (por omisión: último día del mes)
//   { type: 'semimonthly' }                    quincenas: el 15 y el último día del mes
//   { type: 'weekly', weekday: 0..6 }          cada semana
//   { type: 'biweekly', anchor: 'YYYY-MM-DD' } cada 2 semanas a partir de una fecha de pago
// El primer periodo puede ser especial (de firstStart a firstEnd, p. ej. un "periodo de rescate" de 2 meses).
import { addDays, dateOf, year, month, diffDays, weekday } from './dates.js';

export const DEFAULT_CYCLE = { type: 'monthly', day: 'last' };
const cycleOf = (settings) => settings.payCycle || DEFAULT_CYCLE;

// Último día de pago en o antes de `date`.
export function payDayOnOrBefore(cycle, date) {
  const c = cycle || DEFAULT_CYCLE;
  const y = year(date), m = month(date);
  if (c.type === 'weekly') return addDays(date, -((weekday(date) - (c.weekday ?? 0) + 7) % 7));
  if (c.type === 'biweekly') {
    const k = Math.floor(diffDays(date, c.anchor) / 14);
    return addDays(c.anchor, k * 14);
  }
  if (c.type === 'semimonthly') {
    const cands = [dateOf(y, m, 15), dateOf(y, m, 'last'), dateOf(y, m - 1, 'last')];
    return cands.filter((d) => d <= date).sort().pop();
  }
  const d = dateOf(y, m, c.day ?? 'last');
  return d <= date ? d : dateOf(y, m - 1, c.day ?? 'last');
}

// Primer día de pago estrictamente después de `date`.
export function payDayAfter(cycle, date) {
  const c = cycle || DEFAULT_CYCLE;
  if (c.type === 'weekly') return addDays(date, ((c.weekday ?? 0) - weekday(date) + 7) % 7 || 7);
  if (c.type === 'biweekly') return addDays(payDayOnOrBefore(c, date), 14);
  const y = year(date), m = month(date);
  if (c.type === 'semimonthly') {
    return [dateOf(y, m, 15), dateOf(y, m, 'last'), dateOf(y, m + 1, 15)].filter((d) => d > date).sort()[0];
  }
  const d = dateOf(y, m, c.day ?? 'last');
  return d > date ? d : dateOf(y, m + 1, c.day ?? 'last');
}

export function periodFor(settings, date) {
  const { firstStart, firstEnd } = settings;
  if (date <= firstEnd) {
    return { s: firstStart, e: firstEnd, first: true, notStarted: date < firstStart, D: diffDays(firstEnd, firstStart) + 1 };
  }
  const cycle = cycleOf(settings);
  let s = payDayOnOrBefore(cycle, date);
  const minStart = addDays(firstEnd, 1);
  if (s < minStart) s = minStart;
  // Si el periodo empieza fuera del día de pago (el primero terminó antes), se cierra un día antes del siguiente pago.
  const e = addDays(payDayAfter(cycle, s), -1);
  return { s, e, first: false, notStarted: false, D: diffDays(e, s) + 1 };
}

// Fin sugerido del primer periodo al empezar hoy: el día antes del siguiente pago. Si faltan menos de 7 días,
// se junta con el siguiente para no tener un periodo de 2 o 3 días.
export function suggestFirstEnd(cycle, today) {
  let next = payDayAfter(cycle, today);
  if (diffDays(next, today) < 7) next = payDayAfter(cycle, next);
  return addDays(next, -1);
}

export const prevPeriod = (settings, p) => (p.first ? null : periodFor(settings, addDays(p.s, -1)));
export const nextPeriod = (settings, p) => periodFor(settings, addDays(p.e, 1));
