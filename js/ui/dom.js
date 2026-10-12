// Utilidades de interfaz: escapar texto, toasts y hojas inferiores.

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
