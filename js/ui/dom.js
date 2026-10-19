// Utilidades de interfaz: escapar texto, toasts, hojas inferiores y diálogos propios.
import { icon } from './icons.js';
import { fmtDate, localToday, dateOf, year, month, weekday, lastDayOfMonth } from '../engine/dates.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 3000);
}

export function openSheet(html, onMount) {
  const sheet = $('#sheet');
  sheet.querySelector('.sheet-body').innerHTML = html;
  sheet.hidden = false;
  document.body.classList.add('sheet-open');
  onMount?.(sheet.querySelector('.sheet-body'));
}

export function closeSheet() {
  $('#sheet').hidden = true;
  document.body.classList.remove('sheet-open');
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// iPhone/iPad (incluye iPad que se presenta como Mac), Android u otro.
export function platform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'other';
}
// ¿Abierta como app instalada (pantalla de inicio) y no en el navegador?
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// Navegador en el que está abierta la app (tus datos viven ahí) y su paquete de Android.
export function browserInfo() {
  const ua = navigator.userAgent || '';
  if (navigator.brave) return { name: 'Brave', pkg: 'com.brave.browser' };
  if (/SamsungBrowser/.test(ua)) return { name: 'Samsung Internet', pkg: 'com.sec.android.app.sbrowser' };
  if (/EdgA\//.test(ua)) return { name: 'Edge', pkg: 'com.microsoft.emmx' };
  if (/OPR\//.test(ua)) return { name: 'Opera', pkg: 'com.opera.browser' };
  if (/Firefox\//.test(ua)) return { name: 'Firefox', pkg: 'org.mozilla.firefox' };
  if (/CriOS|Chrome\//.test(ua)) return { name: 'Chrome', pkg: 'com.android.chrome' };
  if (/Safari\//.test(ua)) return { name: 'Safari', pkg: null };
  return { name: 'tu navegador', pkg: null };
}

// ---------- diálogos propios ----------
// Reemplazan a confirm() y al calendario del sistema (que en Android se ven como de otra app). Van encima de todo,
// también de una hoja abierta, y regresan una promesa con lo que elegiste.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function openDialog(html, onPick) {
  let el = $('#dialog');
  if (!el) { el = document.createElement('div'); el.id = 'dialog'; el.className = 'dialog'; document.body.append(el); }
  el.innerHTML = html;
  el.hidden = false;
  const close = (v) => { el.hidden = true; el.innerHTML = ''; el.onclick = null; document.removeEventListener('keydown', key); onPick(v, true); };
  const key = (e) => { if (e.key === 'Escape') close(undefined); };
  document.addEventListener('keydown', key);
  el.onclick = (e) => {
    const b = e.target.closest('[data-dlg]');
    if (b) onPick(b.dataset.dlg, false, close, b);
  };
  el.querySelector('.dialog-card [data-dlg="yes"], .dialog-card [data-dlg="ok"]')?.focus({ preventScroll: true });
  return close;
}

// "¿Seguro?" bonito. `text` puede llevar HTML ya escapado.
export function ask({ title, text = '', ok = 'Sí', cancel = 'Cancelar', danger = false, ic = danger ? 'trash' : 'info' }) {
  return new Promise((resolve) => {
    openDialog(`<div class="dialog-backdrop" data-dlg="no"></div>
      <div class="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <span class="dialog-ic ${danger ? 'bad' : ''}">${icon(ic, 26)}</span>
        <h3 id="dlg-t">${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
        <div class="dialog-actions">${cancel ? `<button type="button" class="btn ghost" data-dlg="no">${esc(cancel)}</button>` : ''}
          <button type="button" class="btn ${danger ? 'btn-bad' : ''}" data-dlg="yes">${esc(ok)}</button></div>
      </div>`, (v, closed, close) => { if (closed) resolve(v === 'yes'); else close(v); });
  });
}

const COLORS = ['var(--lime)', 'var(--warn)', 'var(--pos)', 'var(--bad)', 'var(--blue)', 'var(--violet)'];
const confetti = (n) => `<div class="confetti" aria-hidden="true">${Array.from({ length: n }, (_, i) =>
  `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${Math.round(Math.random() * 360)}deg;--c:${COLORS[i % COLORS.length]}"></i>`).join('')}</div>`;

// Festejo con confeti que te pide tocar "¡Va!" (un premio ganado).
export function celebrate({ title, text = '', ic = 'trophy', ok = '¡Va!' }) {
  return new Promise((resolve) => {
    openDialog(`<div class="dialog-backdrop" data-dlg="ok"></div>
      <div class="dialog-card party" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        ${confetti(28)}
        <span class="dialog-ic win">${icon(ic, 30)}</span>
        <h3 id="dlg-t">${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
        <div class="dialog-actions"><button type="button" class="btn" data-dlg="ok">${esc(ok)}</button></div>
      </div>`, (v, closed, close) => { if (closed) resolve(); else close(v); });
  });
}

// Aviso arriba con confeti que se va solo y no estorba (un logro nuevo). `html` ya viene escapado.
let cheerTimer;
export function cheer(html) {
  let el = $('#cheer');
  if (!el) { el = document.createElement('div'); el.id = 'cheer'; el.className = 'cheer'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.innerHTML = `${confetti(18)}<span class="cheer-ic">${icon('trophy', 20)}</span><span>${html}</span>`;
  el.hidden = false;
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

// "sáb 31 oct", con el año si no es este.
export const dateLabel = (s) => (s ? `${fmtDate(s)}${year(s) !== year(localToday()) ? ` ${year(s)}` : ''}` : '');

// Calendario para elegir una fecha. Regresa 'YYYY-MM-DD', null si tocaste "Quitar" o undefined si cancelaste.
export function pickDate({ value, title = 'Elige la fecha', allowEmpty = false, quick = null } = {}) {
  const today = localToday();
  const shortcuts = quick || [['Hoy', today]];
  let view = dateOf(year(value || today), month(value || today), 1);
  const card = () => {
    const y = year(view), m = month(view);
    const lead = (weekday(view) + 6) % 7; // la semana empieza en lunes
    const days = Array.from({ length: lastDayOfMonth(y, m) }, (_, i) => dateOf(y, m, i + 1));
    return `<div class="dialog-backdrop" data-dlg="cancel"></div>
      <div class="dialog-card cal" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
        <p class="cal-eyebrow">${esc(title)}</p>
        <h3 id="dlg-t" class="cal-sel">${value ? dateLabel(value) : 'Sin fecha'}</h3>
        <div class="cal-head">
          <button type="button" class="cal-nav" data-dlg="prev" aria-label="Mes anterior">${icon('chevron', 18, 'flip')}</button>
          <b>${MESES[m - 1]} ${y}</b>
          <button type="button" class="cal-nav" data-dlg="next" aria-label="Mes siguiente">${icon('chevron', 18)}</button>
        </div>
        <div class="cal-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal-wd">${d}</span>`).join('')}
          ${'<span></span>'.repeat(lead)}${days.map((d) => `<button type="button" class="cal-day${d === today ? ' today' : ''}${d === value ? ' on' : ''}" data-dlg="day" data-d="${d}" aria-label="${fmtDate(d)}">${Number(d.slice(8))}</button>`).join('')}
        </div>
        <div class="cal-quick">${shortcuts.map(([l, d]) => `<button type="button" class="chip${d === value ? ' on' : ''}" data-dlg="day" data-d="${d}">${esc(l)}</button>`).join('')}</div>
        <div class="dialog-actions">${allowEmpty ? '<button type="button" class="btn ghost" data-dlg="clear">Quitar fecha</button>' : ''}<button type="button" class="btn ghost" data-dlg="cancel">Cancelar</button></div>
      </div>`;
  };
  return new Promise((resolve) => {
    let result;
    openDialog(card(), (v, closed, done, b) => {
      if (closed) return resolve(result);
      if (v === 'prev' || v === 'next') {
        view = dateOf(year(view), month(view) + (v === 'next' ? 1 : -1), 1);
        $('#dialog').innerHTML = card();
      } else if (v === 'day') {
        result = b.dataset.d;
        b.classList.add('on');
        setTimeout(() => done(v), 140);
      } else {
        result = v === 'clear' ? null : undefined;
        done(v);
      }
    });
  });
}
