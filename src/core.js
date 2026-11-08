// Pure logic for WODer: no DOM, no runtime capabilities. Tested with `npm test`.

export const MOVEMENT_ALIASES = {
  'fs': 'Front squat',
  'bs': 'Back squat',
  'ohs': 'Overhead squat',
  'dl': 'Deadlift',
  'c&j': 'Clean and jerk',
  't2b': 'Toes to bar',
  'ttb': 'Toes to bar',
  'hspu': 'Handstand push-up',
  'du': 'Double under',
  'pu': 'Pull-up',
};

const LB_PER_KG = 2.20462;

export function normalizeMovementName(name) {
  let s = String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (MOVEMENT_ALIASES[s]) return MOVEMENT_ALIASES[s];
  s = s.replace(/([^s])s$/, '$1');
  if (MOVEMENT_ALIASES[s]) return MOVEMENT_ALIASES[s];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function convertLoad(load, from, to) {
  if (load == null) return null;
  if (!from || from === to) return load;
  const raw = from === 'kg' ? load * LB_PER_KG : load / LB_PER_KG;
  return Math.round(raw * 2) / 2;
}

const byNewest = (a, b) =>
  (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0));

const movementsOf = (session) => (session.blocks ?? []).flatMap((b) => b.movements ?? []);

export function buildMovementSummary(sessions, unit) {
  const out = {};
  for (const s of [...sessions].sort(byNewest)) {
    for (const m of movementsOf(s)) {
      const name = normalizeMovementName(m.name);
      const load = convertLoad(m.load ?? null, m.unit ?? null, unit);
      const entry = (out[name] ??= {
        latest: { date: s.date, sets: m.sets ?? null, reps: m.reps ?? null, load, unit: load == null ? null : unit },
        best: null,
      });
      if (load != null && (entry.best == null || load > entry.best.load)) entry.best = { date: s.date, load, unit };
    }
  }
  return out;
}

const shiftDate = (ymd, days) => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function recentWindow(sessions, today, days = 14) {
  const from = shiftDate(today, -days);
  return sessions
    .filter((s) => s.date >= from && s.date <= today)
    .sort(byNewest)
    .map((s) => ({
      date: s.date, style: s.style, focus: s.focus ?? [],
      movements: movementsOf(s).map(({ name, sets, reps, load, unit }) => ({ name, sets, reps, load, unit })),
      rpe: s.rpe ?? null, notes: s.notes ?? null,
    }));
}
