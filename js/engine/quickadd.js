// Captura rápida por URL (atajos del ícono, MacroDroid) y lectura de notificaciones del banco.
//   ?add=25&desc=Metro&m=joy&cat=transporte&id=<único>&k=<token>
//   ?raw=<texto de la notificación>&src=nu&id=<único>&k=<token>
import { parseAmount } from './money.js';
import { diffDays } from './dates.js';

export const TRANSPORT_RE = /metro|\bstc\b|metrob[uú]s|cableb[uú]s|tren ligero|troleb[uú]s|ecobici|bicicleta publ/i;
const DECLINED_RE = /rechaz|declin|no (se )?(pudo|fue|autoriz)|fallid|insuficiente/i;
const INCOMING_RE = /recib|abono|dep[oó]sito|gracias por tu pago|pago (aplicado|recibido)|transferencia (recibida|entrante)|reembolso/i;

export function parseNotification(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { ignore: 'vacío' };
  if (DECLINED_RE.test(clean)) return { ignore: 'compra rechazada' };
  if (INCOMING_RE.test(clean)) return { ignore: 'no es un gasto (pago o depósito)' };
  const amt = clean.match(/\$\s?[\d,]+(?:\.\d{1,2})?/) || clean.match(/[\d,]+\.\d{2}/);
  const amount = amt ? parseAmount(amt[0]) : null;
  if (!amount) return { ignore: 'no encontré el monto' };
  const m = clean.match(/\ben\s+(.+?)(?:\s+con\b|\s+el\b|\s+por\b|[.,]\s|$)/i);
  const merchant = (m ? m[1] : clean).slice(0, 60).trim();
  const cat = TRANSPORT_RE.test(clean) ? 'transporte' : null;
  return { amount, merchant, cat };
}

// Convierte los parámetros de la URL en un borrador de movimiento. No toca el estado.
export function parseIntent(params, settings) {
  const get = (k) => (params.get(k) ?? '').trim();
  const add = get('add'), raw = get('raw');
  if (!add && !raw) return null;
  const q = settings.quickAdd || {};
  const trusted = !!q.token && get('k') === q.token;
  const src = (get('src') || get('m')).toLowerCase();
  const account = (q.sources && q.sources[src]) || src || null;
  const extId = get('id') || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(get('d')) ? get('d') : null;
  if (raw) {
    const n = parseNotification(raw);
    if (n.ignore) return { ignore: n.ignore, extId, trusted };
    return {
      trusted, extId,
      tx: { type: 'expense', amount: n.amount, desc: n.merchant, cat: n.cat || get('cat') || 'otros', account, date, src: 'auto', review: !n.cat },
    };
  }
  const amount = parseAmount(add);
  if (!amount) return { ignore: 'monto inválido', extId, trusted };
  const cat = get('cat') || (TRANSPORT_RE.test(get('desc')) ? 'transporte' : 'otros');
  return { trusted, extId, tx: { type: 'expense', amount, desc: get('desc') || 'Gasto', cat, account, date, src: 'url' } };
}

// ¿Este movimiento es algo que ya estaba planeado (TotalPass, el dinero de mamá, la beca…)? Entonces se liga a
// su instancia para no contarlo dos veces. Exige que coincida la cuenta, el nombre o el monto exacto.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function matchInstance(instances, tx) {
  const wantIncome = tx.type === 'income';
  if (tx.type !== 'income' && tx.type !== 'expense') return null;
  let best = null, bestScore = 0;
  for (const i of instances) {
    if (i.status === 'done' || i.status === 'skipped') continue;
    if (wantIncome ? i.kind !== 'income' : i.kind !== 'fixed' && i.kind !== 'msi') continue;
    if (Math.abs(i.amount - tx.amount) > Math.max(100, i.amount * 0.15)) continue;
    const dd = diffDays(tx.date, i.date);
    if (wantIncome ? dd < -3 || dd > 10 : Math.abs(dd) > 5) continue;
    const sameAcc = i.account === tx.account;
    const words = norm(i.name).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const nameHit = words.some((w) => norm(tx.desc).includes(w));
    const exact = i.amount === tx.amount;
    if (!sameAcc && !nameHit && !exact) continue;
    const score = (sameAcc ? 2 : 0) + (nameHit ? 3 : 0) + (exact ? 1 : 0) - Math.abs(dd) / 100;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}
