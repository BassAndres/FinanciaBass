// Código de configuración "FB1.<base64url>" para cargar tus datos iniciales sin subirlos a ningún lado.

const toB64url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

function checksum(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function encodeConfig(obj) {
  const body = toB64url(new TextEncoder().encode(JSON.stringify(obj)));
  return `FB1.${body}.${checksum(body)}`;
}

export function decodeConfig(code) {
  const m = String(code).trim().match(/FB1\.([A-Za-z0-9_-]+)\.([a-z0-9]+)/);
  if (!m) throw new Error('No parece un código de FinanciaBass (debe empezar con FB1.)');
  if (checksum(m[1]) !== m[2]) throw new Error('El código está incompleto o se cortó al copiarlo');
  return JSON.parse(new TextDecoder().decode(fromB64url(m[1])));
}
