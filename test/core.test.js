import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovementName, convertLoad, buildMovementSummary, recentWindow, extractJson, validateSession, validateSessionList, validateWorkout, resultText, byNewest, buildParsePrompt, buildGeneratePrompt, buildRevisePrompt, STRICT_SUFFIX, WORKOUT_RULES, describePrefs } from '../src/core.js';

test('name variants merge', () => {
  for (const n of ['Front Squats', 'front squat', '  FRONT   squat ', 'FS'])
    assert.equal(normalizeMovementName(n), 'Front Squat');
  assert.equal(normalizeMovementName('Pull-ups'), 'Pull-Up');
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
  assert.deepEqual(Object.keys(s), ['Front Squat']);
  assert.equal(s['Front Squat'].latest.date, '2026-11-05');
  assert.equal(s['Front Squat'].latest.load, 102);
  assert.deepEqual(s['Front Squat'].best, { date: '2026-11-05', load: 102, unit: 'kg' });
});

test('summary skips null loads for best', () => {
  const s = buildMovementSummary([S('2026-11-01', [{ name: 'Pull-ups', sets: null, reps: 'max', load: null, unit: null, note: null }])], 'kg');
  assert.equal(s['Pull-Up'].best, null);
  assert.equal(s['Pull-Up'].latest.reps, 'max');
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

const RULES = [
  "Respect the athlete's stated soreness, focus, exclusions, time and equipment.",
  'Do not heavily load a muscle group trained in the last 48 hours.',
  'Base loads on the history: working sets about 70-85% of a recent best; a small increase only if the last session was noted as easy. Never exceed 5% above the recorded best.',
  'Never invent history. If a movement has no history, write "estimate" in its note.',
  'If the athlete mentions pain or injury (not normal soreness), choose a conservative alternative and suggest seeing a professional in the rationale.',
  'In each movement note referencing history, cite it like "last: 65kg x5 on 2026-11-02".',
  'Scaled results show the load the athlete actually used; base suggestions on that, not on Rx.',
];
const ctx = { profile: { unit: 'kg', level: 'intermediate', about: 'BS 120kg' },
  recent: [{ date: '2026-11-06', movements: [{ name: 'Front squat' }] }],
  summary: { 'Front squat': { latest: { load: 100 }, best: { load: 105 } } }, today: '2026-11-07' };

test('generate prompt carries inputs and all rules', () => {
  const p = buildGeneratePrompt({ prefs: { feel: 'legs sore', focus: ['Back'] }, ...ctx });
  for (const s of ['legs sore', 'Focus: Back', '2026-11-07', JSON.stringify(ctx.summary), 'BS 120kg', 'Reply with ONLY the JSON object.']) assert.ok(p.includes(s), s);
  for (const r of RULES) assert.ok(p.includes(r), r);
  assert.deepEqual(RULES.every((r) => WORKOUT_RULES.includes(r)), true);
});

test('revise prompt carries workout, change and rules', () => {
  const workout = { title: 'Back day', blocks: [] };
  const p = buildRevisePrompt({ workout, change: 'swap pull-ups, grip is shot', ...ctx });
  for (const s of [JSON.stringify(workout), 'swap pull-ups, grip is shot', JSON.stringify(ctx.summary)]) assert.ok(p.includes(s), s);
  for (const r of RULES) assert.ok(p.includes(r), r);
});

test('parse prompt carries text, date and known names', () => {
  const p = buildParsePrompt({ text: 'FS 5x3 @100 yesterday', today: '2026-11-07', unit: 'kg', knownMovements: ['Front squat', 'Pendlay row'] });
  for (const s of ['FS 5x3 @100 yesterday', '2026-11-07', 'Front squat', 'Pendlay row', '"logged"', 'Reply with ONLY the JSON object.']) assert.ok(p.includes(s), s);
  assert.match(STRICT_SUFFIX, /ONLY the JSON object/);
});

test('validateSessionList accepts several days and fills a missing unit', () => {
  const r = validateSessionList({ sessions: [
    goodSession({ date: '2026-11-05', blocks: [{ name: 'S', movements: [{ name: 'FS', sets: 5, reps: 3, load: 100, unit: null }] }] }),
    goodSession({ date: '2026-11-06' }),
  ] }, 'kg');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.map((s) => s.date), ['2026-11-05', '2026-11-06']);
  assert.equal(r.value[0].blocks[0].movements[0].unit, 'kg');
  assert.equal(r.value[1].blocks[0].movements[0].unit, null); // bodyweight stays unitless
});

test('validateSessionList rejects an empty or partly bad list', () => {
  assert.equal(validateSessionList({ sessions: [] }, 'kg').ok, false);
  assert.equal(validateSessionList({ sessions: [goodSession(), goodSession({ date: 'x' })] }, 'kg').ok, false);
  assert.equal(validateSessionList(goodSession(), 'kg').ok, false);
});

test('parse prompt asks for a list of sessions', () => {
  const p = buildParsePrompt({ text: 'Mon: FS 5x3. Tue: rows', today: '2026-11-07', unit: 'kg' });
  assert.ok(p.includes('{"sessions": ['));
  assert.ok(p.includes('One entry per workout (a strength piece and a metcon are two entries).'));
  assert.ok(p.includes('If the text gives no date and none can be inferred, set date to null. Never guess a date.'));
  assert.ok(p.includes('"scaled"'));
});

test('names use the library spelling, else title case', () => {
  assert.equal(normalizeMovementName('ghd sit-ups'), 'GHD Sit-Up');
  assert.equal(normalizeMovementName('wall balls'), 'Wall Ball');
  assert.equal(normalizeMovementName('wall ball shots'), 'Wall Ball Shot');
  assert.equal(normalizeMovementName('clean and jerk'), 'Clean and Jerk');
  assert.equal(normalizeMovementName('DUs'), 'Double-Under');
});

const blk = (over = {}) => ({ name: 'B', movements: [{ name: 'Thruster', reps: 21, load: 43, unit: 'kg' }], ...over });
const sess = (over = {}) => ({ date: '2026-11-05', style: 'wod', blocks: [blk()], ...over });

test('undated session validates', () => {
  const r = validateSession(sess({ date: null }));
  assert.equal(r.ok, true);
  assert.equal(r.value.date, null);
});

test('v1 block keeps its result string and becomes type other', () => {
  const r = validateSession(sess({ blocks: [{ name: 'Metcon', format: 'For Time', result: '8:12', movements: [{ name: 'Burpee', reps: 10 }] }] }));
  assert.equal(r.ok, true);
  assert.equal(r.value.blocks[0].type, 'other');
  assert.equal(r.value.blocks[0].result, '8:12');
  assert.equal(r.value.blocks[0].scaled, false);
});

test('resultText per layout', () => {
  const pr = (prKind, m, over = {}) => resultText(blk({ type: 'pr', prKind, movements: [{ name: 'Back Squat', ...m }], ...over }));
  assert.equal(resultText(blk({ type: 'amrap', scoreRounds: 7, scoreReps: 3 })), '7 rounds + 3 reps');
  assert.equal(resultText(blk({ type: 'fortime', scoreTime: '4:32' })), '4:32');
  assert.equal(resultText(blk({ type: 'fortime', minutes: 12, scoreTime: null })), '(cap 12)');
  assert.equal(resultText(blk({ type: 'intervals', scoreRounds: 12 })), '12 rounds');
  assert.equal(resultText(blk({ type: 'intervals', scoreReps: 85 })), '85 reps');
  assert.equal(pr('heaviest', { reps: 3, load: 140, unit: 'kg' }), '3RM 140kg');
  assert.equal(pr('fastest', { distance: '1000m', time: '3:35' }), '1000m in 3:35');
  assert.equal(pr('mostReps', { reps: 25 }), '25 reps');
  assert.equal(pr('farthest', { distance: '42 cal' }, { minutes: 1 }), '42 cal in 1 min');
  assert.equal(resultText(blk({ type: 'fortime', scoreTime: '4:32', scaled: true })), '4:32 (Scaled)');
  assert.equal(resultText(blk({ type: 'strength' })), null);
});

test('validateSession fills result from structured fields', () => {
  const r = validateSession(sess({ blocks: [blk({ type: 'amrap', minutes: 20, scoreRounds: 7, scoreReps: 3, result: 'stale' })] }));
  assert.equal(r.value.blocks[0].result, '7 rounds + 3 reps');
  assert.equal(r.value.blocks[0].minutes, 20);
});

test('validateSession rejects bad new fields', () => {
  assert.equal(validateSession(sess({ blocks: [blk({ type: 'fortime', scoreTime: '4.32' })] })).ok, false);
  assert.equal(validateSession(sess({ blocks: [blk({ type: 'hiit' })] })).ok, false);
  assert.equal(validateSession(sess({ blocks: [blk({ type: 'pr', prKind: 'best' })] })).ok, false);
  assert.equal(validateSession(sess({ blocks: [blk({ type: 'pr', prKind: 'heaviest', movements: [{ name: 'A' }, { name: 'B' }] })] })).ok, false);
  assert.equal(validateSession(sess({ blocks: [blk({ movements: [{ name: 'Row', time: 'fast' }] })] })).ok, false);
  assert.equal(validateSession(sess({ blocks: [blk({ type: 'fortime', scoreTime: '1:05:30' })] })).ok, true);
});

test('undated sessions: skipped in recent window, sorted last, PR counts as best', () => {
  const undatedPr = { date: null, createdAt: 9, blocks: [{ type: 'pr', prKind: 'heaviest', movements: [{ name: 'Back Squat', reps: 3, load: 140, unit: 'kg' }] }] };
  const dated = { date: '2026-11-01', createdAt: 1, blocks: [{ movements: [{ name: 'Back Squat', sets: 5, reps: 5, load: 100, unit: 'kg' }] }] };
  const later = { date: '2026-11-05', createdAt: 2, blocks: [] };
  assert.deepEqual(recentWindow([undatedPr, dated], '2026-11-07').map((s) => s.date), ['2026-11-01']);
  assert.deepEqual([undatedPr, dated, later].sort(byNewest).map((s) => s.date), ['2026-11-05', '2026-11-01', null]);
  const s = buildMovementSummary([undatedPr, dated], 'kg')['Back Squat'];
  assert.equal(s.latest.date, '2026-11-01');
  assert.equal(s.best.load, 140);
  assert.equal(s.best.date, null);
});

test('generate prompt lists personal records', () => {
  const p = buildGeneratePrompt({ prefs: {}, ...ctx, records: ['Back Squat 3RM 140kg'] });
  assert.ok(p.includes('Personal records (any date):'));
  assert.ok(p.includes('Back Squat 3RM 140kg'));
});

test('describePrefs: one labelled line per filled box, a default when empty', () => {
  assert.equal(describePrefs({ feel: '', focus: [], time: '', equipment: [], intensity: '', avoid: '', extra: '' }),
    '(nothing specific: choose a sensible session for the athlete)');
  assert.equal(describePrefs({ feel: 'legs sore', focus: ['Back', 'Arms'], time: '45', equipment: ['Barbell', 'Dumbbells'],
    intensity: 'Hard', avoid: 'no running', extra: 'outdoor' }),
    ['How the athlete feels: legs sore', 'Focus: Back, Arms', 'Time available: 45 min', 'Equipment: Barbell, Dumbbells',
      'Intensity: Hard', 'Avoid / limitations: no running', 'Anything else: outdoor'].join('\n'));
});

test('generate and revise prompts carry warm-up rules, library, language and distances', () => {
  const settings = { lang: 'zh', distance: 'imperial' };
  for (const p of [buildGeneratePrompt({ prefs: { time: '30' }, ...ctx, ...settings }),
    buildRevisePrompt({ workout: { title: 'x' }, change: 'y', ...ctx, ...settings })]) {
    for (const r of ['The warm-up lasts 8-15 minutes', 'leg swings and hip circles', "the World's Greatest Stretch",
      'arm swings, inchworms', 'empty-bar or PVC version', 'shorten the main work, never the warm-up', 'named "Cool-down"'])
      assert.ok(p.includes(r), r);
    for (const m of ['Jumping Jacks (30–50 reps)', "World's Greatest Stretch (5/side)", 'Burgener Warm-Up (1–2 rounds)', 'Pallof Press (10/side)'])
      assert.ok(p.includes(m), m);
    assert.ok(p.includes('Language: Chinese'));
    assert.ok(p.includes('Distances: miles, feet and yards'));
  }
});

test('validateWorkout keeps CrossFit-style versions and stimulus', () => {
  const main = { name: 'Main', movements: [{ name: 'Thruster', reps: 21, load: 30, unit: 'kg' }],
    versions: { rx: ['For time:', '21 thrusters (65/95 lb)'], intermediate: ['For time:', '21 thrusters (45/65 lb)'], beginner: ['For time:', '15 thrusters (25/35 lb)'] },
    stimulus: ['8-12 min', 'unbroken sets'] };
  const w = { title: 'T', rationale: 'R', style: 'wod', focus: [], blocks: [main] };
  const r = validateWorkout(w);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.blocks[0].versions, main.versions);
  assert.deepEqual(r.value.blocks[0].stimulus, main.stimulus);
  const plain = validateWorkout({ ...w, blocks: [{ name: 'Main', movements: main.movements }] });
  assert.equal(plain.value.blocks[0].versions, null);
  assert.equal(plain.value.blocks[0].stimulus, null);
  assert.equal(validateWorkout({ ...w, blocks: [{ ...main, versions: { rx: 'x' } }] }).ok, false);
});
