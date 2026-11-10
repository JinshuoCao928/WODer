# WODer — Log Page v2: Design

Date: 2026-11-09
Status: Draft for review
Builds on: `2026-11-07-workout-designer-design.md` (v1, published)
Source data: `docs/reference/CrossFit_Complete_Movement_Library.pdf`

## 1. Goals

1. Log a workout by **typing** (as in v1) or with a **dropdown form**.
2. After Claude reads typed text, **each workout it finds is its own card** with **Edit** and **Remove** buttons. Edit opens the dropdown form, already filled in.
3. A workout can be saved **without a date** ("I don't remember").
4. The dropdowns come from the user's movement library PDF: 489 movements, 17 formats and 25 benchmark WODs.
5. **Saved workouts can be edited** from History with the same form.
6. **Scaled workouts:** a benchmark fills in the standard (Rx) weights and movements. The athlete can change any of them, and the workout is then marked **Scaled**.

## 2. Log page flow

The Log page holds one **pending list** of workout cards. There are two ways to add to it:

- **Type it** → **Read it** → Claude returns one or more workouts → each one becomes a card.
- **Use the form** → **Add to list** → one card.

Each card shows its date (or "Date unknown"), type, movements and result, plus **Edit** and **Remove** buttons.
- **Edit** opens the form filled in with that card's data; **Done** replaces the card.
- **Save all** saves every card. The welcome banner and the "saved N" message work as in v1.
- Cards are saved one by one and removed from the list as each save succeeds, so a Retry never saves a card twice. A view-only viewer is handled as in v1.

### 2a. Editing saved workouts (History)

- Each saved workout in History has an **Edit** button next to Delete.
- In a session with several blocks (a designed workout marked done), each block has its own Edit button, and the session date is edited along with it.
- **Edit** opens the same form, filled in. **Save changes** writes the whole session record back: same id and `createdAt`, with `updatedAt` set to now. **Cancel** discards the changes.
- A failed save keeps the form open with Retry, as in Log. A view-only viewer never sees Edit.

## 3. The form

Fields appear in this order:

1. **Date:** a date picker, defaulting to today, plus an **"I don't remember"** checkbox that disables it and saves `date: null`.
2. **Benchmark (optional):** a dropdown of the 25 benchmark WODs. Choosing one fills in fields 3–5 with the standard version (§6), using the **Rx weight as the default** (e.g. Fran thrusters 95 lb / 43 kg). Every field stays editable.
   - A **Scaled** checkbox sits next to it. It is ticked automatically when any weight is changed from Rx or a benchmark movement is replaced, and the athlete can also tick or untick it by hand (e.g. jumping pull-ups count as scaled).
   - The checkbox also appears without a benchmark, for any workout.
   - When the Rx weight isn't one of the dropdown steps (e.g. 43 kg), it is added to that dropdown as its own option.
3. **Format:** a dropdown with **Strength** first, then the PDF's 17 formats in PDF order. Each format uses one of six **layouts** (§4).
4. **Setup fields** for that layout.
5. **Movements:** one or more rows. Each row has:
   - a movement input with a datalist of all 489 names, grouped by equipment; free text is allowed;
   - reps (number or text such as "21-15-9");
   - weight;
   - for Strength only, sets.
   - "+ Add movement" adds a row, and a row can be removed.
6. **Result fields** for that layout.
7. **Note:** free text.

**Input ranges:**

| Input | Options |
|---|---|
| Weights (dropdown) | empty, then 2.5 kg steps up to 300 kg, or 5 lb steps up to 660 lb, following the profile unit |
| Minutes | 1–60 |
| Rounds | 1–50 |
| Sets | 1–20 |
| Reps | 1–100, or typed text |
| Times | two dropdowns: minutes 0–120 and seconds 0–59 |

## 4. Layouts

| Layout | PDF formats | Setup fields | Result fields |
|---|---|---|---|
| `strength` | Strength, Complex | – (sets on each movement) | – |
| `amrap` | AMRAP | minutes | rounds + extra reps |
| `fortime` | For Time, RFT, Chipper, Ascending Ladder, Descending Ladder, Pyramid | rounds (optional), time cap minutes (optional) | time (mm:ss) |
| `intervals` | EMOM, E2MOM, Tabata, Intervals, Death By | every N minutes (1–5; E2MOM defaults to 2), total minutes | rounds or reps reached (optional) |
| `pr` | Max Effort | PR kind; exactly one movement | depends on kind (below) |
| `other` | Partner WOD, Team WOD, Buy-In / Cash-Out | – | note only |

**PR kinds:**

| Kind | Inputs |
|---|---|
| `heaviest` | rep max (1, 2, 3 or 5) + weight. Stored as `reps` + `load` on the movement. |
| `fastest` | distance (text, e.g. "1000m", "1 mile") + time. Stored as `distance` + `time` on the movement. |
| `mostReps` | reps. Stored as `reps`. |
| `farthest` | amount (text, e.g. "42 cal", "250m") in N minutes. Stored as `distance` + the block's `minutes`. |

## 5. Data model changes

Each **logged workout is saved as its own session record** with one block. This keeps the v1 shape, so History, the summaries and Today keep working. Generated workouts stay multi-block.

**Session:**
- `date` may now be `null`.

