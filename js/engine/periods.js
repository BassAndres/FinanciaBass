// Periodos de presupuesto. Un periodo normal va del día de pago (último día del mes) al día antes del
// siguiente pago. El primer periodo puede ser especial (p. ej. un "periodo de rescate" de 2 meses).
import { addDays, dateOf, year, month, day, lastDayOfMonth, diffDays } from './dates.js';

export function periodFor(settings, date) {
  const { firstStart, firstEnd } = settings;
  if (date <= firstEnd) {
    return { s: firstStart, e: firstEnd, first: true, notStarted: date < firstStart, D: diffDays(firstEnd, firstStart) + 1 };
  }
  const y = year(date), m = month(date);
  let s = day(date) >= lastDayOfMonth(y, m) ? dateOf(y, m, 'last') : dateOf(y, m - 1, 'last');
  const minStart = addDays(firstEnd, 1);
  if (s < minStart) s = minStart;
  const e = addDays(dateOf(year(s), month(s) + 1, 'last'), -1);
  return { s, e, first: false, notStarted: false, D: diffDays(e, s) + 1 };
}

export const prevPeriod = (settings, p) => (p.first ? null : periodFor(settings, addDays(p.s, -1)));
export const nextPeriod = (settings, p) => periodFor(settings, addDays(p.e, 1));
