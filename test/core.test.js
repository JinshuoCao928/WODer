import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovementName, convertLoad, buildMovementSummary, recentWindow } from '../src/core.js';

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
