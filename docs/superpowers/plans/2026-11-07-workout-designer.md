# WODer Workout Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A claude.ai Artifact where each signed-in athlete logs workouts in free text, keeps a private history, and gets today's workout designed by Claude from that history and their stated preferences.

**Architecture:** One published HTML page plus two ES modules. `core.js` holds pure, Node-tested logic (naming, unit conversion, history summaries, validation, prompt building). `app.js` wires the UI to the artifact runtime capabilities `db` (private per-user storage under `data/users/<id>/`), `user` (viewer id) and `sample` (Claude calls). No build step; no runtime dependencies.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), Node ≥ 20 built-in test runner (`node --test`), claude.ai Artifact runtime contract 0.2.96.

**Spec:** `docs/superpowers/specs/2026-11-07-workout-designer-design.md`

## Global Constraints

- Private storage path: `data/users/<userId>/sessions/<sessionId>` and `data/users/<userId>/profile`; `<userId>` = `await user.id()`.
- Capabilities declared at publish: `{db:{}, user:{}, sample:{}}`.
- Runtime access only via `const x = await window.claude?.use(name)`; treat `null`/missing as unavailable. Never read `window.claude.db` etc.
- Recent history window: 14 days. Recovery rule: no heavy loading of a muscle group trained within 48 hours.
- Load rules in generate/revise prompts: working sets ~70–85% of recent best; never more than 5% above recorded best; unknown history ⇒ load labeled as an estimate.
- Model tiers: parse = `quick`; generate and revise = `default`.
- DB read timeout: 10 000 ms. Schema-invalid Claude output: exactly one retry with a stricter instruction, then a user-facing error.
- kg↔lb factor: `1 kg = 2.20462 lb`; round converted loads to 0.5.
- Never seed data into the page source; handle an empty db.
- Mobile-first single column, light + dark themes via CSS tokens on `:root`.

## Review Focus

1. **Mixed units in history** (some sessions kg, some lb): summaries must compare and report loads in the profile's unit — test in Task 2.
2. **Claude wraps JSON in code fences or prose:** parsing must still succeed; truly invalid output must fail validation, not crash — test in Task 3.
3. **Bodyweight / non-numeric entries** (`load: null`, `reps: "21-15-9"` or `"max"`): validation accepts them and summaries skip null loads when computing best — tests in Tasks 2 and 3.
4. **Window boundary dates** (a session exactly 14 days ago, one 15 days ago, one dated in the future): included / excluded / excluded — test in Task 2.
5. **Name variants of one movement** ("Front Squats", "front squat", "FS"): merge into one movement in summaries — test in Task 1.

---

### Task 1: Project scaffold, movement naming, unit conversion

**Files:**
- Create: `package.json`, `src/core.js`, `test/core.test.js`, `.gitignore` (`node_modules/`)

**Interfaces:**
- Produces (exported from `src/core.js`):
  - `normalizeMovementName(name: string): string`: trims, collapses spaces, singularizes a trailing plural `s` on the last word (not on words ending in `ss`), expands aliases, Title-cases only the first letter (`"Front squat"`).
  - `MOVEMENT_ALIASES: Record<string,string>`: lowercase alias → canonical; at minimum `fs→Front squat`, `bs→Back squat`, `ohs→Overhead squat`, `dl→Deadlift`, `c&j→Clean and jerk`, `t2b→Toes to bar`, `hspu→Handstand push-up`, `du→Double under`, `pu→Pull-up`.
  - `convertLoad(load: number|null, from: 'kg'|'lb'|null, to: 'kg'|'lb'): number|null`: null passthrough; same unit or null `from` returns load unchanged; otherwise converts with 2.20462 and rounds to nearest 0.5.

- [ ] **Step 1: Install Node** (only if `node --version` fails)

Run: `brew install node && node --version`
Expected: `v20` or higher.

- [ ] **Step 2: Create `package.json`**: `{"name":"woder","private":true,"type":"module","scripts":{"test":"node --test test/"}}`

- [ ] **Step 3: Write the failing tests** in `test/core.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovementName, convertLoad } from '../src/core.js';

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
```

