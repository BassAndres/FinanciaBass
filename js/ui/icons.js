// Íconos de línea propios (24×24, trazo 1.75). Se dibujan con currentColor para heredar el color del texto.
const P = {
  home: '<path d="M3.5 10.5 12 3.8l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.6H9.2v5.6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/>',
  card: '<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.6"/><path d="M2.8 9.8h18.4M6.5 14.6h3.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.6"/><path d="M3.5 9.8h17M8.2 3v3.6M15.8 3v3.6"/>',
  more: '<path d="M4 7.5h9M17.5 7.5H20M4 16.5h3M11 16.5h9"/><circle cx="15.3" cy="7.5" r="2.2"/><circle cx="8.8" cy="16.5" r="2.2"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  metro: '<rect x="5.5" y="3.5" width="13" height="13.5" rx="3.2"/><path d="M5.5 11h13M9.3 20.5l1.2-3.5M14.7 20.5l-1.2-3.5M8.9 14h.01M15.1 14h.01"/>',
  bus: '<rect x="4.5" y="3.5" width="15" height="13.5" rx="3"/><path d="M4.5 10h15M7.5 20v-3M16.5 20v-3M8.3 13.6h.01M15.7 13.6h.01M9 6.7h6"/>',
  food: '<path d="M6.5 3.5v6.2A2.3 2.3 0 0 0 8.8 12v8.5M11 3.5v6.2A2.3 2.3 0 0 1 8.8 12M8.8 3.5v4.8M17.5 20.5v-17c-2.2 1-3.4 3.8-3.4 7 0 2.4 1.2 3.7 3.4 3.7"/>',
  treat: '<path d="M4.5 9h12.2v4.6a5.4 5.4 0 0 1-5.4 5.4H9.9a5.4 5.4 0 0 1-5.4-5.4zM16.7 10.5h1.2a2.4 2.4 0 0 1 0 4.8h-1.5M8.5 3.8c-.8 1 .8 1.8 0 2.8M12.5 3.8c-.8 1 .8 1.8 0 2.8"/>',
  school: '<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5h13v14h-13a2 2 0 0 0-2 2zM4.5 19.5a2 2 0 0 0 2 2h13v-4M9 8h6"/>',
  outing: '<path d="M4 7.5h16v3a1.8 1.8 0 0 0 0 3.6v3H4v-3a1.8 1.8 0 0 0 0-3.6z"/><path d="M14.5 7.5v1.6M14.5 11.2v1.6M14.5 14.9v2.2"/>',
  health: '<path d="M12 20.3s-7.8-4.7-7.8-10.4a4.3 4.3 0 0 1 7.8-2.5 4.3 4.3 0 0 1 7.8 2.5c0 5.7-7.8 10.4-7.8 10.4z"/><path d="M7.5 12h2.2l1.3-2.2 2 4.2 1.2-2h2.3"/>',
  clothes: '<path d="M8.6 3.8 4 6.2l1.8 4.3 2.4-.9v10.9h7.6V9.6l2.4.9L20 6.2l-4.6-2.4a3.4 3.4 0 0 1-6.8 0z"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5.3 12v8.5h13.4V12M12 8v12.5M12 8c-1.3-3.6-5.2-4.3-5.2-1.8C6.8 8 12 8 12 8zm0 0c1.3-3.6 5.2-4.3 5.2-1.8C17.2 8 12 8 12 8z"/>',
  subs: '<rect x="3" y="4.5" width="18" height="12.5" rx="2.6"/><path d="M10.3 8.3v4.9l4-2.45zM8.5 20.5h7"/>',
  other: '<path d="M3.5 7.8 12 3.5l8.5 4.3v8.4L12 20.5l-8.5-4.3z"/><path d="M3.5 7.8 12 12l8.5-4.2M12 12v8.5"/>',
  pin: '<path d="M12 20.8s-6.6-5.6-6.6-11A6.6 6.6 0 0 1 18.6 9.8c0 5.4-6.6 11-6.6 11z"/><circle cx="12" cy="9.8" r="2.3"/>',
  msi: '<path d="M12 3.5 3.5 8 12 12.5 20.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16 12 20.5 20.5 16"/>',
  income: '<path d="M17 7 7 17M7 9.5V17h7.5"/>',
  savings: '<ellipse cx="12" cy="6.3" rx="7" ry="2.8"/><path d="M5 6.3v5.4c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V6.3M5 11.7v5.6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5.6"/>',
  pay: '<path d="M7 17 17 7M9.5 7H17v7.5"/>',
  move: '<path d="M4.5 8.5h14l-3.2-3.2M19.5 15.5h-14l3.2 3.2"/>',
  adjust: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  skip: '<path d="m6 5.5 8.5 6.5L6 18.5zM18 5.5v13"/>',
  alert: '<path d="M10.3 4.3 2.9 17.2A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 16.8h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  x: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  backspace: '<path d="M9 5.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3.5 12z"/><path d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6.2A2.2 2.2 0 0 0 13.3 4H6.2A2.2 2.2 0 0 0 4 6.2v7.1a2.2 2.2 0 0 0 2.2 2.2h2.3"/>',
  bank: '<path d="M3.5 9.3 12 4.3l8.5 5M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7M3.5 20h17"/>',
  cash: '<rect x="2.8" y="6" width="18.4" height="12" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.2 9.3h.01M17.8 14.7h.01"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  shield: '<path d="M12 3.5 19.5 6.3v5.6c0 4.3-3.2 7.8-7.5 8.6-4.3-.8-7.5-4.3-7.5-8.6V6.3z"/><path d="m9 12 2.2 2.2L15.3 10"/>',
  trend: '<path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.3 5.5l-2.6 13"/>',
  arrow: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.3 2.3M15.2 15.2l2.3 2.3M17.5 6.5l-2.3 2.3M8.8 15.2l-2.3 2.3"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.other}</svg>`;
}

