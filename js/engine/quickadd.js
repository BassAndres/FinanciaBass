// Captura rápida por URL (atajos del ícono, MacroDroid) y lectura de notificaciones del banco.
//   ?add=25&desc=Metro&m=tarjeta&cat=transporte&id=<único>&k=<token>
//   ?raw=<texto de la notificación>&src=nu&id=<único>&k=<token>
import { parseAmount } from './money.js';
import { diffDays } from './dates.js';

// Uber, Didi, taxi…: son transporte pero no del diario; esos sí se descuentan de tu número.
export const RIDE_RE = /\b(uber|didi|taxi|cabify|indrive|bolt|beat)\b/i;
// ¿Este gasto sale del apartado diario de transporte? Todo lo de categoría Transporte salvo viajes en auto.
export const isPooledTransport = (tx) => tx.type === 'expense' && tx.cat === 'transporte' &&
  (tx.pool === true || (tx.pool !== false && !RIDE_RE.test(tx.desc || '')));
export const TRANSPORT_RE = /\bmetro(?:tap)?\b|\bautob\b|\bstc\b|metrob[uú]s|cableb[uú]s|tren ligero|troleb[uú]s|ecobici|bicicleta publ|mexib[uú]s|macrob[uú]s|mi ?macro|metrorrey|suburbano|ecov[ií]a|transmetro|\bpasaje\b|\bcami[oó]n\b|tarjeta de movilidad|movilidad integrada/i;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const DECLINED_RE = /rechaz|declin|no (se )?(pudo|fue|autoriz)|fallid|insuficiente/i;
const INCOMING_RE = /recibiste|recibimos|has recibido|te (enviaron|depositaron|transfirieron)|abono a tu|dep[oó]sito (recibido|a tu)|dep[oó]sito|gracias por tu pago|pago (aplicado|recibido)|transferencia (recibida|entrante)|reembolso/i;

// Últimos 4 dígitos de la tarjeta en el texto ("•••• 1234", "*1234", "terminación 1234", "termina en 1234").
export function findLast4(text) {
  const m = String(text || '').match(/(?:[•·*xX]{1,}\s?|termina(?:da|ci[oó]n)?(?:\s+en)?\s+|ending(?:\s+in)?\s+)(\d{4})\b/);
  return m ? m[1] : null;
}

// Monto: el primero con signo de pesos ($, MX$, MXN); si no hay, el primer número con centavos.
// Se salta montos que son tu saldo o tu límite ("tu saldo disponible es $3,400 tras tu compra de $120").
function findAmount(text) {
  const all = [...text.matchAll(/(?:MX\$|\$|MXN\s?)\s?-?\d[\d,]*(?:\.\d{1,2})?/gi)];
  const ok = all.filter((m) => !/(saldo|disponible|l[ií]mite|cr[eé]dito disponible)[^$]{0,25}$/i.test(text.slice(Math.max(0, m.index - 40), m.index)));
  const m = ok[0] || all[0] || text.match(/\d[\d,]*\.\d{2}\b/);
  return m ? parseAmount(m[0].replace(/MXN/i, '')) : null;
}

const unexpanded = (s) => !s || /^\{.*\}$/.test(s.trim()) || /^\[.*\]$/.test(s.trim());

// Lee una notificación de compra (del banco o de Google Wallet). `title` es el título de la notificación:
// en Google Wallet es el nombre del comercio.
export function parseNotification(text, { title = '' } = {}) {
  const t = unexpanded(title) ? '' : String(title).replace(/\s+/g, ' ').trim();
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const all = `${t} ${clean}`.trim();
  if (!clean && !t) return { ignore: 'vacío' };
  if (DECLINED_RE.test(all)) return { ignore: 'compra rechazada' };
  if (INCOMING_RE.test(all)) return { ignore: 'no es un gasto (pago o depósito)' };
  const amount = findAmount(clean) || findAmount(t);
  if (!amount) return { ignore: 'no encontré el monto' };
  const m = clean.match(/\b(?:en|at)\s+(.+?)(?:\s+con\b|\s+el\b|\s+por\b|\s+with\b|\s+using\b|[.,]\s|$)/i);
  // Si el título no trae el monto, normalmente es el comercio (Google Wallet).
  const titleMerchant = t && !findAmount(t) && !/compra|cargo|pago|wallet|transacci|notific/i.test(t) ? t : '';
  const noAmt = (x) => x.replace(/(?:MX\$|\$)\s?[\d,]+(?:\.\d{1,2})?/g, '').replace(/\s+/g, ' ').trim();
  const merchant = (noAmt(m ? m[1] : '') || titleMerchant || noAmt(clean).replace(/^(?:con|en|at|de)\s+/i, '') || clean).slice(0, 60).trim();
  const cat = TRANSPORT_RE.test(all) ? 'transporte' : null;
  return { amount, merchant, cat, last4: findLast4(all) };
}

// Líneas que escribe el atajo de iPhone (Wallet → Transacción):  FB|<monto>|<comercio>|<tarjeta>|<fecha y hora>
// Puede haber varias (si el atajo las va acumulando). Cada una trae su propio id para no registrarla dos veces.
export function parseCaptureLines(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!/^FB\s*\|/i.test(l)) continue;
    const [, amt = '', merchant = '', card = '', when = ''] = l.split('|').map((x) => x.trim());
    const amount = parseAmount(amt);
    if (!amount) continue;
    const text2 = `${merchant} ${card}`;
    out.push({ amount, merchant: merchant.slice(0, 60) || 'Compra', card, when, cat: TRANSPORT_RE.test(text2) ? 'transporte' : null,
      last4: findLast4(card), extId: `fb:${hashStr(l)}` });
  }
  return out;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

