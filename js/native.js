// Puente con la app de FinanciaBass para Android (window.FBAndroid). En el navegador no existe: todo regresa
// valores vacíos y la app web funciona igual que siempre.
export const NATIVE_LATEST = 1; // versión más nueva de la app de Android (sube cuando cambie el código nativo)
export const APK_URL = './descargas/FinanciaBass.apk';

const A = () => (typeof window !== 'undefined' && window.FBAndroid) || null;
const json = (fn, fallback) => { try { return JSON.parse(fn()) ?? fallback; } catch { return fallback; } };
const call = (fn, fallback = undefined) => { try { return A() ? fn(A()) : fallback; } catch { return fallback; } };

export const isNative = () => !!A();

export const native = {
  version: () => call((a) => a.version(), 0),
  status: () => (A() ? json(() => A().status(), null) : null),
  pending: () => (A() ? json(() => A().pending(), []) : []),
  ack: (ids) => call((a) => a.ack(JSON.stringify(ids))),
  apps: () => (A() ? json(() => A().apps(), { apps: [] }).apps || [] : []),
  allApps: () => (A() ? json(() => A().allApps(), []) : []),
  setApps: (pkgs) => call((a) => a.setApps(JSON.stringify(pkgs))),
  openAccess: () => call((a) => a.openAccess()),
  openAppInfo: () => call((a) => a.openAppInfo()),
  askNotify: () => call((a) => a.askNotify()),
  askBattery: () => call((a) => a.askBattery()),
  setConfirm: (on) => call((a) => a.setConfirm(!!on)),
  test: () => call((a) => a.test(), 'none'),
  shareFile: (name, text, mime) => call((a) => a.shareFile(name, text, mime), false),
  saveBackup: (name, text) => call((a) => a.saveBackup(name, text), ''),
  clipboard: () => call((a) => a.clipboard(), null),
  openUrl: (url) => call((a) => a.openUrl(url)),
};
