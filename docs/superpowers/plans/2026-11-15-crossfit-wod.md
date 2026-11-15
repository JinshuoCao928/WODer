# CrossFit.com WODs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Show crossfit.com's last 8 days on Today. Claude starts from today's WOD and writes main pieces in the RX / INTERMEDIATE / BEGINNER + Intended Stimulus format, with warm-up, cool-down and "Why this workout".

**Architecture:**
- **Data:** a shared db collection `crossfit` (owner writes, everyone reads) that Claude fills on request with ArtifactData.
- **Logic:** pure helpers in `core.js` and `store.js`.
- **Rendering:** in `app.js` (Today card, workout card).

**Spec:** `docs/superpowers/specs/2026-11-15-crossfit-wod-design.md`

## Global Constraints

- **Collection:** `crossfit`, doc id `YYMMDD`, shape as in spec §2. Capabilities on publish: `{db: {rules: [{path: 'crossfit', read: 'view', write: 'owner'}]}, user: {}, sample: {}}`.
- **Level → version:** beginner → beginner, intermediate → intermediate, advanced → rx.
- **New UI strings** go in `en` and `zh`.

## Review Focus

1. **Old saved workouts** (no `versions`) still render and Mark done still works. Test in Task 1.
2. **No CrossFit data at all** (new artifact, list never seeded): the prompt says so and the Today card shows the "ask Claude" note. Tests in Tasks 2 and 3.
3. **A CrossFit option that is "Same as Rx'd"** (null): the card shows "Same as Rx'd", not an empty block. Covered in the Task 4 browser check.
4. **Stale list** (newest doc before today): the stale note appears, and the prompt says there's no WOD for today. Test in Task 2.
5. **Long lines** (Hero WOD tributes, many movements) wrap inside the card at phone width. Task 4 screenshot.

---

### Task 1: Workout model keeps versions and stimulus
- Files: `src/core.js` (`checkBlocks`), `test/core.test.js`.
- [ ] **Tests:**
  - `validateWorkout` with a main block `{versions: {rx: ['For time:', '21 thrusters (65/95 lb)'], intermediate: [...], beginner: [...]}, stimulus: ['8-12 min']}` keeps both fields;
  - the same workout without them is valid, and `versions`/`stimulus` come out as `null`;
  - `versions: {rx: 'x'}` is rejected.
- [ ] Run and watch it fail. Implement: in `checkBlocks`, `versions` must be `null` or have three string-array keys; `stimulus` must be `null` or a string array. Run it green and commit `feat: workout versions and stimulus`.

### Task 2: Prompt
- Files: `src/core.js`, `test/core.test.js`.
- **Produces:**
  - `crossfitText(doc): string`:
    - rest days → `"YYYY-MM-DD: rest day"`;
    - others → `"YYYY-MM-DD <name?>: <rx lines joined with ' / '>"`.
  - `buildGeneratePrompt({prefs, crossfit: {today: doc|null, past: doc[]}, ...ctx})`.
- **Prompt changes:**
  - a section `CrossFit.com today:` with the full rx, intermediate and beginner lines and the stimulus, or `No CrossFit.com workout today.`;
  - a section `CrossFit.com past 7 days:` with one `crossfitText` line per day;
  - `WORKOUT_RULES` gains the 5 rules of spec §4, verbatim;
  - `WORKOUT_TEMPLATE` shows a main block with `versions` and `stimulus`;
  - `historySection` gives `Athlete level: <level>`.
- **Revise:** `buildRevisePrompt` gets the same CrossFit sections.
- [ ] **Tests:**
  - with today's doc the prompt has its lines;
  - with `today: null` it says `No CrossFit.com workout today.`;
  - it contains a past-day line and all 5 rules;
  - `crossfitText` covers a rest day and a named day.
- [ ] Red → implement → green → commit `feat: CrossFit.com context and format rules in prompts`.

### Task 3: Loading the CrossFit list
- Files: `src/store.js`, `test/store.test.js`, `src/app.js` (state + `historyContext`).
- **Produces:** `loadCrossfit(db): Promise<doc[]>`, newest first, at most 8, with a 10 s timeout. `state.crossfit = {today, past, newest}`, where `today` is the doc whose `date === todayISO()`.
- `historyContext()` adds `crossfit`.
- [ ] **Test (fake db):** with 10 docs, `loadCrossfit` returns the 8 newest in order. Red → green → commit `feat: load CrossFit.com list`.

### Task 4: Rendering
- Files: `src/app.js` (`renderToday`, `renderWorkoutCard`), `src/index.html` (CrossFit card styles), `src/i18n.js`.
- **i18n keys:** `cfToday, cfPast, cfRest, cfNone, cfStale(date), sameAsRx, rxLabel, intermediateLabel, beginnerLabel, yourLevel, stimulus, yourLoads, whyThis, openOnSite`.
- **Today card:**
  - date and name;
  - RX / INTERMEDIATE / BEGINNER lines, or "Same as Rx'd";
  - the stimulus summary and a link;
  - a `<details>` "Past 7 days" list with one entry per day;
  - the None or Stale note.
- **Workout card:** title, Warm-up, main blocks (versions with "(your level)", ✓ stimulus, "Your loads" = `renderBlocks`), Cool-down, then "Why this workout" + rationale.
- **Old workouts** (no `versions`) render as before.
- [ ] **Browser check** with a seeded state (one CrossFit doc with null intermediate, one fake workout with versions): no errors, "Same as Rx'd" visible, screenshot clean at 500 px. Commit `feat: CrossFit.com card and CrossFit-style workout card`.

### Task 5: Publish, seed, verify
- [ ] Publish with the capabilities from Global Constraints and all 12 modules.
- [ ] Fetch crossfit.com/workout (today and 7 days back). Write the docs with an `ArtifactData` batch `set` to `crossfit/<YYMMDD>`. Read back with `list` and confirm 8 docs.
- [ ] README: how to ask for an update. Commit `docs: CrossFit.com update procedure`.
- [ ] Final whole-branch review (fresh reviewer), then a fix pass as before.
