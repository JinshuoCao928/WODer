import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARKS, BENCHMARK_EXTRA_NAMES } from '../src/benchmarks.js';
import { FORM_FORMATS, benchmarkBlock, isScaledFromRx, weightOptions, blockFromForm, formFromBlock, entriesFromSessions, mergeParsed } from '../src/forms.js';
import { MOVEMENTS } from '../src/library.js';
import { normalizeMovementName, validateSession } from '../src/core.js';

const PDF_BENCHMARKS = ['Fran', 'Grace', 'Isabel', 'Diane', 'Elizabeth', 'Karen', 'Annie', 'Helen', 'Jackie', 'Nancy', 'Cindy', 'Mary',
  'Chelsea', 'Angie', 'Barbara', 'Amanda', 'Gwen', 'Linda', 'Eva', 'Kelly', 'Murph', 'DT', 'The Chief', 'Fight Gone Bad', 'Filthy Fifty'];

test('25 benchmarks in PDF order, movement names known', () => {
  assert.deepEqual(BENCHMARKS.map((b) => b.name), PDF_BENCHMARKS);
  const lib = new Set(MOVEMENTS.map((m) => m.name));
  for (const b of BENCHMARKS) for (const m of b.movements) {
    const n = normalizeMovementName(m.name);
    assert.ok(lib.has(n) || BENCHMARK_EXTRA_NAMES.includes(n), `${b.name}: ${m.name}`);
  }
  const formatNames = FORM_FORMATS.map((f) => f.name);
  for (const b of BENCHMARKS) assert.ok(formatNames.includes(b.format), `${b.name}: ${b.format}`);
});

test('benchmarkBlock uses Rx in the profile unit', () => {
  const lb = benchmarkBlock('Fran', 'lb');
  assert.equal(lb.type, 'fortime');
  assert.equal(lb.scaled, false);
  assert.equal(lb.benchmark, 'Fran');
  assert.deepEqual([lb.movements[0].name, lb.movements[0].load, lb.movements[0].unit], ['Thruster', 95, 'lb']);
  assert.equal(benchmarkBlock('Fran', 'kg').movements[0].load, 43);
  assert.equal(validateSession({ date: null, style: 'wod', blocks: [lb] }).ok, true);
});

test('weightOptions grid plus Rx extras', () => {
  const kg = weightOptions('kg', [43]);
  for (const w of [2.5, 42.5, 43, 45, 300]) assert.ok(kg.includes(w), w);
  assert.equal(weightOptions('lb').at(-1), 660);
  assert.equal(weightOptions('lb')[0], 5);
  assert.equal(new Set(weightOptions('kg', [45])).size, weightOptions('kg', [45]).length);
});

test('isScaledFromRx', () => {
  const rx = benchmarkBlock('Fran', 'lb');
  assert.equal(isScaledFromRx(rx, 'Fran', 'lb'), false);
  const light = structuredClone(rx); light.movements[0].load = 65;
  assert.equal(isScaledFromRx(light, 'Fran', 'lb'), true);
  const jumping = structuredClone(rx); jumping.movements[1].name = 'Jumping Pull-Up';
  assert.equal(isScaledFromRx(jumping, 'Fran', 'lb'), true);
  const kgSame = benchmarkBlock('Fran', 'kg');
  assert.equal(isScaledFromRx(kgSame, 'Fran', 'kg'), false);
});

const mv = (o = {}) => ({ name: '', sets: '', reps: '', load: '', distance: '', timeMin: '', timeSec: '', ...o });
const form = (o = {}) => ({ date: '2026-11-05', noDate: false, format: 'Strength', benchmark: '', scaled: false, minutes: '', every: '',
  rounds: '', scoreRounds: '', scoreReps: '', scoreMin: '', scoreSec: '', prKind: '', note: '', movements: [mv()], ...o });

