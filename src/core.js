// Pure logic for WODCRAFT: no DOM, no runtime capabilities. Tested with `npm test`.
import { MOVEMENTS } from './library.js';
import { WARMUPS } from './warmups.js';

export const MOVEMENT_ALIASES = {
  'fs': 'Front Squat',
  'bs': 'Back Squat',
  'ohs': 'Overhead Squat',
  'dl': 'Conventional Deadlift',
  'c&j': 'Clean and Jerk',
  't2b': 'Toes-to-Bar',
  'ttb': 'Toes-to-Bar',
  'hspu': 'Kipping Handstand Push-Up',
  'du': 'Double-Under',
  'pu': 'Pull-Up',
};

const LB_PER_KG = 2.20462;
const LIBRARY_NAMES = new Map(MOVEMENTS.map((m) => [m.name.toLowerCase(), m.name]));
const SMALL_WORDS = new Set(['and', 'to', 'of', 'the', 'with', 'in', 'on', 'over']);

const titleCase = (s) => s.replace(/[^\s-]+/g, (w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));

// Library spelling when the name is a library movement (or an alias), else Title Case.
export function normalizeMovementName(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const singular = s.replace(/([^s])s$/, '$1');
  for (const k of [s, singular]) {
    const hit = MOVEMENT_ALIASES[k] ?? LIBRARY_NAMES.get(k);
    if (hit) return hit;
  }
  return titleCase(singular);
}

export function convertLoad(load, from, to) {
  if (load == null) return null;
  if (!from || from === to) return load;
  const raw = from === 'kg' ? load * LB_PER_KG : load / LB_PER_KG;
  return Math.round(raw * 2) / 2;
}

// Dated sessions newest first, then undated ones (newest createdAt first).
export const byNewest = (a, b) => {
  if (a.date !== b.date) {
    if (a.date == null) return 1;
    if (b.date == null) return -1;
    return a.date < b.date ? 1 : -1;
  }
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
};

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
    .filter((s) => s.date != null && s.date >= from && s.date <= today)
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

function checkBlocks(blocks, keepResult, defaultUnit = null) {
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
      if (!isStrOrNull(m.note) || !isStrOrNull(m.distance)) return { error: `bad text in ${m.name}` };
      if (!isTimeOrNull(m.time)) return { error: `bad time in ${m.name}` };
      movements.push({ name: normalizeMovementName(m.name), sets: m.sets ?? null, reps: m.reps ?? null,
        load: m.load ?? null, unit: m.unit ?? (m.load != null ? defaultUnit : null),
        distance: m.distance ?? null, time: m.time ?? null, note: m.note ?? null });
    }
    const type = b.type ?? 'other';
    if (!LAYOUTS.includes(type)) return { error: `bad type ${type}` };
    if (!(b.prKind == null || PR_KINDS.includes(b.prKind))) return { error: `bad prKind ${b.prKind}` };
    if (type === 'pr' && movements.length !== 1) return { error: 'a PR has exactly one movement' };
    for (const k of ['minutes', 'every', 'rounds', 'scoreRounds', 'scoreReps']) if (!isNumOrNull(b[k])) return { error: `bad ${k}` };
    if (!isTimeOrNull(b.scoreTime)) return { error: 'bad scoreTime' };
    if (!isStrOrNull(b.benchmark)) return { error: 'bad benchmark' };
    // versions/stimulus are display-only: normalize instead of rejecting the whole workout.
    const asLines = (v) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null);
    const rx = asLines(b.versions?.rx);
    const versions = rx?.length ? { rx, intermediate: asLines(b.versions.intermediate), beginner: asLines(b.versions.beginner) } : null;
    const stimulus = typeof b.stimulus === 'string' ? (b.stimulus.trim() ? [b.stimulus] : null) : asLines(b.stimulus);
    const block = { name: b.name, type, format: typeof b.format === 'string' ? b.format : '',
      benchmark: b.benchmark ?? null, minutes: b.minutes ?? null, every: b.every ?? null, rounds: b.rounds ?? null,
      scoreRounds: b.scoreRounds ?? null, scoreReps: b.scoreReps ?? null, scoreTime: b.scoreTime ?? null,
      prKind: type === 'pr' ? b.prKind ?? null : null, scaled: b.scaled === true,
      note: typeof b.note === 'string' && b.note.trim() ? b.note : null,
      versions, stimulus, movements };
    block.result = resultText(block) ?? (keepResult && typeof b.result === 'string' ? b.result : null);
    out.push(block);
  }
  return { blocks: out };
}

