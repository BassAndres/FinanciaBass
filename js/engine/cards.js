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
  if (card.dueDays) return nextBusinessDay(addDays(cut, card.dueDays));
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

// Estados de cuenta pendientes: los pagos a cada tarjeta se reparten del más antiguo al más nuevo.
export function statementStatus(state, accounts) {
  const byCard = {};
  for (const s of state.statements || []) (byCard[s.card] ||= []).push(s);
  const out = [];
  for (const [card, list] of Object.entries(byCard)) {
    list.sort((a, b) => (a.due < b.due ? -1 : 1));
    const since = list.reduce((m, s) => (s.createdAt < m ? s.createdAt : m), list[0].createdAt);
    let paid = 0;
    for (const tx of state.tx) {
      if (tx.date < since) continue;
      if (tx.type === 'transfer' && tx.to === card) paid += tx.amount;
      else if (tx.type === 'income' && tx.account === card) paid += tx.amount;
    }
    for (const s of list) {
      const applied = Math.min(paid, s.amount);
      paid -= applied;
      // Saldo que aún no corta: el banco deja pagarlo a partir del día siguiente al corte.
      const acc = accounts[card];
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
  const captured = statementStatus({ ...state, statements: (state.statements || []).filter((x) => !x.beforeCut) }, accounts);
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
      const remaining = Math.max(0, owedAtCut - paidFrom(acc.id, pc));
      const over = pending.find((x) => x.card === acc.id && cutForPurchase(acc, x.createdAt) === pc);
      if (remaining > 0) {
        out.push({ id: `bill:${acc.id}:${pc}`, card: acc.id, cardName: acc.name, amount: owedAtCut, paid: owedAtCut - remaining, remaining,
          cut: pc, due: over?.due || dueForCut(acc, pc), live: 'bill' });
      }
      billRemaining += remaining;
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
  const cards = state.accounts.filter((a) => a.type === 'card' && !a.archived);
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

