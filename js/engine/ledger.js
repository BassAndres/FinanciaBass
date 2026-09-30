// Saldos de cuentas a partir del saldo inicial + movimientos.
// Tipos de cuenta: bank y cash (dinero disponible), savings (alcancía, no se cuenta para gastar),
// card (tarjeta de crédito; su "saldo" es lo que se debe).
//
// Tipos de movimiento:
//   expense  {account, amount}          gasto (en tarjeta aumenta la deuda)
//   income   {account, amount}          ingreso (en tarjeta es devolución)
//   transfer {account, to, amount}      mover dinero (p. ej. pagar tarjeta o mandar al ahorro)
//   adjust   {account, amount (+/-)}    corrección: "mi saldo real es X"

export const isLiquid = (a) => a && (a.type === 'bank' || a.type === 'cash');
export const isCard = (a) => a && a.type === 'card';

// Cambio que provoca un movimiento en cada cuenta (en la convención "saldo" de cada tipo).
export function txDeltas(tx, accounts) {
  const acc = accounts[tx.account];
  const out = {};
  const add = (id, v) => { out[id] = (out[id] || 0) + v; };
  const out1 = (a, id, v) => add(id, isCard(a) ? v : -v); // dinero que sale de la cuenta
  const in1 = (a, id, v) => add(id, isCard(a) ? -v : v); // dinero que entra a la cuenta
  if (tx.type === 'expense') out1(acc, tx.account, tx.amount);
  else if (tx.type === 'income') in1(acc, tx.account, tx.amount);
  else if (tx.type === 'transfer') { out1(acc, tx.account, tx.amount); in1(accounts[tx.to], tx.to, tx.amount); }
  else if (tx.type === 'adjust') add(tx.account, tx.amount);
  return out;
}

// Efecto de un movimiento en el dinero neto disponible N = líquido − tarjetas.
export function txNetEffect(tx, accounts) {
  let n = 0;
  for (const [id, v] of Object.entries(txDeltas(tx, accounts))) {
    const a = accounts[id];
    if (isLiquid(a)) n += v;
    else if (isCard(a)) n -= v;
  }
  return n;
}

export function indexAccounts(state) {
  return Object.fromEntries(state.accounts.map((a) => [a.id, a]));
}

export function balancesAt(state, date, accounts = indexAccounts(state)) {
  const bal = Object.fromEntries(state.accounts.map((a) => [a.id, a.opening || 0]));
  for (const tx of state.tx) {
    if (tx.date > date) continue;
    for (const [id, v] of Object.entries(txDeltas(tx, accounts))) if (id in bal) bal[id] += v;
  }
  return bal;
}

export function netOf(bal, accounts) {
  let n = 0;
  for (const [id, v] of Object.entries(bal)) {
    if (isLiquid(accounts[id])) n += v;
    else if (isCard(accounts[id])) n -= v;
  }
  return n;
}

export function liquidOf(bal, accounts) {
  let n = 0;
  for (const [id, v] of Object.entries(bal)) if (isLiquid(accounts[id])) n += v;
  return n;
}