export const LAYOUTS = ['strength', 'amrap', 'fortime', 'intervals', 'pr', 'other'];
export const PR_KINDS = ['heaviest', 'fastest', 'mostReps', 'farthest'];
const TIME_RE = /^\d{1,3}:\d{2}(:\d{2})?$/;
const isTimeOrNull = (v) => v == null || (typeof v === 'string' && TIME_RE.test(v));

// Display/prompt text for a block's score (spec §5). null when there is nothing to show.
export function resultText(b) {
  const m = b.movements?.[0] ?? {};
  let text = null;
  if (b.type === 'amrap' && b.scoreRounds != null) text = `${b.scoreRounds} rounds` + (b.scoreReps ? ` + ${b.scoreReps} reps` : '');
  else if (b.type === 'fortime') text = b.scoreTime ?? (b.minutes != null ? `(cap ${b.minutes})` : null);
  else if (b.type === 'intervals') text = b.scoreRounds != null ? `${b.scoreRounds} rounds` : b.scoreReps != null ? `${b.scoreReps} reps` : null;
  else if (b.type === 'pr') {
    if (b.prKind === 'heaviest' && m.load != null) text = `${m.reps ?? 1}RM ${m.load}${m.unit ?? ''}`;
    else if (b.prKind === 'fastest' && m.time) text = `${m.distance ?? ''} in ${m.time}`.trim();
    else if (b.prKind === 'mostReps' && m.reps != null) text = `${m.reps} reps`;
    else if (b.prKind === 'farthest' && m.distance) text = m.distance + (b.minutes != null ? ` in ${b.minutes} min` : '');
  }
  return text && b.scaled ? `${text} (Scaled)` : text;
}

const focusOf = (f) => (Array.isArray(f) ? f.filter((x) => typeof x === 'string') : []);

export function validateSession(obj, defaultUnit = null) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not an object' };
  if (obj.date != null && (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date))) return { ok: false, error: 'date must be YYYY-MM-DD or null' };
  if (!STYLES.includes(obj.style)) return { ok: false, error: 'bad style' };
  const { blocks, error } = checkBlocks(obj.blocks, true, defaultUnit);
  if (error) return { ok: false, error };
  if (!isNumOrNull(obj.rpe)) return { ok: false, error: 'bad rpe' };
  return { ok: true, value: {
    date: obj.date ?? null, source: obj.source === 'generated' ? 'generated' : 'logged', style: obj.style,
    title: typeof obj.title === 'string' ? obj.title : '', focus: focusOf(obj.focus), blocks,
    rpe: obj.rpe ?? null, notes: typeof obj.notes === 'string' ? obj.notes : null,
  } };
}

// Parse output is {"sessions": [...]}: a log can cover several days (e.g. a new athlete pasting past weeks).
export function validateSessionList(obj, defaultUnit) {
  if (!Array.isArray(obj?.sessions) || obj.sessions.length === 0) return { ok: false, error: 'sessions must be a non-empty array' };
  const value = [];
  for (const s of obj.sessions) {
    const r = validateSession(s, defaultUnit);
    if (!r.ok) return r;
    value.push(r.value);
  }
  return { ok: true, value };
}

export function validateWorkout(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not an object' };
  if (typeof obj.title !== 'string' || typeof obj.rationale !== 'string') return { ok: false, error: 'title and rationale required' };
  if (!STYLES.includes(obj.style)) return { ok: false, error: 'bad style' };
  const { blocks, error } = checkBlocks(obj.blocks, false);
  if (error) return { ok: false, error };
  return { ok: true, value: { title: obj.title, rationale: obj.rationale, style: obj.style, focus: focusOf(obj.focus), blocks } };
}

export const STRICT_SUFFIX = 'Your previous answer was not valid. Reply with ONLY the JSON object, no prose, no code fences.';

