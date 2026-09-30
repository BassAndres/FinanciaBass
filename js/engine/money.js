// Todo el dinero se maneja en centavos enteros para no acumular errores de redondeo.

export const toCents = (pesos) => Math.round(Number(pesos) * 100);
export const toPesos = (cents) => cents / 100;

// Acepta "25", "25.50", "1,234.50", "$1,234", "MX$5.00", "-5" y devuelve centavos (o null).
export function parseAmount(text) {
  if (text == null) return null;
  const m = String(text).replace(/\s/g, '').match(/-?\d[\d,]*(?:\.\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? Math.abs(toCents(n)) : null;
}

const fmt = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

export function money(cents, { decimals = true, sign = false } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  const body = decimals ? fmt.format(abs) : fmt0.format(abs);
  return `${neg ? '−' : sign ? '+' : ''}$${body}`;
}
