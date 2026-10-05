// Guardado local (solo en este celular). Nada se sube a internet.
import { migrate, emptyState, localToday } from './engine/index.js';

export const KEY = 'financiabass:v1';
const RECOVERY_KEY = 'financiabass:recovery';
const BACKUP_KEY = 'financiabass:backups';
const MAX_BACKUPS = 7;

// Si lo guardado no se puede abrir (dañado o de una versión más nueva), no se pierde: se guarda aparte para
// poder descargarlo y la app no lo sobrescribe.
export let loadError = null;
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    loadError = null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    loadError = e.message || 'Datos dañados';
    try { localStorage.setItem(RECOVERY_KEY, raw); } catch { /* nada */ }
    return null;
  }
}

export const recoveryData = () => { try { return localStorage.getItem(RECOVERY_KEY) || localStorage.getItem(KEY); } catch { return null; } };

// Guarda. Antes del primer cambio de cada día se copia cómo estaban tus datos (las últimas 7 copias).
// Si no hay espacio, primero se sacrifican las copias, nunca tus datos.
export function save(state) {
  const json = JSON.stringify(state);
  try {
    const prev = localStorage.getItem(KEY);
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    const today = localToday();
    if (prev && (!backups.length || backups[0].date !== today)) {
      backups.unshift({ date: today, data: prev });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
    }
  } catch { /* sin espacio para copias */ }
  try { localStorage.setItem(KEY, json); return true; } catch { /* sigue abajo */ }
  try { localStorage.removeItem(BACKUP_KEY); localStorage.setItem(KEY, json); return true; } catch { return false; }
}

export function listBackups() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); } catch { return []; }
}

export function reset(all = false) {
  localStorage.removeItem(KEY);
  localStorage.removeItem(RECOVERY_KEY);
  if (all) localStorage.removeItem(BACKUP_KEY);
}

export function restoreBackup(i) {
  const b = listBackups()[i];
  if (!b) throw new Error('No encontré esa copia');
  return migrate(JSON.parse(b.data));
}

export async function requestPersist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

export function exportEnvelope(state) {
  return JSON.stringify({ app: 'FinanciaBass', schema: state.schema, exportedAt: new Date().toISOString(), data: state }, null, 1);
}

export function importEnvelope(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === 'FinanciaBass' ? obj.data : obj;
  return migrate(data);
}

export { emptyState };