export const WORKOUT_RULES = [
  "Respect the athlete's stated soreness, focus, exclusions, time and equipment.",
  'Do not heavily load a muscle group trained in the last 48 hours.',
  'Base loads on the history: working sets about 70-85% of a recent best; a small increase only if the last session was noted as easy. Never exceed 5% above the recorded best.',
  'Never invent history. If a movement has no history, write "estimate" in its note.',
  'If the athlete mentions pain or injury (not normal soreness), choose a conservative alternative and suggest seeing a professional in the rationale.',
  'In each movement note referencing history, cite it like "last: 65kg x5 on 2026-11-02".',
  'Scaled results show the load the athlete actually used; base suggestions on that, not on Rx.',
  'Write everything in English.',
  'Write distances in the units given under "Distances".',
  'Every workout has a block named "Warm-up" first, then one or two main blocks, then a block named "Cool-down".',
  'The warm-up lasts 8-15 minutes and goes in this order: general warm-up, dynamic mobility, activation, movement preparation. Pick its movements and doses from the warm-up library to match the main work.',
  'Before cardio or engine work, include leg swings and hip circles, then easy machine work or a light jog.',
  "Before leg-heavy work, include air squats, lunges and the World's Greatest Stretch.",
  'Before shoulder, press or pull-heavy work, include arm swings, inchworms, shoulder pass-throughs and scapular push-ups or pull-ups.',
  'Before barbell lifts, include an empty-bar or PVC version of the main lift.',
  'If time is short, shorten the main work, never the warm-up.',
  'The cool-down lists stretches or easy movements for the muscles just trained.',
  "Start from today's CrossFit.com workout: keep it, adapt it or replace it based on the athlete's history, recovery, stated feeling, focus, time and equipment, and say which in the rationale. If there is none, design freely and say so.",
  'Each main block gives versions.rx, versions.intermediate and versions.beginner as CrossFit-style lines: a format line ("For time:", "AMRAP 12 min:", ...), then one movement per line with loads as (female/male <unit>), e.g. "21 hang power cleans (95/135 lb)", in the athlete\'s weight unit.',
  'Each main block gives "stimulus": 2-4 short bullets on time domain, pacing, set breaks and intent.',
  "A main block's \"movements\" are the athlete's own version: the option for their level (beginner -> beginner, intermediate -> intermediate, advanced -> rx), with loads from their history.",
  "The rationale is 3-4 sentences: how it relates to today's CrossFit.com workout, what the athlete and CrossFit.com trained this week, and the athlete's stated feeling, focus and limits.",
];

// Mark done: the log parser gets only the athlete's own movements, not the RX/Intermediate/Beginner text.
export const workoutForLog = (w) => ({ ...w, blocks: w.blocks.map(({ versions, stimulus, ...b }) => b) });