- [ ] **Step 4: Run** `npm test`. Expected: FAIL (module/exports missing).
- [ ] **Step 5: Implement** the three exports in `src/core.js`.
- [ ] **Step 6: Run** `npm test`. Expected: all pass.
- [ ] **Step 7: Commit**: `git add -A && git commit -m "feat: core naming and unit conversion"`

---

### Task 2: History summaries

**Files:**
- Modify: `src/core.js`, `test/core.test.js`

**Interfaces:**
- Consumes: `normalizeMovementName`, `convertLoad`.
- Produces:
  - `buildMovementSummary(sessions: Session[], unit: 'kg'|'lb'): Record<string, {latest:{date,sets,reps,load,unit}, best:{date,load,unit}|null}>`. Keys are normalized names; `latest` = movement entry from the session with the greatest `date` (ties → greater `createdAt`); `best` = max converted load across non-null loads, `null` if none; all loads converted to `unit`.
  - `recentWindow(sessions: Session[], today: 'YYYY-MM-DD', days = 14): CompactSession[]`. Includes sessions with `today - days <= date <= today`, newest first, mapped to `{date, style, focus, movements: [{name, sets, reps, load, unit}], rpe, notes}` (movements flattened across blocks).
  - `Session` = spec §5.1 shape.

- [ ] **Step 1: Write failing tests**

```js
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
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** both functions. Compare dates as `YYYY-MM-DD` strings; compute the lower bound with UTC `Date` arithmetic.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat: movement summary and recent window`

---

### Task 3: Validating Claude output

**Files:**
- Modify: `src/core.js`, `test/core.test.js`

**Interfaces:**
- Produces:
  - `extractJson(text: string): any`: parses `text`; if that fails, strips a ```` ```json ```` / ```` ``` ```` fence, else takes the substring from the first `{` to the last `}` and parses it. Throws `Error('no_json')` if nothing parses.
  - `validateSession(obj): {ok:true, value:Session} | {ok:false, error:string}`: requires `date` matching `/^\d{4}-\d{2}-\d{2}$/`, `style` in `wod|strength|conditioning|mobility|other`, `blocks` a non-empty array, each block with string `name` and array `movements`, and each movement with a non-empty string `name`. Numeric fields are `number|null`; `reps` is `number|string|null`; `unit` is `'kg'|'lb'|null`. Missing optional fields default to `null`/`[]`/`''`. Returns movement names normalized.
  - `validateWorkout(obj): {ok, value|error}`: requires string `title`, string `rationale`, `style` (same enum), `focus` string array, `blocks` (same rules as above, `result` forced to `null`).

- [ ] **Step 1: Write failing tests**
  - `extractJson('```json\n{"a":1}\n```')` → `{a:1}`; `extractJson('Here you go: {"a":1} enjoy')` → `{a:1}`; `extractJson('nope')` throws `/no_json/`.
  - `validateSession` accepts a movement `{name:'Thrusters', reps:'21-15-9', load:null}` and returns name `'Thruster'`, `sets: null`, `unit: null`.
  - `validateSession` rejects `date:'yesterday'`, `style:'yoga'`, `blocks:[]`, and a movement with no name (each `ok:false`).
  - `validateWorkout` rejects a missing `rationale`; on accept, every block's `result` is `null`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement** the three functions. Use hand-written checks; no schema library.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat: validate Claude output`

---

### Task 4: Prompt builders

**Files:**
- Modify: `src/core.js`, `test/core.test.js`

**Interfaces:**
- Consumes: Session, summary and window shapes from Tasks 2–3.
- Produces (each returns a single string, the full memoryless prompt):
  - `buildParsePrompt({text, today, unit, knownMovements: string[]}): string`
  - `buildGeneratePrompt({style, request, profile, recent, summary, today}): string`
  - `buildRevisePrompt({workout, change, profile, recent, summary, today}): string`
  - `STRICT_SUFFIX: string`: appended on the one retry: "Your previous answer was not valid. Reply with ONLY the JSON object, no prose, no code fences."