**Block:** new fields, all optional, so v1 records still validate and render.
```
type: "strength"|"amrap"|"fortime"|"intervals"|"pr"|"other"   // default "other"
format: string            // the exact format name, e.g. "Chipper", "E2MOM", "5x5"
benchmark: string|null    // e.g. "Fran"
minutes: number|null      // AMRAP length, interval total, for-time cap, PR "farthest" window
every: number|null        // intervals: every N minutes
rounds: number|null       // for time: prescribed rounds
scoreRounds: number|null  // AMRAP rounds / intervals rounds reached
scoreReps: number|null    // AMRAP extra reps / intervals reps
scoreTime: string|null    // "m:ss" or "h:mm:ss"
prKind: "heaviest"|"fastest"|"mostReps"|"farthest"|null
scaled: boolean           // default false; true = not done as prescribed (lighter load, swapped movement, ...)
result: string|null       // display text, always regenerated from the fields above when they exist
```

**Movement:** new optional fields `distance: string|null` and `time: string|null`.

**Validation rules:**
- `scoreTime` and `time` must match `^\d{1,3}:\d{2}(:\d{2})?$`.
- `type` and `prKind` must be in their enums.
- A `pr` block has exactly one movement.

**`resultText(block)` (pure function) builds the display/prompt text:**

| Case | Text |
|---|---|
| AMRAP | `7 rounds + 3 reps` |
| For time | `4:32` (with ` (cap 12)` if capped and no time) |
| Intervals | `12 rounds` / `85 reps` |
| PR heaviest | `3RM 140kg` |
| PR fastest | `1000m in 3:35` |
| PR mostReps | `25 reps` |
| PR farthest | `42 cal in 1 min` |
| any block with `scaled: true` | the text above + ` (Scaled)`, e.g. `4:32 (Scaled)` |

## 6. Library data (`src/library.js`, generated)

`scripts/extract-library.py` reads the PDF with `pdftotext -layout` and writes `src/library.js` with:
- `MOVEMENTS`: 489 entries of `{id: "CF-001", name: "Back Squat", group: "Barbell"}` in PDF order. The script fails unless it finds 489 unique IDs and the 12 group counts printed on the PDF's summary page.
- `FORMATS`: the 17 format names and descriptions from the PDF, plus `Strength`, each with its `layout` (§4).

`BENCHMARKS` is hand-written in `src/benchmarks.js`, because the PDF gives only names and movements. These are the standard published versions:
- each has a layout, a format, rounds/minutes where relevant, and movements with reps and Rx loads as `{kg, lb}`;
- the form picks the unit from the profile.

All 25 PDF benchmarks are included: Fran, Grace, Isabel, Diane, Elizabeth, Karen, Annie, Helen, Jackie, Nancy, Cindy, Mary, Chelsea, Angie, Barbara, Amanda, Gwen, Linda, Eva, Kelly, Murph, DT, The Chief, Fight Gone Bad and Filthy Fifty. Bodyweight-relative loads (Linda) are left empty, with a note.

**Movement names:** `normalizeMovementName` returns the library's spelling when the name matches a library movement, comparing case-insensitively after the plural rule. Examples: "front squats" → "Front Squat"; "ghd sit-up" → "GHD Sit-Up". Aliases (FS, BS, …) point at library names. Stored v1 names are merged at read time, because summaries normalize.

## 7. Claude parse prompt

- The output stays `{"sessions":[...]}`, one entry per workout (not per day), using the new block fields. The template shows one AMRAP, one For Time and one PR example.
- The prompt includes all 489 library names and tells Claude to use those exact names when a movement matches.
- New date rule: "If the text gives no date and none can be inferred, set date to null. Never guess a date."

## 8. Effects on Today and History

- **`recentWindow`** skips sessions with `date: null`.
- **`buildMovementSummary`:**
  - `latest` comes from dated sessions; it falls back to an undated one only if the movement has no dated entry;
  - `best` counts all sessions, including undated and PR blocks.
- **The generate prompt** gains a section "Personal records (any date)": `pr` blocks as text, e.g. "Back Squat 3RM 140kg". Load rule 3 already caps loads relative to recorded bests.
- **Scaled results** reach Claude as "(Scaled)" in the result text and as the actual loads used. Claude should treat the actual load, not Rx, as the athlete's level; the generate rule list gains: "Scaled results show the load the athlete actually used; base suggestions on that, not on Rx." 
- **History** lists dated sessions newest first, then a **Date unknown** group.

## 9. Error handling

- **Form:** the form can't be submitted without at least one movement name, except for the `other` layout. Problems are shown next to the field, e.g. "Add a movement" or "Enter a time".
- **Claude parse:** behaves as in v1, using the one retry and the existing messages.

## 10. Testing

**Unit tests (`npm test`):**
- `validateSession`:
  - accepts `date: null` and each layout's fields;
  - rejects a bad `scoreTime`, an unknown `type`, and a `pr` block with two movements.
- `resultText`: one test per row of the §5 table.
- `blockFromForm` / `formFromBlock` (pure: form values ↔ block) round-trip one example per layout.
- `recentWindow` skips undated sessions; `buildMovementSummary` counts an undated PR in `best` but not in `latest` when dated data exists.
- `normalizeMovementName` returns library spellings (including "GHD Sit-Up").
- `library.js`: 489 movements; group counts match the PDF summary; every FORMAT has a known layout.
- `BENCHMARKS`: 25 entries; every movement name normalizes to a library movement or is on an allowed list (e.g. "Run", "Pull-Up").
- The generate prompt includes the PR section.
- `isScaledFromRx(block, benchmark, unit)` returns true when a load differs from Rx or a movement name differs, and false for an untouched benchmark.
- `store.updateSession` keeps the id and `createdAt` and sets `updatedAt` (fake-db test).

**Manual check after publishing:** the form at phone width, a benchmark pick, editing a parsed card, and saving an undated workout.

## 11. Out of scope

Charts and progress tracking, partner/team scoring, Today page redesign, and men's/women's Rx defaults (the default is the first Rx value; the athlete changes it). These are follow-ups the user has signalled.
