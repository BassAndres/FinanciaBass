// Tarjetas de crédito: cortes, fechas límite, utilización, estados de cuenta y "¿con qué tarjeta pago hoy?".
import { dateOf, year, month, addDays, diffDays } from './dates.js';
import { nextBusinessDay } from './holidays.js';
import { balancesAt } from './ledger.js';

// Primer corte en o después de `date`.
export function nextCut(card, date) {
  let c = dateOf(year(date), month(date), card.cutDay);
  if (c < date) c = dateOf(year(date), month(date) + 1, card.cutDay);
  return c;
}

// Fecha límite de pago del corte `cut` (recorrida al siguiente día hábil).
export function dueForCut(card, cut) {
  if (card.dueDays || !card.dueDay) return nextBusinessDay(addDays(cut, card.dueDays || 20));
  let d = dateOf(year(cut), month(cut), card.dueDay);
  if (d <= cut) d = dateOf(year(cut), month(cut) + 1, card.dueDay);
  return nextBusinessDay(d);
}

// Corte al que entra una compra hecha en `date`. Lo del mismo día del corte ya entra al siguiente
// (el banco cierra el estado de cuenta ese día y las compras se aplican después).
export const cutForPurchase = (card, date) => nextCut(card, addDays(date, 1));

export function daysToPay(card, date) {
  const cut = cutForPurchase(card, date);
  const due = dueForCut(card, cut);
  return { cut, due, days: diffDays(due, date) };
}

// Corte al que pertenece un estado de cuenta con fecha límite `due`: el último corte antes de esa fecha.
export function cutBeforeDue(card, due) {
  if (!card?.cutDay) return null;
  let c = dateOf(year(due), month(due), card.cutDay);
  if (c >= due) c = dateOf(year(due), month(due) - 1, card.cutDay);
  return c;
}