Each prompt contains: a role line; the data as labeled JSON sections; the rules; and an exact JSON output template matching `validateSession` (parse) or `validateWorkout` (generate/revise), ending with "Reply with ONLY the JSON object."

Rules that must appear verbatim in the generate and revise prompts:
1. `Respect the athlete's stated soreness, focus, exclusions, time and equipment.`
2. `Do not heavily load a muscle group trained in the last 48 hours.`
3. `Base loads on the history: working sets about 70-85% of a recent best; a small increase only if the last session was noted as easy. Never exceed 5% above the recorded best.`
4. `Never invent history. If a movement has no history, write "estimate" in its note.`
5. `If the athlete mentions pain or injury (not normal soreness), choose a conservative alternative and suggest seeing a professional in the rationale.`
6. `In each movement note referencing history, cite it like "last: 65kg x5 on 2026-11-02".`

The parse prompt must say: resolve relative dates against `today`; use names from `knownMovements` when they match; set `source` to "logged".

- [ ] **Step 1: Write failing tests**: each builder's output `includes()` its inputs (request text, today, JSON of summary) and, for generate/revise, each of the six rule strings above; the parse prompt includes `today` and every `knownMovements` entry; the revise prompt includes `JSON.stringify(workout)` and the change text.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the builders.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**: `feat: prompt builders`

---

### Task 5: Page shell, storage, History tab

**Files:**
- Create: `src/index.html` (title `WODer`, tokens, styles, markup for three tabs, `<script type="module" src="app.js">`), `src/app.js`, `src/store.js`

**Interfaces:**
- Consumes: `buildMovementSummary`, `recentWindow` from `core.js` (imported as `./core.js`).
- Produces in `src/store.js` (all async; each takes the `db` namespace and `userId`):
  - `loadSessions(db, uid): Promise<Session[]>`: `db.collection('data/users/'+uid+'/sessions')` ordered by `date` desc; rejects `Error('timeout')` after 10 000 ms.
  - `saveSession(db, uid, session): Promise<string>`: adds `createdAt: Date.now()` and returns the doc id (`crypto.randomUUID()`).
  - `deleteSession(db, uid, id): Promise<void>`
  - `loadProfile(db, uid): Promise<Profile|null>`, `saveProfile(db, uid, profile): Promise<void>`
- Produces in `src/app.js`: `state = {db, user, sample, uid, sessions, profile, workout, busy}` plus `render()`; capabilities are obtained once at startup with `window.claude?.use(...)`, and the page renders before they resolve.

Read `/private/tmp/claude-501/bundled-skills/*/artifact-capabilities/0.2.96/{claude,db,user,sample}.d.ts` before writing `store.js` and `app.js`. They are authoritative for method names (`collection`, `doc`, `orderBy`, `get`, `set`, `delete`).

- [ ] **Step 1:** Build the shell: a tab bar (Today/Log/History), a banner area, and the three panels. Profile settings (unit kg/lb, level, "about" textarea) go in a collapsible section on the History tab.
- [ ] **Step 2:** Implement `store.js` and the startup sequence. If `db`/`user` is null, show the banner "Sign in to claude.ai to save your history". If `sample` is null, hide the Generate/Parse controls and explain why. A timeout shows "Couldn't load history."
- [ ] **Step 3:** Render History newest first (date, style, title, movements with loads). Tap to expand; Delete removes the session and re-renders. Show the empty-history banner from spec §4.4 when there are no sessions.
- [ ] **Step 4: Verify locally:** run `npm test` (still green). Then `open src/index.html`. Expected: the page renders, tabs switch, the sign-in banner shows (no runtime locally), and there are no console errors. Modules may need `python3 -m http.server -d src 8000` because of file:// CORS; use `http://localhost:8000` if so.
- [ ] **Step 5: Commit**: `feat: page shell, storage, history tab`

---

### Task 6: Log tab (parse → preview → save)

**Files:**
- Modify: `src/app.js`, `src/index.html`
- Create: `src/claude.js`

