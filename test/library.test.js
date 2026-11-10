import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENTS, GROUP_COUNTS, FORMATS } from '../src/library.js';

const LAYOUTS = ['strength', 'amrap', 'fortime', 'intervals', 'pr', 'other'];

test('489 unique movements', () => {
  assert.equal(MOVEMENTS.length, 489);
  assert.equal(new Set(MOVEMENTS.map((m) => m.id)).size, 489);
});

test('group counts match the PDF summary', () => {
  const counts = {};
  for (const m of MOVEMENTS) counts[m.group] = (counts[m.group] ?? 0) + 1;
  assert.deepEqual(counts, GROUP_COUNTS);
  assert.equal(GROUP_COUNTS.Barbell, 72);
  assert.equal(GROUP_COUNTS.Mobility, 26);
});

test('formats: Strength first, every layout known', () => {
  assert.equal(FORMATS.length, 18);
  assert.equal(FORMATS[0].name, 'Strength');
  for (const f of FORMATS) assert.ok(LAYOUTS.includes(f.layout), f.name);
  assert.equal(FORMATS.find((f) => f.name === 'E2MOM').layout, 'intervals');
  assert.equal(FORMATS.find((f) => f.name === 'Max Effort').layout, 'pr');
});