// Links from the CrossFit list are rendered as <a href>; only crossfit.com https links are allowed.
export const safeUrl = (u) => (/^https:\/\/(www\.)?crossfit\.com\//.test(u ?? '') ? u : null);

// Today's doc, the 7 days before it, and the newest doc that isn't in the future (tomorrow's WOD can be posted early).
export function pickCrossfit(list, today) {
  const upToToday = list.filter((d) => d.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { today: upToToday.find((d) => d.date === today) ?? null, past: upToToday.filter((d) => d.date < today).slice(0, 7),
    newest: upToToday[0]?.date ?? null };
}

const cfLines = (lines) => (lines?.length ? lines.join(' / ') : "Same as Rx'd");
// One compact line per CrossFit.com day (past 7 days section).
export const crossfitText = (d) => (d.rest ? `${d.date}: rest day` : `${d.date}${d.name ? ' ' + d.name : ''}: ${cfLines(d.rx)}`);

const crossfitSection = ({ today, past } = {}) => `${today && !today.rest
  ? `CrossFit.com today: ${crossfitText(today)}\nIntermediate: ${cfLines(today.intermediate)}\nBeginner: ${cfLines(today.beginner)}\nStimulus: ${today.stimulus || '-'}`
  : today?.rest ? 'CrossFit.com today: rest day. No CrossFit.com workout today.' : 'No CrossFit.com workout today.'}
CrossFit.com past 7 days:
${past?.length ? past.map(crossfitText).join('\n') : '(none loaded)'}`;

const WARMUP_LIBRARY = 'Warm-up library:\n' + WARMUPS.map((c) => `${c.category}: ` + c.items.map(([n, d]) => `${n} (${d})`).join('; ')).join('\n');

const PREF_LINES = [['feel', 'How the athlete feels'], ['focus', 'Focus'], ['time', 'Time available'], ['equipment', 'Equipment'],
  ['intensity', 'Intensity'], ['avoid', 'Avoid / limitations'], ['extra', 'Anything else']];

// Today page boxes -> one labelled line per filled box.
export function describePrefs(prefs = {}) {
  const lines = PREF_LINES.flatMap(([k, label]) => {
    const v = prefs[k];
    const text = Array.isArray(v) ? v.join(', ') : String(v ?? '').trim();
    if (!text) return [];
    return [`${label}: ${text}${k === 'time' && /^\d+$/.test(text) ? ' min' : ''}`];
  });
  return lines.length ? lines.join('\n') : '(nothing specific: choose a sensible session for the athlete)';
}

const settingsSection = ({ distance }) =>
  `Distances: ${distance === 'imperial' ? 'miles, feet and yards' : 'meters and kilometers'}`;

const MOVEMENT_TEMPLATE = '{"name": "Pendlay row", "sets": 5, "reps": 5, "load": 70, "unit": "kg", "note": "last: 65kg x5 on 2026-11-02"}';
const BLOCKS_TEMPLATE = `[{"name": "Strength", "format": "5x5", "movements": [${MOVEMENT_TEMPLATE}], "result": null}]`;
const STYLE_ENUM = '"wod" | "strength" | "conditioning" | "mobility" | "other"';
const FIELD_NOTES = `Field rules: sets, load and rpe are numbers or null; reps is a number, a string like "21-15-9" or "max", or null; unit is "kg", "lb" or null (null for bodyweight); style is one of ${STYLE_ENUM}.`;
const PARSE_FIELD_NOTES = `Block fields: "type" is one of ${JSON.stringify(LAYOUTS)} (strength = sets x reps at a load; amrap; fortime = for time / rounds for time / chipper / ladders; intervals = EMOM, E2MOM, Tabata, Death By; pr = a personal record; other). "format" is the workout's own name for its format (e.g. "AMRAP", "RFT", "E2MOM", "5x5"). "benchmark" is the benchmark name (Fran, Cindy, ...) or null. amrap: "minutes", "scoreRounds", "scoreReps". fortime: "rounds", "minutes" (time cap), "scoreTime" as "m:ss" or "h:mm:ss". intervals: "every" (minutes), "minutes" (total), "scoreRounds" or "scoreReps". pr: "prKind" is one of ${JSON.stringify(PR_KINDS)} and the block has exactly one movement (heaviest: reps = rep max + load; fastest: movement "distance" + "time" as "m:ss"; mostReps: reps; farthest: movement "distance" like "42 cal" + block "minutes"). Omit fields you don't know.`;
const PARSE_TEMPLATE = `{"sessions": [
 {"date": "2026-11-03", "source": "logged", "style": "wod", "title": "Cindy", "focus": ["full body"], "rpe": null, "notes": null,
  "blocks": [{"name": "Cindy", "type": "amrap", "format": "AMRAP", "benchmark": "Cindy", "minutes": 20, "scoreRounds": 18, "scoreReps": 4, "scaled": false,
   "movements": [{"name": "Pull-Up", "reps": 5}, {"name": "Push-Up", "reps": 10}, {"name": "Air Squat", "reps": 15}]}]},
 {"date": null, "source": "logged", "style": "wod", "title": "Fran", "focus": ["full body"], "rpe": null, "notes": null,
  "blocks": [{"name": "Fran", "type": "fortime", "format": "For Time", "benchmark": "Fran", "scoreTime": "4:32", "scaled": true,
   "movements": [{"name": "Thruster", "reps": "21-15-9", "load": 65, "unit": "lb"}, {"name": "Pull-Up", "reps": "21-15-9"}]}]},
 {"date": "2026-11-05", "source": "logged", "style": "strength", "title": "Back Squat 3RM", "focus": ["legs"], "rpe": null, "notes": null,
  "blocks": [{"name": "Back Squat 3RM", "type": "pr", "format": "Max Effort", "prKind": "heaviest",
   "movements": [{"name": "Back Squat", "reps": 3, "load": 140, "unit": "kg"}]}]}
]}`;

const MAIN_TEMPLATE = `{"name": "Main", "type": "fortime", "format": "For Time", "versions": {"rx": ["For time:", "21 box jumps (24/30 in)", "21 hang power cleans (95/135 lb)"], "intermediate": ["For time:", "21 box jumps (20/24 in)", "21 hang power cleans (75/105 lb)"], "beginner": ["For time:", "15 step-ups (20/24 in)", "15 hang power cleans (35/45 lb)"]}, "stimulus": ["18:00-23:00", "Cleans in 1:30 or less per set"], "movements": [${MOVEMENT_TEMPLATE}], "result": null}`;
const WORKOUT_TEMPLATE = `{"title": "...", "rationale": "3-4 sentences: why this workout", "style": ${STYLE_ENUM}, "focus": ["back"], "blocks": [{"name": "Warm-up", "format": "10 min", "movements": [${MOVEMENT_TEMPLATE}], "result": null}, ${MAIN_TEMPLATE}, {"name": "Cool-down", "format": "5 min", "movements": [${MOVEMENT_TEMPLATE}], "result": null}]}`;

const historySection = ({ profile, recent, summary, today, records, crossfit }) =>
  `Today: ${today}
Athlete profile: ${JSON.stringify(profile ?? null)}
Athlete level: ${profile?.level ?? 'intermediate'}
${crossfitSection(crossfit)}
Sessions from the last 14 days (newest first): ${JSON.stringify(recent ?? [])}
Per-movement latest and best (in the athlete's unit): ${JSON.stringify(summary ?? {})}
Personal records (any date):
${records?.length ? records.join('\n') : '(none)'}`;

const rulesSection = () => 'Rules:\n' + WORKOUT_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n') + '\n\n' + WARMUP_LIBRARY;

export function buildParsePrompt({ text, today, unit, knownMovements = [] }) {
  return `You convert a gym-goer's free-text workout log into structured JSON.
Today: ${today}. Preferred unit: ${unit}.
Known movement names (reuse these exact names when they match): ${JSON.stringify(knownMovements)}

Log text:
"""
${text}
"""

Rules:
- Resolve relative dates such as "yesterday" against today.
- If the text gives no date and none can be inferred, set date to null. Never guess a date.
- Expand abbreviations (e.g. FS = Front squat). One movement entry per distinct movement and load.
- If no unit is written for a load, use ${unit}.
- The text may cover one day or many. One entry per workout (a strength piece and a metcon are two entries). Oldest first, undated last.
- Set "scaled": true when the text says scaled, or a benchmark was done lighter than Rx or with a substituted movement.
- Set "source" to "logged". Put anything else noteworthy (how it felt, scaling) in "notes" or the movement "note".
- ${FIELD_NOTES}
- ${PARSE_FIELD_NOTES}

Output template (three example entries):
${PARSE_TEMPLATE}
Reply with ONLY the JSON object.`;
}

export function buildGeneratePrompt({ prefs, ...ctx }) {
  return `You are an experienced strength and conditioning coach designing today's single workout for one athlete.
What the athlete told you today:
${describePrefs(prefs)}
${settingsSection(ctx)}
${historySection(ctx)}

${rulesSection()}
${FIELD_NOTES}

Output template:
${WORKOUT_TEMPLATE}
Reply with ONLY the JSON object.`;
}

export function buildRevisePrompt({ workout, change, ...ctx }) {
  return `You are an experienced strength and conditioning coach revising today's workout for one athlete.
Current workout: ${JSON.stringify(workout)}
Requested change: """${change}"""
${settingsSection(ctx)}
${historySection(ctx)}

Return the complete revised workout, not only the changed parts.
${rulesSection()}
${FIELD_NOTES}

Output template:
${WORKOUT_TEMPLATE}
Reply with ONLY the JSON object.`;
}