test('round trip per layout', () => {
  const examples = [
    form({ movements: [mv({ name: 'Back Squat', sets: '5', reps: '5', load: '100' })] }),
    form({ format: 'AMRAP', minutes: '20', scoreRounds: '7', scoreReps: '3', movements: [mv({ name: 'Pull-Up', reps: '5' })] }),
    form({ format: 'Chipper', rounds: '', minutes: '30', scoreMin: '24', scoreSec: '5', movements: [mv({ name: 'Burpee', reps: '50' })] }),
    form({ format: 'E2MOM', every: '2', minutes: '20', scoreRounds: '10', movements: [mv({ name: 'Power Clean', reps: '3', load: '80' })] }),
    form({ format: 'Max Effort', prKind: 'heaviest', movements: [mv({ name: 'Back Squat', reps: '3', load: '140' })] }),
    form({ format: 'Partner WOD', noDate: true, note: 'split reps', movements: [mv({ name: 'Row', distance: '2000m' })] }),
  ];
  for (const v of examples) {
    const first = blockFromForm(v, 'kg');
    assert.equal(validateSession({ date: first.date, style: 'wod', blocks: [first.block] }, 'kg').ok, true, v.format);
    assert.deepEqual(blockFromForm(formFromBlock(first.block, first.date), 'kg'), first, v.format);
  }
  const pr = blockFromForm(examples[4], 'kg').block;
  assert.deepEqual([pr.type, pr.prKind, pr.movements[0].load, pr.movements[0].unit], ['pr', 'heaviest', 140, 'kg']);
  assert.equal(blockFromForm(examples[5], 'kg').date, null);
  assert.equal(blockFromForm(examples[0], 'kg').block.movements[0].sets, 5);
});

test('times over an hour stay valid', () => {
  const { block } = blockFromForm(form({ format: 'For Time', scoreMin: '65', scoreSec: '30', movements: [mv({ name: 'Run', distance: '1 mile' })] }), 'lb');
  assert.equal(block.scoreTime, '65:30');
  assert.equal(validateSession({ date: null, style: 'wod', blocks: [block] }).ok, true);
});

test('fields from another layout do not leak', () => {
  const { block } = blockFromForm(form({ format: 'AMRAP', rounds: '5', scoreMin: '4', scoreSec: '10', prKind: 'heaviest',
    movements: [mv({ name: 'Thruster', sets: '3', reps: '9' })] }), 'lb');
  assert.equal(block.rounds, null);
  assert.equal(block.scoreTime, null);
  assert.equal(block.prKind, null);
  assert.equal(block.movements[0].sets, null);
});

test('v1 block opens with its result in Note and keeps it', () => {
  const v1 = { name: 'Metcon', format: 'For Time', result: '8:12', movements: [{ name: 'Burpee', reps: 10 }] };
  const v = formFromBlock(v1, '2026-10-01');
  assert.equal(v.format, 'For Time');
  assert.equal(v.note, '8:12');
  const back = blockFromForm(v, 'kg');
  assert.match(back.block.note, /8:12/);
  assert.equal(back.date, '2026-10-01');
});

test('C1: Mark done keeps every block when Claude splits a workout', () => {
  const s = mergeParsed([{ date: '2026-11-09', style: 'wod', blocks: [{ name: 'Strength' }] }, { date: '2026-11-09', style: 'wod', blocks: [{ name: 'Metcon' }] }]);
  assert.deepEqual(s.blocks.map((b) => b.name), ['Strength', 'Metcon']);
  assert.equal(s.date, '2026-11-09');
});

test('I1: editing a v1 strength block keeps sets', () => {
  const v1 = { name: 'Strength', format: '5x5', movements: [{ name: 'Back Squat', sets: 5, reps: 5, load: 100, unit: 'kg' }] };
  const back = blockFromForm(formFromBlock(v1, '2026-10-01', 'kg'), 'kg').block;
  assert.equal(back.movements[0].sets, 5);
  assert.equal(back.movements[0].load, 100);
});

test('I2: session notes and rpe reach the pending entries', () => {
  const entries = entriesFromSessions([{ date: null, rpe: 9, notes: 'felt awful', blocks: [{ name: 'Fran', note: 'scaled pull-ups' }, { name: 'B', note: null }] }]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].block.note, 'scaled pull-ups — felt awful');
  assert.equal(entries[1].block.note, 'felt awful');
  assert.equal(entries[0].rpe, 9);
  assert.equal(entries[0].date, null);
});

test('I3: a load in the other unit is not Scaled and survives an edit unchanged', () => {
  const grace = { ...benchmarkBlock('Grace', 'kg') };
  assert.equal(isScaledFromRx(grace, 'Grace', 'lb'), false);
  const back = blockFromForm(formFromBlock(grace, null, 'lb'), 'lb').block;
  assert.deepEqual([back.movements[0].load, back.movements[0].unit], [61, 'kg']);
  assert.equal(isScaledFromRx(back, 'Grace', 'lb'), false);
  const jackie = benchmarkBlock('Jackie', 'lb');
  assert.equal(isScaledFromRx(jackie, 'Jackie', 'kg'), false);
});
