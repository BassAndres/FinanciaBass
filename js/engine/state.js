// Forma de los datos guardados y migraciones entre versiones.
export const SCHEMA = 1;

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
  // 2: (s) => { ...; return s; },
};

export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('Datos inválidos');
  if ((data.schema || 0) > SCHEMA) throw new Error('Estos datos son de una versión más nueva de la app. Actualízala primero.');
  let s = data;
  for (let v = (s.schema || 1) + 1; v <= SCHEMA; v++) s = { ...MIGRATIONS[v](s), schema: v };
  const base = emptyState(s.createdAt || s.settings?.openingDate || '2026-01-01');
  return { ...base, ...s, settings: { ...base.settings, ...s.settings } };
}
