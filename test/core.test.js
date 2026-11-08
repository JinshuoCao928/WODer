import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovementName, convertLoad, buildMovementSummary, recentWindow, extractJson, validateSession, validateWorkout } from '../src/core.js';

test('name variants merge', () => {
  for (const n of ['Front Squats', 'front squat', '  FRONT   squat ', 'FS'])
    assert.equal(normalizeMovementName(n), 'Front squat');
  assert.equal(normalizeMovementName('Pull-ups'), 'Pull-up');
  assert.equal(normalizeMovementName('press'), 'Press'); // "ss" not singularized
});

test('convertLoad', () => {
  assert.equal(convertLoad(100, 'kg', 'lb'), 220.5);
  assert.equal(convertLoad(225, 'lb', 'kg'), 102);
  assert.equal(convertLoad(100, 'kg', 'kg'), 100);
  assert.equal(convertLoad(null, 'kg', 'lb'), null);
  assert.equal(convertLoad(50, null, 'kg'), 50);
});

const S = (date, movements, extra = {}) => ({ date, source: 'logged', style: 'strength', title: '', focus: [],
  blocks: [{ name: 'Strength', format: '5x5', movements, result: null }], rpe: null, notes: null, rawText: '', createdAt: 0, ...extra });

test('summary converts mixed units and picks best/latest', () => {
  const s = buildMovementSummary([
    S('2026-11-01', [{ name: 'Front squats', sets: 5, reps: 3, load: 100, unit: 'kg', note: null }]),
    S('2026-11-05', [{ name: 'FS', sets: 3, reps: 3, load: 225, unit: 'lb', note: null }]),
  ], 'kg');
  assert.deepEqual(Object.keys(s), ['Front squat']);
  assert.equal(s['Front squat'].latest.date, '2026-11-05');
  assert.equal(s['Front squat'].latest.load, 102);
  assert.deepEqual(s['Front squat'].best, { date: '2026-11-05', load: 102, unit: 'kg' });
});

test('summary skips null loads for best', () => {
  const s = buildMovementSummary([S('2026-11-01', [{ name: 'Pull-ups', sets: null, reps: 'max', load: null, unit: null, note: null }])], 'kg');
  assert.equal(s['Pull-up'].best, null);
  assert.equal(s['Pull-up'].latest.reps, 'max');
});

test('recentWindow boundaries', () => {
  const w = recentWindow([S('2026-10-24', []), S('2026-10-23', []), S('2026-11-08', []), S('2026-11-06', [])], '2026-11-07');
  assert.deepEqual(w.map(x => x.date), ['2026-11-06', '2026-10-24']);
});

test('extractJson handles fences and prose', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":1} enjoy'), { a: 1 });
  assert.throws(() => extractJson('nope'), /no_json/);
});

const goodSession = (over = {}) => ({ date: '2026-11-06', style: 'wod', blocks: [{ name: 'Metcon', format: 'For Time',
  movements: [{ name: 'Thrusters', reps: '21-15-9', load: null }], result: '8:12' }], ...over });

test('validateSession accepts bodyweight/string reps and fills defaults', () => {
  const r = validateSession(goodSession());
  assert.equal(r.ok, true);
  const m = r.value.blocks[0].movements[0];
  assert.equal(m.name, 'Thruster');
  assert.equal(m.sets, null);
  assert.equal(m.unit, null);
  assert.equal(m.reps, '21-15-9');
  assert.deepEqual(r.value.focus, []);
});

test('validateSession rejects bad input', () => {
  assert.equal(validateSession(goodSession({ date: 'yesterday' })).ok, false);
  assert.equal(validateSession(goodSession({ style: 'yoga' })).ok, false);
  assert.equal(validateSession(goodSession({ blocks: [] })).ok, false);
  assert.equal(validateSession(goodSession({ blocks: [{ name: 'X', movements: [{ reps: 5 }] }] })).ok, false);
  assert.equal(validateSession(goodSession({ blocks: [{ name: 'X', movements: [{ name: 'Row', load: 'heavy' }] }] })).ok, false);
  assert.equal(validateSession(null).ok, false);
});

test('validateWorkout requires rationale and nulls results', () => {
  const w = { title: 'Back day', rationale: 'Legs sore', style: 'strength', focus: ['back'],
    blocks: [{ name: 'Strength', format: '5x5', movements: [{ name: 'Pendlay row', sets: 5, reps: 5, load: 70, unit: 'kg' }], result: 'x' }] };
  const { rationale, ...noRationale } = w;
  assert.equal(validateWorkout(noRationale).ok, false);
  const r = validateWorkout(w);
  assert.equal(r.ok, true);
  assert.equal(r.value.blocks[0].result, null);
});
