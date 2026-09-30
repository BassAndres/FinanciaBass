// Datos INVENTADOS para pruebas (el repo es público: aquí nunca van números reales).
// Periodo 1-oct → 30-oct 2026. N(30-sep) = 6,500 − 8,700 = −2,200; planeado +3,700; transporte 600.
// libre = 900.00 → base 30.00/día.
import { emptyState } from '../../js/engine/state.js';

export function demoState() {
  const s = emptyState('2026-09-30');
  Object.assign(s.settings, {
    openingDate: '2026-09-30', firstStart: '2026-10-01', firstEnd: '2026-10-30', liquidityFloor: 30000, overdueGraceDays: 99,
    transport: { rate: 2000, account: 'tc', weekdays: [0, 1, 2, 3, 4, 5, 6] },
    quickAdd: { token: 'tok123', sources: { nu: 'tb' } },
  });
  s.accounts = [
    { id: 'banco', name: 'Banco', type: 'bank', opening: 600000 },
    { id: 'efectivo', name: 'Efectivo', type: 'cash', opening: 50000 },
    { id: 'ahorro', name: 'Alcancía', type: 'savings', opening: 0 },
    { id: 'ta', name: 'Tarjeta A', type: 'card', opening: 200000, limit: 1000000, cutDay: 4, dueDay: 24 },
    { id: 'tb', name: 'Tarjeta B', type: 'card', opening: 20000, limit: 800000, cutDay: 27, dueDay: 8 },
    { id: 'tc', name: 'Tarjeta C', type: 'card', opening: 650000, limit: 3000000, cutDay: 19, dueDay: 8 },
  ];
  s.schedules = [
    { id: 'semanal', kind: 'income', name: 'Semana', amount: 80000, account: 'efectivo', rule: { type: 'weekly', weekday: 6 } },
    { id: 'beca', kind: 'income', name: 'Beca', amount: 150000, account: 'banco', rule: { type: 'monthly', day: 10 } },
    { id: 'fijo', kind: 'fixed', name: 'Suscripción', amount: 100000, account: 'ta', rule: { type: 'monthly', day: 15 } },
    { id: 'sueldo', kind: 'income', name: 'Sueldo', amount: 1000000, account: 'banco', rule: { type: 'monthly', day: 'last' }, start: '2026-10-31' },
  ];
  s.statements = [
    { id: 's1', card: 'ta', amount: 200000, due: '2026-10-23', createdAt: '2026-09-30' },
  ];
  return s;
}

let n = 0;
export const tx = (o) => ({ id: `t${++n}`, src: 'manual', ...o });