// Estados de cuenta pendientes: los pagos a cada tarjeta (desde su corte, hasta hoy) se reparten del más antiguo
// al más nuevo.
export function statementStatus(state, accounts, today = '9999-12-31') {
  const byCard = {};
  for (const s of state.statements || []) (byCard[s.card] ||= []).push(s);
  const out = [];
  for (const [card, list] of Object.entries(byCard)) {
    list.sort((a, b) => (a.due < b.due ? -1 : 1));
    const acc = accounts[card];
    // Cuentan los pagos desde el día del corte del estado más antiguo (aunque lo hayas capturado días después).
    const startOf = (s) => (!s.beforeCut && acc?.cutDay ? cutBeforeDue(acc, s.due) : s.createdAt);
    const since = list.reduce((m, s) => { const x = startOf(s); return x < m ? x : m; }, startOf(list[0]));
    let paid = 0;
    for (const tx of state.tx) {
      if (tx.date < since || tx.date > today) continue;
      if (tx.type === 'transfer' && tx.to === card) paid += tx.amount;
      else if (tx.type === 'income' && tx.account === card) paid += tx.amount;
    }
    for (const s of list) {
      const applied = Math.min(paid, s.amount);
      paid -= applied;
      // Saldo que aún no corta: el banco deja pagarlo a partir del día siguiente al corte.
      const cut = s.beforeCut && acc?.cutDay ? cutForPurchase(acc, s.createdAt) : null;
      const payFrom = s.payFrom || (cut ? addDays(cut, 1) : undefined);
      out.push({ ...s, cut, payFrom, paid: applied, remaining: s.amount - applied, cardName: acc?.name || card });
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

// Lo que hay que pagar de cada tarjeta, a partir de su saldo real:
//  - "ya cortó": lo que debías al último corte menos lo que has pagado después (o el estado de cuenta capturado);
//  - "este ciclo": lo que llevas desde ese corte; se paga después del siguiente corte.
// Las fechas límite capturadas a mano (estados de cuenta) mandan sobre las calculadas.
export function billsFor(state, accounts, bal, today) {
  const captured = statementStatus({ ...state, statements: (state.statements || []).filter((x) => !x.beforeCut) }, accounts, today);
  const pending = (state.statements || []).filter((x) => x.beforeCut);
  const opening = state.settings.openingDate || today;
  // Pagos hechos desde el día del corte (incluido) cuentan para lo que ya cortó.
  const paidFrom = (card, date) => state.tx.reduce((a, t) => a + ((t.date >= date && t.date <= today &&
    ((t.type === 'transfer' && t.to === card) || (t.type === 'income' && t.account === card))) ? t.amount : 0), 0);
  const out = [];
  for (const acc of state.accounts) {
    if (acc.type !== 'card' || acc.archived) continue;
    const mine = captured.filter((x) => x.card === acc.id);
    if (!acc.cutDay) { out.push(...mine); continue; }
    const nc = cutForPurchase(acc, today); // corte al que entran las compras de hoy
    const pc = dateOf(year(nc), month(nc) - 1, acc.cutDay); // último corte (hoy o antes)
    let billRemaining = 0;
    // Estados de cuenta capturados (con el monto exacto del banco).
    for (const m of mine) { out.push(m); billRemaining += Math.max(0, m.remaining); }
    // Último corte (si pasó después de que empezaste a usar la app y no capturaste su estado de cuenta).
    if (pc && pc >= opening && !mine.some((m) => Math.abs(diffDays(m.due, dueForCut(acc, pc))) <= 10)) {
      // Lo que debías al cerrar el corte: todo lo de antes del día del corte.
      const owedAtCut = balancesAt(state, addDays(pc, -1))[acc.id] || 0;
      // Lo que sigue pendiente de estados de cuenta anteriores ya está dentro de lo que debías al corte.
      const older = mine.filter((m) => m.due < dueForCut(acc, pc)).reduce((a, m) => a + Math.max(0, m.remaining), 0);
      const remaining = Math.max(0, owedAtCut - paidFrom(acc.id, pc) - older);
      const over = pending.find((x) => x.card === acc.id && cutForPurchase(acc, x.createdAt) === pc);
      if (remaining > 0) {
        out.push({ id: `bill:${acc.id}:${pc}`, card: acc.id, cardName: acc.name, amount: owedAtCut, paid: owedAtCut - remaining, remaining,
          cut: pc, due: over?.due || dueForCut(acc, pc), live: 'bill' });
      }
      billRemaining += remaining;
    }
    // Nunca pedir más de lo que realmente debes en la tarjeta.
    let extra = billRemaining - Math.max(0, bal[acc.id] || 0);
    for (let i = out.length - 1; extra > 0 && i >= 0; i--) {
      const b = out[i];
      if (b.card !== acc.id || b.remaining <= 0) continue;
      const cut = Math.min(extra, b.remaining);
      out[i] = { ...b, remaining: b.remaining - cut };
      extra -= cut; billRemaining -= cut;
    }
    // Lo que llevas en el ciclo actual.
    const open = (bal[acc.id] || 0) - billRemaining;
    if (open > 0) {
      const over = pending.find((x) => x.card === acc.id && cutForPurchase(acc, x.createdAt) === nc);
      out.push({ id: over?.id || `open:${acc.id}:${nc}`, card: acc.id, cardName: acc.name, amount: open, paid: 0, remaining: open,
        cut: nc, payFrom: addDays(nc, 1), due: over?.due || dueForCut(acc, nc), live: 'open', beforeCut: true });
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

export function cardSummaries(state, bal, accounts, today) {
  const cards = groupCards(state.accounts.filter((a) => a.type === 'card' && !a.archived)).flatMap((g) => g.cards);
  return cards.map((c) => {
    const owed = bal[c.id] || 0;
    const msi = (state.msiPlans || [])
      .filter((p) => p.card === c.id)
      .reduce((s, p) => s + p.installment * Math.max(0, p.remaining - postedInstallments(state, p, today)), 0);
    const util = c.limit ? (owed + msi) / c.limit : null;
    const pay = c.cutDay ? daysToPay(c, today) : null;
    return { ...c, owed, msi, util, pay };
  });
}

// Banco de la tarjeta: el que elegiste o, si no, uno conocido en el nombre o su primera palabra ("BBVA Azul" → "BBVA").
const KNOWN_BANKS = ['BBVA', 'Banamex', 'Santander', 'Banorte', 'HSBC', 'Scotiabank', 'Inbursa', 'Azteca', 'Banregio', 'BanCoppel',
  'Afirme', 'Invex', 'American Express', 'Amex', 'Nu', 'Hey', 'Klar', 'Stori', 'Plata', 'Vexi', 'Ualá', 'Mercado Pago', 'Rappi',
  'Didi', 'Liverpool', 'Palacio de Hierro', 'Costco', 'Openbank', 'Spin', 'Bradescard', 'Falabella'];
const GENERIC = /^(tarjeta|tdc|tc|crédito|credito|mi|la|el|de)$/i;
export function bankOf(card) {
  if ((card.bank || '').trim()) return card.bank.trim();
  const name = (card.name || '').trim();
  const known = KNOWN_BANKS.find((b) => new RegExp(`(^|[^\\p{L}])${b}($|[^\\p{L}])`, 'iu').test(name));
  if (known) return known;
  const first = name.split(/\s+/)[0];
  return first && !GENERIC.test(first) ? first : 'Otras';
}

// Tarjetas juntas por banco, en el orden en que aparece la primera de cada banco.
export function groupCards(cards) {
  const by = new Map();
  for (const c of cards) {
    const key = bankOf(c).toLowerCase();
    if (!by.has(key)) by.set(key, { key, bank: bankOf(c), cards: [] });
    by.get(key).cards.push(c);
  }
  return [...by.values()];
}

// Sube (dir = -1) o baja (dir = 1) una tarjeta dentro de su banco, o todo un banco si `bankKey`.
// Las tarjetas quedan juntas por banco en los mismos lugares que ocupaban en state.accounts.
export function moveCard(state, { id, bankKey, dir }) {
  const slots = [];
  state.accounts.forEach((a, i) => { if (a.type === 'card' && !a.archived) slots.push(i); });
  const groups = groupCards(slots.map((i) => state.accounts[i]));
  const swap = (arr, i) => { const j = i + dir; if (i >= 0 && j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; };
  if (bankKey) swap(groups, groups.findIndex((g) => g.key === bankKey));
  else { const g = groups.find((x) => x.cards.some((c) => c.id === id)); if (g) swap(g.cards, g.cards.findIndex((c) => c.id === id)); }
  const order = groups.flatMap((g) => g.cards);
  slots.forEach((slot, k) => { state.accounts[slot] = order[k]; });
  return state;
}

// Mensualidades MSI ya cargadas (movimientos ligados a la regla del plan).
function postedInstallments(state, plan, today) {
  return state.tx.filter((t) => t.planRef && t.planRef.startsWith(`${plan.schedule}@`) && t.date <= today).length;
}

// Tarjeta recomendada para una compra hoy: la que da más días para pagar sin pasar de 30% de uso.
export function recommendCard(summaries, amount = 0) {
  const ok = summaries.filter((c) => c.pay && !c.blocked && c.limit && (c.owed + c.msi + amount) / c.limit <= 0.3);
  const pool = ok.length ? ok : summaries.filter((c) => c.pay && !c.blocked);
  pool.sort((a, b) => b.pay.days - a.pay.days || (a.util ?? 0) - (b.util ?? 0));
  return pool[0] || null;
}

