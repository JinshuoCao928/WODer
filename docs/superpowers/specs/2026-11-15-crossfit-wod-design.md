# WODer — CrossFit.com WODs and CrossFit-style suggestions: Design

Date: 2026-11-15 · Status: Draft for review · Builds on the 2026-11-07 and 2026-11-09 specs.

## 1. Goals

1. Show crossfit.com's workout for today and the past 7 days on the Today page.
2. Start each suggestion from today's CrossFit.com workout. Claude keeps it, adapts it or replaces it based on the athlete's history, recovery, Today boxes and equipment.
3. Write every main piece in the gym-app format the user showed:
   - an `- RX -` block, then a format line, then one movement per line with loads as `(female/male unit)`;
   - `Intended Stimulus` as ✓ bullets;
   - `- INTERMEDIATE -` and `- BEGINNER -` blocks in the same layout.
4. A warm-up (rules from the 2026-11-15 commit) and a cool-down are always present. A **Why this workout** section of 3–4 sentences explains the choice.
5. The profile's **Level** chooses the athlete's own version: Beginner → BEGINNER, Intermediate → INTERMEDIATE, Advanced → RX.

## 2. CrossFit.com WODs

- **Source:** https://www.crossfit.com/workout/. The published page can't read other sites, so **Claude updates the list when the user asks** ("update CrossFit WODs"). The user chose this over a daily job.
- **Storage:** a shared db collection `crossfit`, one doc per day, id `YYMMDD`:
  ```
  { date: "YYYY-MM-DD", name: string|null, rest: boolean,
    rx: string[], intermediate: string[]|null, beginner: string[]|null,   // null = "Same as Rx'd"
    stimulus: string,  // short summary of "Stimulus and Strategy"
    url: string }      // link back to the day on crossfit.com
  ```
- **Access rule** (declared at publish): `crossfit` is readable by every viewer, and only the owner can write it, so viewers can't overwrite it.
- **Updating:** each update writes today plus the 7 days before it, and deletes docs older than that. The prescription lines are kept as published; the strategy paragraph is stored as a short summary with the link back.

## 3. Today page

**A "CrossFit.com today" card sits above the boxes.** It shows:
- the date and name;
- the RX, Intermediate and Beginner lines ("Same as Rx'd" when null);
- the stimulus summary;
- a link to the day on crossfit.com.

**Rest days** show "Rest day".

**"Past 7 days"** is a collapsed list. Each day opens to the same card.

**Missing or old data:**
- **None loaded:** "No CrossFit.com workouts loaded yet. Ask Claude to update them."
- **Newest doc older than today:** "CrossFit.com workouts last updated <date>. Ask Claude to update them."

In both cases Claude designs without that day's WOD, and the reasoning says so.

## 4. Suggested workout

**The block order is unchanged:** `Warm-up`, one or two main blocks, `Cool-down`.

**Main blocks gain two optional fields.** Old saved workouts still validate.
```
versions: { rx: string[], intermediate: string[], beginner: string[] }   // CrossFit-style lines
stimulus: string[]                                                     // 2–4 bullets
```
- **`movements`** stays the athlete's own structured version: their level's option, with loads personalized from history. Mark done, Revise and History keep working on these.
- **`rationale`** is shown as **Why this workout**, in 3–4 sentences covering:
  - whether today's CrossFit.com WOD was kept, adapted or replaced, and why;
  - what the athlete and CrossFit.com trained this week;
  - the Today boxes the athlete filled in.

**Card layout, top to bottom:**
1. The title.
2. **Warm-up** (as now).
3. Each main block:
   - `- RX -` lines, `- INTERMEDIATE -` lines and `- BEGINNER -` lines; the athlete's level is marked "(your level)";
   - **Intended Stimulus** ✓ bullets;
   - **Your loads**: the structured movements with history notes.
4. **Cool-down.**
5. **Why this workout.**

**New rules for Claude:**
1. Start from today's CrossFit.com workout. Keep it, adapt it or replace it based on the athlete's history, recovery, Today boxes and equipment, and say which in the rationale. If there is none, design freely and say so.
2. Each main block gives `versions.rx`, `versions.intermediate` and `versions.beginner` as CrossFit-style lines:
   - a format line ("For time:", "AMRAP 12 min:", …);
   - then one movement per line with loads as `(female/male <unit>)`, e.g. `21 hang power cleans (95/135 lb)`, in the athlete's weight unit.
3. Each main block gives `stimulus`: 2–4 short bullets covering time domain, pacing, set breaks and intent.
4. A main block's `movements` are the athlete's own version: the option for their level (beginner → beginner, intermediate → intermediate, advanced → rx), with loads from their history.
5. The rationale is 3–4 sentences: the relation to today's CrossFit.com WOD, this week's training, and the athlete's stated feeling, focus and limits.

**The prompt includes** the CrossFit.com sections: today in full, and the past 7 days as one compact line each.

## 5. Testing

**Unit tests:**
- `validateWorkout` keeps `versions` and `stimulus`, and still accepts a workout without them.
- It rejects `versions.rx` when it isn't a string array.
- The generate prompt contains the five new rules, today's CrossFit lines and a past-day line.
- It says "No CrossFit.com workout today" when none is given.
- `crossfitText(doc)` gives a compact one-line form for rest days and for normal days.
- `store.loadCrossfit` returns the docs newest first, at most 8 (fake db).

**Browser check:** the card renders with a seeded CrossFit doc and a fake workout that has versions.

**Live check:** after publishing I seed the list from crossfit.com, read it back with ArtifactData, and the user designs one workout.

## 6. Out of scope

- A daily auto-update.
- Copying crossfit.com's Resources links or video embeds.
- Separate ♀/♂ defaults for the athlete's own loads (their loads come from history).
