// Fechas locales como texto 'YYYY-MM-DD'. Internamente se convierten a número de día (UTC) para evitar
// problemas de zona horaria. Ninguna función lee el reloj salvo localToday().

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');

export const toN = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
export const toS = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (s, k) => toS(toN(s) + k);
export const diffDays = (a, b) => toN(a) - toN(b);
export const weekday = (s) => new Date(toN(s) * DAY).getUTCDay(); // 0 = domingo
export const year = (s) => Number(s.slice(0, 4));
export const month = (s) => Number(s.slice(5, 7));
export const day = (s) => Number(s.slice(8, 10));
export const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Fecha del día `d` (o 'last') del mes (y, m); m puede salirse de 1..12 y se normaliza.
export function dateOf(y, m, d) {
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  const last = lastDayOfMonth(yy, mm);
  const dd = d === 'last' ? last : Math.min(d, last);
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}

export const monthIndex = (s) => year(s) * 12 + month(s) - 1;
export const minDate = (a, b) => (a < b ? a : b);
export const maxDate = (a, b) => (a > b ? a : b);

export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtDate(s, withWeekday = true) {
  const txt = `${day(s)} ${MESES[month(s) - 1]}`;
  return withWeekday ? `${DIAS[weekday(s)]} ${txt}` : txt;
}

export function eachDay(from, to, fn) {
  for (let n = toN(from), end = toN(to); n <= end; n++) fn(toS(n));
}
