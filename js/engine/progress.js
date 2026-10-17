// Progreso como juego: cuenta regresiva a tu próximo pago, racha de días sin pasarte, puntos, nivel, logros y
// un premio que tú eliges.
//
// Cada día cerrado recibe una marca:
//   z  día sin gastos (y sin pasarte)              +20
//   w  gastaste menos que tu base del día          +15
//   o  usaste lo acumulado, pero no te pasaste     +10
//   l  te pasaste (tu número quedó negativo)        0 y se rompe la racha
// Los días de periodos que ya cerraron quedan fijos; los del periodo actual se recalculan cada vez, porque
// puedes corregir un gasto de días pasados.
import { addDays, diffDays, eachDay, maxDate } from './dates.js';
import { periodFor, prevPeriod } from './periods.js';
import { computeDashboard } from './budget.js';
import { isCard } from './ledger.js';

export const DAY_XP = { z: 20, w: 15, o: 10, l: 0 };
export const BADGE_XP = 50;
const green = (o) => !!o && o !== 'l';

export function dayMark(d) {
  if (d.disponible < 0) return 'l';
  if (d.todaySpent <= 0) return 'z';
  return d.todaySpent <= d.base ? 'w' : 'o';
}

// Marcas de los días cerrados (antes de hoy): las que ya había más las que faltan o cambiaron.
export function progressLog(state, today) {
  const st = state.settings;
  const P = periodFor(st, today);
  const log = {};
  for (const [k, v] of Object.entries(state.progress?.log || {})) if (k < today) log[k] = v;
  if (P.notStarted) return log;
  const prev = prevPeriod(st, P);
  // Del periodo anterior solo se llenan los días que falten (p. ej. su último día, que cerró ayer).
  eachDay(maxDate(st.firstStart, prev ? prev.s : P.s), addDays(today, -1), (d) => {
    if (d >= P.s || !(d in log)) log[d] = dayMark(computeDashboard(state, d, { lite: true }));
  });
  return log;
}

// Niveles: del 1 al 2 son 100 puntos, del 2 al 3 otros 200, del 3 al 4 otros 300…
const LEVELS = ['Principiante', 'Constante', 'Ahorrador', 'Estratega', 'Experto', 'Maestro', 'Leyenda'];
export function levelOf(xp) {
  let level = 1;
  while (xp >= 50 * level * (level + 1)) level++;
  return { level, name: LEVELS[Math.min(level, LEVELS.length) - 1], from: 50 * level * (level - 1), to: 50 * level * (level + 1) };
}

export const BADGES = [
  { id: 'first', icon: 'check', name: 'Primer día en verde', hint: 'Termina un día sin pasarte', test: (c) => c.greenDays >= 1 },
  { id: 'streak3', icon: 'flame', name: 'Racha de 3', hint: '3 días seguidos sin pasarte', test: (c) => c.best >= 3 },
  { id: 'streak7', icon: 'flame', name: 'Semana perfecta', hint: '7 días seguidos sin pasarte', test: (c) => c.best >= 7 },
  { id: 'streak14', icon: 'flame', name: 'Dos semanas', hint: '14 días seguidos sin pasarte', test: (c) => c.best >= 14 },
  { id: 'streak30', icon: 'trophy', name: 'Mes de acero', hint: '30 días seguidos sin pasarte', test: (c) => c.best >= 30 },
  { id: 'nospend', icon: 'star', name: 'Día sin gastos', hint: 'Un día entero sin gastar', test: (c) => c.marks.z >= 1 },
  { id: 'saver5', icon: 'savings', name: 'Hormiguita', hint: '5 días gastando menos que tu base', test: (c) => c.marks.z + c.marks.w >= 5 },
  { id: 'period', icon: 'trophy', name: 'Periodo perfecto', hint: 'Cierra un periodo sin pasarte ningún día', test: (c) => c.perfectPeriod },
  { id: 'piggy', icon: 'savings', name: 'A la alcancía', hint: 'Manda dinero a tu alcancía', test: (c) => c.piggy },
  { id: 'card', icon: 'card', name: 'Tarjeta pagada', hint: 'Registra un pago de tarjeta', test: (c) => c.cardPaid },
  { id: 'backup', icon: 'shield', name: 'Precavido', hint: 'Haz un respaldo de tus datos', test: (c) => c.backup },
  { id: 'reward', icon: 'gift', name: 'Premio ganado', hint: 'Cumple la meta de tu premio', test: (c) => c.claimed >= 1 },
];

