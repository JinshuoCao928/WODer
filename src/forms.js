// Pure conversion between the Log form's raw values and a workout block (spec §3–§5). No DOM.
import { FORMATS } from './library.js';
import { BENCHMARKS } from './benchmarks.js';
import { normalizeMovementName, convertLoad, resultText } from './core.js';

export const FORM_FORMATS = [...FORMATS, { name: 'Other', description: 'Anything else', layout: 'other' }];
export const layoutOf = (format) => FORM_FORMATS.find((f) => f.name === format)?.layout ?? 'other';

// Which inputs each layout shows. PR inputs depend on the PR kind.
export const BLOCK_FIELDS = {
  strength: [], amrap: ['minutes', 'scoreRounds', 'scoreReps'], fortime: ['rounds', 'minutes', 'scoreTime'],
  intervals: ['every', 'minutes', 'scoreRounds', 'scoreReps'], pr: ['prKind'], other: [],
};
export const MOVE_FIELDS = {
  strength: ['sets', 'reps', 'load'], amrap: ['reps', 'load', 'distance'], fortime: ['reps', 'load', 'distance'],
  intervals: ['reps', 'load', 'distance'], other: ['reps', 'load', 'distance'],
  heaviest: ['reps', 'load'], fastest: ['distance', 'time'], mostReps: ['reps'], farthest: ['distance'],
};
export const blockFieldsFor = (layout, prKind) => (layout === 'pr' && prKind === 'farthest' ? ['prKind', 'minutes'] : BLOCK_FIELDS[layout]);
export const moveFieldsFor = (layout, prKind) => MOVE_FIELDS[layout === 'pr' ? prKind || 'heaviest' : layout];

const num = (s) => (s === '' || s == null ? null : Number.isFinite(Number(s)) ? Number(s) : null);
const reps = (s) => { const t = String(s ?? '').trim(); return t === '' ? null : /^\d+$/.test(t) ? Number(t) : t; };
const text = (s) => String(s ?? '').trim() || null;
const time = (min, sec) => (min === '' && sec === '') || (min == null && sec == null) ? null
  : `${Number(min || 0)}:${String(Number(sec || 0)).padStart(2, '0')}`;
const splitTime = (t) => {
  if (!t) return ['', ''];
  const p = t.split(':').map(Number);
  return p.length === 3 ? [String(p[0] * 60 + p[1]), String(p[2])] : [String(p[0]), String(p[1])];
};
const str = (v) => (v == null ? '' : String(v));

export function blockFromForm(v, unit) {
  const type = layoutOf(v.format);
  const prKind = type === 'pr' ? v.prKind || 'heaviest' : null;
  const bf = blockFieldsFor(type, prKind);
  const mf = moveFieldsFor(type, prKind);
  let movements = v.movements.filter((m) => String(m.name ?? '').trim()).map((m) => {
    const load = mf.includes('load') ? num(m.load) : null;
    return {
      name: normalizeMovementName(m.name),
      sets: mf.includes('sets') ? num(m.sets) : null,
      reps: mf.includes('reps') ? reps(m.reps) : null,
      load, unit: load != null ? m.unit || unit : null,
      distance: mf.includes('distance') ? text(m.distance) : null,
      time: mf.includes('time') ? time(m.timeMin, m.timeSec) : null,
      note: text(m.note),
    };
  });
  if (type === 'pr') movements = movements.slice(0, 1);
  const pick = (k, f) => (bf.includes(k) ? f : null);
  const block = {
    name: v.benchmark || v.format, type, format: v.format, benchmark: v.benchmark || null,
    minutes: pick('minutes', num(v.minutes)), every: pick('every', num(v.every)), rounds: pick('rounds', num(v.rounds)),
    scoreRounds: pick('scoreRounds', num(v.scoreRounds)), scoreReps: pick('scoreReps', num(v.scoreReps)),
    scoreTime: pick('scoreTime', time(v.scoreMin, v.scoreSec)),
    prKind, scaled: !!v.scaled, note: text(v.note), movements, result: null,
  };
  block.result = resultText(block);
  return { date: v.noDate ? null : v.date || null, block };
}

// Inverse of blockFromForm. Pass `unit` to show loads in the profile unit.
export function formFromBlock(block, date, unit) {
  const type = block.type ?? 'other';
  const format = FORM_FORMATS.some((f) => f.name === block.format) ? block.format
    : type === 'other' ? 'Other' : FORM_FORMATS.find((f) => f.layout === type).name;
  // An unstructured result (v1 records, free-text scores) opens in Note so nothing is lost.
  const looseResult = resultText({ ...block, type, scaled: false }) == null ? block.result : null;
  const [scoreMin, scoreSec] = splitTime(block.scoreTime);
  return {
    date: date ?? '', noDate: date == null, format, benchmark: block.benchmark ?? '', scaled: !!block.scaled,
    minutes: str(block.minutes), every: str(block.every), rounds: str(block.rounds),
    scoreRounds: str(block.scoreRounds), scoreReps: str(block.scoreReps), scoreMin, scoreSec,
    prKind: block.prKind ?? '', note: [block.note, looseResult].filter(Boolean).join(' — '),
    movements: (block.movements ?? []).map((m) => {
      const load = unit && m.load != null ? convertLoad(m.load, m.unit ?? null, unit) : m.load;
      const [timeMin, timeSec] = splitTime(m.time);
      return { name: m.name, sets: str(m.sets), reps: str(m.reps), load: str(load), unit: load != null ? (unit || m.unit || '') : '',
        distance: m.distance ?? '', timeMin, timeSec, note: m.note ?? '' };
    }),
  };
}

export function benchmarkBlock(name, unit) {
  const b = BENCHMARKS.find((x) => x.name === name);
  if (!b) return null;
  const block = {
    name: b.name, type: layoutOf(b.format), format: b.format, benchmark: b.name,
    minutes: b.minutes ?? null, every: b.every ?? null, rounds: b.rounds ?? null,
    scoreRounds: null, scoreReps: null, scoreTime: null, prKind: null, scaled: false, note: b.note ?? null,
    movements: b.movements.map((m) => ({ name: normalizeMovementName(m.name), sets: null, reps: m.reps ?? null,
      load: m.load ? m.load[unit] : null, unit: m.load ? unit : null, distance: m.distance ?? null, time: null, note: null })),
    result: null,
  };
  return block;
}

// Scaled = a movement swapped or a load different from Rx (compared in the profile unit).
export function isScaledFromRx(block, benchmarkName, unit) {
  const rx = benchmarkBlock(benchmarkName, unit);
  if (!rx) return false;
  if (rx.movements.length !== block.movements.length) return true;
  return rx.movements.some((r, i) => {
    const m = block.movements[i];
    return normalizeMovementName(m.name) !== r.name || convertLoad(m.load ?? null, m.unit ?? null, unit) !== r.load;
  });
}

export function weightOptions(unit, extra = []) {
  const [step, max] = unit === 'kg' ? [2.5, 300] : [5, 660];
  const out = [];
  for (let w = step; w <= max + 1e-9; w += step) out.push(Math.round(w * 10) / 10);
  return [...new Set([...out, ...extra.filter(Number.isFinite)])].sort((a, b) => a - b);
}
