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

// ¿El cargo capturado corresponde a un fijo que ya estaba planeado (p. ej. Spotify)? Entonces se liga a él.
export function matchInstance(instances, tx) {
  return instances.find((i) =>
    (i.kind === 'fixed' || i.kind === 'msi') && i.status !== 'done' && i.status !== 'skipped' &&
    i.account === tx.account && Math.abs(i.amount - tx.amount) <= Math.max(100, i.amount * 0.15) &&
    Math.abs(diffDays(i.date, tx.date)) <= 3) || null;
}
