// Días inhábiles bancarios (CNBV) además de sábados y domingos.
// 2026: publicado en el DOF el 10-dic-2025. 2027: estimado con las mismas reglas; actualizar cada diciembre.
import { addDays, weekday } from './dates.js';

export const BANK_HOLIDAYS = new Set([
  '2026-01-01', '2026-02-02', '2026-03-16', '2026-04-02', '2026-04-03', '2026-05-01',
  '2026-09-16', '2026-11-02', '2026-11-16', '2026-12-12', '2026-12-25',
  '2027-01-01', '2027-02-01', '2027-03-15', '2027-03-25', '2027-03-26', '2027-05-01',
  '2027-09-16', '2027-11-02', '2027-11-15', '2027-12-12', '2027-12-25',
]);

export const isBusinessDay = (s, extra = []) =>
  weekday(s) !== 0 && weekday(s) !== 6 && !BANK_HOLIDAYS.has(s) && !extra.includes(s);

// Si una fecha límite cae en día inhábil, el pago se puede hacer el siguiente día hábil.
export function nextBusinessDay(s, extra = []) {
  let d = s;
  while (!isBusinessDay(d, extra)) d = addDays(d, 1);
  return d;
}

export function prevBusinessDay(s, extra = []) {
  let d = s;
  while (!isBusinessDay(d, extra)) d = addDays(d, -1);
  return d;
}