// Ícono y color por categoría de gasto.
export const CAT_META = {
  comida: { icon: 'food', hue: 'amber', label: 'Comida' },
  transporte: { icon: 'metro', hue: 'blue', label: 'Transporte' },
  antojos: { icon: 'treat', hue: 'rose', label: 'Antojos' },
  escuela: { icon: 'school', hue: 'violet', label: 'Escuela' },
  salidas: { icon: 'outing', hue: 'rose', label: 'Salidas' },
  salud: { icon: 'health', hue: 'green', label: 'Salud' },
  ropa: { icon: 'clothes', hue: 'violet', label: 'Ropa' },
  regalos: { icon: 'gift', hue: 'amber', label: 'Regalos' },
  suscripciones: { icon: 'subs', hue: 'blue', label: 'Suscripciones' },
  otros: { icon: 'other', hue: 'gray', label: 'Otros' },
  fijo: { icon: 'pin', hue: 'gray', label: 'Fijo' },
  msi: { icon: 'msi', hue: 'violet', label: 'Meses sin intereses' },
  ingreso: { icon: 'income', hue: 'green', label: 'Ingreso' },
  reembolso: { icon: 'move', hue: 'green', label: 'Me regresaron' },
  ahorro: { icon: 'savings', hue: 'green', label: 'Ahorro' },
  pago: { icon: 'pay', hue: 'gray', label: 'Pago de tarjeta' },
  mover: { icon: 'move', hue: 'gray', label: 'Movimiento' },
  ajuste: { icon: 'adjust', hue: 'gray', label: 'Ajuste' },
};

export const catMeta = (c) => CAT_META[c] || CAT_META.otros;

export function badge(cat, size = 18) {
  const m = catMeta(cat);
  return `<span class="ic hue-${m.hue}">${icon(m.icon, size)}</span>`;
}