**Interfaces:**
- Produces in `src/claude.js`:
  - `askJson(sample, prompt, validate, {modelTier, signal, onText}): Promise<value>`: calls `sample(prompt, {modelTier, signal, onText, cache:false})`, then `extractJson` and `validate`. On failure it calls once more with `prompt + '\n\n' + STRICT_SUFFIX`. If that also fails it throws `Error('invalid_output')`. `rate_limited` and `not_granted` rejections are rethrown unchanged.
- Consumes: `buildParsePrompt`, `validateSession`, `saveSession`.

- [ ] **Step 1:** Log tab: a textarea, a **Preview** button (parse with `modelTier:'quick'`), a rendered preview of the parsed session, and **Save** / **Edit** buttons. Save writes `{...value, source:'logged', rawText}`.
- [ ] **Step 2:** Errors per spec §7. `rate_limited` → "Busy, try again in a moment."; `invalid_output` → "Couldn't read that, try rephrasing."; save failure → keep the text on screen and show Retry. The textarea is never cleared until a save succeeds.
- [ ] **Step 3: Verify:** `npm test` green; the page still renders locally (the parse path is exercised in Task 8).
- [ ] **Step 4: Commit**: `feat: log tab`

---

### Task 7: Today tab (generate, revise, mark done)

**Files:**
- Modify: `src/app.js`, `src/index.html`

**Interfaces:**
- Consumes: `askJson`, `buildGeneratePrompt`, `buildRevisePrompt`, `buildParsePrompt`, `validateWorkout`, `validateSession`, `buildMovementSummary`, `recentWindow`, `saveSession`.

- [ ] **Step 1:** Style chips (one selected, default WOD), the request textarea, and a **Generate** button. Each request creates a new `AbortController` and aborts the previous one. While streaming, show `onText`'s `text` in a muted progress area. On completion, render the workout card: title, rationale, then blocks with movements (sets×reps or format, load + unit, note).
- [ ] **Step 2:** Below the card, a **"Change something…"** box. It calls revise with the current workout and replaces the card.
- [ ] **Step 3:** **Mark done** asks for the result text. It calls the parse prompt with `text` = the workout JSON plus the result text, then validates and saves `{...value, source:'generated', title: workout.title, rawText: resultText}`. Then it refreshes History and clears the card.
- [ ] **Step 4:** If history failed to load or is empty, pass `recent: []` and `summary: {}`, and show "Loads are estimates; log a few sessions for better suggestions."
- [ ] **Step 5: Verify:** `npm test` green; the page renders locally.
- [ ] **Step 6: Commit**: `feat: today tab`

---

### Task 8: Publish and end-to-end check

**Files:** none new (publishing only)

- [ ] **Step 1:** Load the `artifact-design` skill and apply its page contract to `src/index.html` (title, theme tokens, phone width). Commit any fixes.
- [ ] **Step 2:** Publish with the Artifact tool: `file_path: src/index.html`, `files: {"core.js":"src/core.js","app.js":"src/app.js","store.js":"src/store.js","claude.js":"src/claude.js"}`, `capabilities: {db:{}, user:{}, sample:{}}`, `icon: "dumbbell"`, and a one-sentence description.
- [ ] **Step 3:** Ask the user to open the link and:
  1. Log "Front squat 5x3 @ 100kg yesterday".
  2. Log two other sessions.
  3. Generate a Strength workout with "legs sore, back focus".
  4. Mark it done.
- [ ] **Step 4:** Check with `ArtifactData` `list` on `data/users/<id>/sessions`. Expected: 4 docs matching §5.1, with `source` values 3× `logged` and 1× `generated`. Also confirm the generated plan had no heavy leg movements and its loads cite history.
- [ ] **Step 5:** Record the published URL in `README.md`, then commit: `docs: link published artifact`.

---

## Notes on spec interpretation

- Spec §4.1 says the card "fills in as the response arrives". Partial JSON isn't safe to render, so the plan shows the streamed text in a progress area and renders the card when the answer is complete.
- Spec §5.3 says generated workouts aren't stored until marked done. The current card is kept only in memory, so a page reload loses an unsaved workout.