// ¿A qué cuenta corresponde? Por id/alias explícito, por los últimos 4 dígitos o porque el nombre aparece en el texto.
export function resolveAccount(accounts, { src, last4, text, sources = {} } = {}) {
  const live = accounts.filter((a) => !a.archived && a.type !== 'savings');
  const key = String(src || '').toLowerCase();
  if (key) {
    const viaMap = sources[key];
    const hit = live.find((a) => a.id === (viaMap || key)) || live.find((a) => norm(a.name) === norm(key));
    if (hit) return hit.id;
  }
  if (last4) {
    const hit = live.find((a) => String(a.last4 || '') === last4);
    if (hit) return hit.id;
  }
  const hay = ` ${norm(text)} `;
  const byName = live.filter((a) => a.name && norm(a.name).length >= 2 && new RegExp(`[^a-z0-9]${escapeRe(norm(a.name))}[^a-z0-9]`).test(hay))
    .sort((a, b) => b.name.length - a.name.length);
  return byName[0]?.id || null;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Una misma compra puede llegar dos veces: de Google Wallet (al instante) y luego del banco, o porque ya la
// registraste a mano. Es duplicado si coincide monto, día y cuenta, pasó hace menos de 3 horas y esa
// otra fuente no la había reportado ya (dos pasajes de metro iguales seguidos sí se cuentan).
export function findCaptureDuplicate(txs, tx, via, nowTs = Date.now()) {
  const WINDOW = 3 * 3600e3;
  return txs.find((x) => x.type === 'expense' && x.amount === tx.amount && x.date === tx.date &&
    (!x.account || !tx.account || x.account === tx.account) &&
    (x.via || 'manual') !== via && !(x.seenBy || []).includes(via) &&
    (!x.ts || Math.abs(nowTs - x.ts) <= WINDOW)) || null;
}

// Convierte los parámetros de la URL en un borrador de movimiento. No toca el estado.
export function parseIntent(params, settings) {
  const get = (k) => (params.get(k) ?? '').trim();
  const add = get('add'), raw = get('raw');
  if (!add && !raw) return null;
  const q = settings.quickAdd || {};
  const trusted = !!q.token && get('k') === q.token;
  const src = (get('src') || get('m')).toLowerCase();
  const account = src ? ((q.sources && q.sources[src]) || src) : null;
  const extId = get('id') || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(get('d')) ? get('d') : null;
  const via = (get('via') || (raw ? 'bank' : 'url')).toLowerCase();
  if (raw) {
    const n = parseNotification(raw, { title: get('t') });
    if (n.ignore) return { ignore: n.ignore, extId, trusted };
    return {
      trusted, extId, via, last4: n.last4, text: `${get('t')} ${raw}`,
      tx: { type: 'expense', amount: n.amount, desc: n.merchant, cat: n.cat || get('cat') || 'otros', account, date, src: 'capture', review: !n.cat },
    };
  }
  const amount = parseAmount(add);
  if (!amount) return { ignore: 'monto inválido', extId, trusted };
  const cat = get('cat') || (TRANSPORT_RE.test(get('desc')) ? 'transporte' : 'otros');
  return { trusted, extId, via, tx: { type: 'expense', amount, desc: get('desc') || 'Gasto', cat, account, date, src: 'url' } };
}

// ¿Este movimiento es algo que ya estaba planeado (una suscripción, el sueldo, la beca…)? Entonces se liga a
// su instancia para no contarlo dos veces. Exige que coincida la cuenta, el nombre o el monto exacto.
export function matchInstance(instances, tx) {
  const wantIncome = tx.type === 'income';
  if (tx.type !== 'income' && tx.type !== 'expense') return null;
  let best = null, bestScore = 0;
  for (const i of instances) {
    if (i.status === 'skipped' || i.status === 'scheduled') continue;
    // Un cargo ya registrado en automático puede ser reemplazado por el real (p. ej. la notificación del banco).
    if (i.status === 'done' && !(i.autoOnly && !wantIncome)) continue;
    if (wantIncome ? i.kind !== 'income' : i.kind !== 'fixed' && i.kind !== 'msi') continue;
    if (Math.abs(i.amount - tx.amount) > Math.max(100, i.amount * 0.15)) continue;
    const dd = diffDays(tx.date, i.date);
    if (wantIncome ? dd < -3 || dd > 10 : Math.abs(dd) > 5) continue;
    const sameAcc = i.account === tx.account;
    const words = norm(i.name).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const nameHit = words.some((w) => norm(tx.desc).includes(w));
    const exact = i.amount === tx.amount;
    // Gastos: tiene que coincidir el nombre, o el monto exacto en la misma tarjeta. Así un súper de $900 no se
    // confunde con una suscripción de $1,000. Ingresos: basta la cuenta, el nombre o el monto exacto.
    if (wantIncome ? !sameAcc && !nameHit && !exact : !nameHit && !(exact && sameAcc)) continue;
    const score = (sameAcc ? 2 : 0) + (nameHit ? 3 : 0) + (exact ? 1 : 0) - Math.abs(dd) / 100;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}
