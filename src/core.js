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

export function extractJson(text) {
  const tries = [text];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) tries.push(fence[1]);
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a !== -1 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try { return JSON.parse(t); } catch { /* try next */ }
  }
  throw new Error('no_json');
}

export const STYLES = ['wod', 'strength', 'conditioning', 'mobility', 'other'];
const UNITS = ['kg', 'lb'];
const isNumOrNull = (v) => v == null || (typeof v === 'number' && Number.isFinite(v));
const isStrOrNull = (v) => v == null || typeof v === 'string';

function checkBlocks(blocks, keepResult) {
  if (!Array.isArray(blocks) || blocks.length === 0) return { error: 'blocks must be a non-empty array' };
  const out = [];
  for (const b of blocks) {
    if (!b || typeof b.name !== 'string' || !Array.isArray(b.movements)) return { error: 'block needs name and movements' };
    const movements = [];
    for (const m of b.movements) {
      if (!m || typeof m.name !== 'string' || !m.name.trim()) return { error: 'movement needs a name' };
      if (!isNumOrNull(m.sets) || !isNumOrNull(m.load)) return { error: `bad numbers in ${m.name}` };
      if (!(m.reps == null || typeof m.reps === 'number' || typeof m.reps === 'string')) return { error: `bad reps in ${m.name}` };
      if (!(m.unit == null || UNITS.includes(m.unit))) return { error: `bad unit in ${m.name}` };
      if (!isStrOrNull(m.note)) return { error: `bad note in ${m.name}` };
      movements.push({ name: normalizeMovementName(m.name), sets: m.sets ?? null, reps: m.reps ?? null,
        load: m.load ?? null, unit: m.unit ?? null, note: m.note ?? null });
    }
    out.push({ name: b.name, format: typeof b.format === 'string' ? b.format : '', movements,
      result: keepResult && typeof b.result === 'string' ? b.result : null });
  }
  return { blocks: out };
}

const focusOf = (f) => (Array.isArray(f) ? f.filter((x) => typeof x === 'string') : []);

export function validateSession(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not an object' };
  if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date)) return { ok: false, error: 'date must be YYYY-MM-DD' };
  if (!STYLES.includes(obj.style)) return { ok: false, error: 'bad style' };
  const { blocks, error } = checkBlocks(obj.blocks, true);
  if (error) return { ok: false, error };
  if (!isNumOrNull(obj.rpe)) return { ok: false, error: 'bad rpe' };
  return { ok: true, value: {
    date: obj.date, source: obj.source === 'generated' ? 'generated' : 'logged', style: obj.style,
    title: typeof obj.title === 'string' ? obj.title : '', focus: focusOf(obj.focus), blocks,
    rpe: obj.rpe ?? null, notes: typeof obj.notes === 'string' ? obj.notes : null,
  } };
}

export function validateWorkout(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not an object' };
  if (typeof obj.title !== 'string' || typeof obj.rationale !== 'string') return { ok: false, error: 'title and rationale required' };
  if (!STYLES.includes(obj.style)) return { ok: false, error: 'bad style' };
  const { blocks, error } = checkBlocks(obj.blocks, false);
  if (error) return { ok: false, error };
  return { ok: true, value: { title: obj.title, rationale: obj.rationale, style: obj.style, focus: focusOf(obj.focus), blocks } };
}
