// Forma de los datos guardados y migraciones entre versiones.
export const SCHEMA = 2;

export function emptyState(today) {
  return {
    schema: SCHEMA,
    createdAt: today,
    settings: {
      openingDate: today,
      firstStart: today,
      firstEnd: today,
      liquidityFloor: 30000,
      overdueGraceDays: 2,
      transport: { rate: 0, account: null, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      fares: [{ name: 'Metro', amount: 500 }, { name: 'Metrobús', amount: 600 }],
      quickAdd: { token: '', sources: {} },
      rebases: [],
      lastBackupAt: null,
    },
    accounts: [],
    schedules: [],
    overrides: {},
    msiPlans: [],
    statements: [],
    tx: [],
    processedExtIds: [],
    dismissed: {},
  };
}

const MIGRATIONS = {
  // v2: los saldos capturados al empezar eran "lo que llevas antes del corte": no se pueden pagar hasta que corta.
  2: (s) => ({
    ...s,
    statements: (s.statements || []).map((st) => (!st.payFrom && st.createdAt === s.settings?.openingDate ? { ...st, beforeCut: true } : st)),
  }),
};

export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('Datos inválidos');
  if ((data.schema || 0) > SCHEMA) throw new Error('Estos datos son de una versión más nueva de la app. Actualízala primero.');
  let s = data;
  for (let v = (s.schema || 1) + 1; v <= SCHEMA; v++) s = { ...MIGRATIONS[v](s), schema: v };
  const base = emptyState(s.createdAt || s.settings?.openingDate || '2026-01-01');
  return { ...base, ...s, settings: { ...base.settings, ...s.settings } };
}