// Todo lo que se muestra: cuenta regresiva, mapa del periodo, racha, puntos, nivel, logros y premio.
// `d` es el tablero de hoy (computeDashboard) y `log` el resultado de progressLog.
export function progressSummary(state, d, log) {
  const today = d.today;
  const P = d.period;
  const st = state.settings;
  const p = state.progress || {};
  const dates = Object.keys(log).sort();

  let streak = 0;
  for (let x = addDays(today, -1); green(log[x]); x = addDays(x, -1)) streak++;
  let best = 0, run = 0;
  dates.forEach((x, i) => {
    const chained = i > 0 && diffDays(x, dates[i - 1]) === 1;
    run = green(log[x]) ? (chained ? run : 0) + 1 : 0;
    best = Math.max(best, run);
  });

  const todayMark = P.notStarted ? null : dayMark(d);
  const map = [];
  eachDay(P.s, P.e, (x) => map.push({ date: x, mark: x < today ? log[x] || null : x === today ? todayMark : null, today: x === today }));
  const marks = { z: 0, w: 0, o: 0, l: 0 };
  for (const x of dates) marks[log[x]]++;
  const inPeriod = map.filter((x) => x.date < today && x.mark);

  const prev = prevPeriod(st, P);
  let perfectPeriod = false;
  if (prev && prev.s >= st.firstStart) {
    perfectPeriod = true;
    eachDay(prev.s, prev.e, (x) => { if (!green(log[x])) perfectPeriod = false; });
  }
  const savings = new Set(state.accounts.filter((a) => a.type === 'savings').map((a) => a.id));
  const accounts = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const ctx = {
    marks, best, greenDays: dates.filter((x) => green(log[x])).length, perfectPeriod,
    piggy: state.tx.some((x) => x.type === 'transfer' && savings.has(x.to)),
    cardPaid: state.tx.some((x) => x.type === 'transfer' && isCard(accounts[x.to])),
    backup: !!st.lastBackupAt, claimed: p.claimed || 0,
  };
  const stored = p.badges || {};
  const badges = BADGES.map(({ test, ...b }) => {
    const date = stored[b.id] || (test(ctx) ? today : null);
    return { ...b, unlocked: !!date, date, fresh: date === today };
  });
  const newBadges = badges.filter((b) => b.unlocked && !stored[b.id]).map((b) => b.id);

  const xp = dates.reduce((a, x) => a + (DAY_XP[log[x]] || 0), 0) + BADGE_XP * badges.filter((b) => b.unlocked).length;

  let reward = null;
  if (p.reward) {
    const r = p.reward;
    // Solo cuentan los días desde que pusiste el premio: la racha que ya traías no lo gana de inmediato.
    let value = 0;
    if (r.kind === 'days') value = dates.filter((x) => x >= r.since && green(log[x])).length;
    else for (let x = addDays(today, -1); x >= r.since && green(log[x]); x = addDays(x, -1)) value++;
    reward = { ...r, value: Math.min(value, r.goal), done: value >= r.goal };
  }

  const payday = addDays(P.e, 1);
  return {
    notStarted: !!P.notStarted, startsIn: diffDays(P.s, today),
    payday, toPayday: diffDays(payday, today), day: P.notStarted ? 0 : diffDays(today, P.s) + 1, days: P.D,
    map, todayMark, streak, best: Math.max(best, streak),
    periodGreen: inPeriod.filter((x) => green(x.mark)).length, periodClosed: inPeriod.length,
    xp, level: levelOf(xp), badges, newBadges, reward,
  };
}
