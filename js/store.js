// Guardado local (solo en este celular). Nada se sube a internet.
import { migrate, emptyState, localToday } from './engine/index.js';

const KEY = 'financiabass:v1';
const BACKUP_KEY = 'financiabass:backups';
const MAX_BACKUPS = 7;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export function save(state) {
  const json = JSON.stringify(state);
  localStorage.setItem(KEY, json);
  // Una copia automática por día (las últimas 7), por si algo sale mal.
  try {
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    const today = localToday();
    if (!backups.length || backups[0].date !== today) {
      backups.unshift({ date: today, data: json });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
    }
  } catch { /* sin espacio: no pasa nada, el estado principal ya se guardó */ }
}

export function listBackups() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); } catch { return []; }
}

export function reset() {
  localStorage.removeItem(KEY);
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
