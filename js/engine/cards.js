// Tarjetas de crédito: cortes, fechas límite, utilización, estados de cuenta y "¿con qué tarjeta pago hoy?".
import { dateOf, year, month, addDays, diffDays } from './dates.js';
import { nextBusinessDay } from './holidays.js';

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

export function daysToPay(card, date) {
  const cut = nextCut(card, date);
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
      const cut = s.beforeCut && acc?.cutDay ? nextCut(acc, s.createdAt) : null;
      const payFrom = s.payFrom || (cut ? addDays(cut, 1) : undefined);
      out.push({ ...s, cut, payFrom, paid: applied, remaining: s.amount - applied, cardName: acc?.name || card });
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

