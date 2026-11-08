# WODer — Workout Designer Artifact: Design

Date: 2026-11-07
Status: Draft for review

## 1. Purpose

Athletes who don't want the workout assigned by their gym or organization can design their own for today. The tool:

1. Lets the athlete design a workout on demand instead of following the assigned one.
2. Reads the athlete's historical workout results and uses them to design today's session (sensible loads, recovery-aware muscle-group choice).
3. Takes free-text preferences, e.g. *"I did front squats yesterday; my legs are sore. I want something focused on my back."*, and shapes the workout accordingly.

**Success criteria**
- Given a history containing heavy leg work yesterday and the prompt "legs sore, back focus", the generated workout avoids heavy leg loading and focuses on back.
- Suggested loads trace back to the athlete's logged numbers (or are explicitly labeled as estimates when no history exists).
- Each athlete's history is private to them; no one else (including the artifact owner) can read it.

## 2. Decisions

| Decision | Choice |
|---|---|
| Form factor | A single claude.ai Artifact (HTML page) |
| History source | Logged inside the tool in free text, parsed by Claude |
| Users | One shared link; each viewer has their own private history |
| Training style | Athlete picks per request: WOD, Strength, Conditioning, Mobility |
| Approach | Claude is called from the page (`sample` capability) to parse logs and generate/revise workouts |

**Out of scope for v1:** gym-app imports, coach/admin views, progress charts, equipment profiles (equipment/time are stated in the free-text request), accounts beyond claude.ai sign-in.

## 3. Platform & capabilities

- Published as one HTML page via the Artifact tool.
- Capabilities: `db` (storage), `user` (viewer id), `sample` (Claude calls).
- Viewers must be signed in to claude.ai to save history. `sample` asks each viewer for consent on first use.

## 4. Page layout & flow

Single page, three tabs. Mobile-first, single column, light and dark themes.

### 4.1 Today (default tab)
- Style chips: **WOD · Strength · Conditioning · Mobility** (one selected).
- Text box: "How are you feeling / what do you want?" (soreness, focus, time, equipment).
- **Generate** button → workout card that fills in as the response arrives.
- Workout card:
  - One-line rationale (e.g. "Back-focused because you squatted heavy yesterday.").
  - Blocks in order: Warm-up → Strength/Skill → Main piece → Cooldown.
  - Each movement: sets×reps or time domain, suggested load, short scaling note, and where applicable the history reference (e.g. "last: 65kg ×5 on Nov 2").
- Below the card:
  - **"Change something…"** box → revises the workout (follow-up request).
  - **"Mark done"** → asks for a quick result in free text (e.g. "rows felt easy, metcon 12:34"), parsed and saved as a session with `source: "generated"`.

### 4.2 Log
- Free-text entry for sessions done elsewhere (e.g. the gym's WOD).
- Claude parses it → a structured preview is shown → athlete taps **Save** or edits the text and re-parses. Nothing is saved without confirmation.

### 4.3 History
- Sessions newest first: date, style, movements, loads. Tap to expand; delete available.

### 4.4 Empty history
- Generation still works. Claude uses the profile/self-description in the request (e.g. "intermediate, back squat ~120kg") and labels loads as estimates.
- A banner suggests logging a few past sessions for better suggestions.

## 5. Data model

All data lives in the `db` under the viewer's private path `data/users/<userId>/`, where `<userId>` comes from `user.id()`. This path is readable/writable only by that viewer.

### 5.1 `data/users/<id>/sessions/<sessionId>`

```
{
  date: "YYYY-MM-DD",                 // day performed
  source: "logged" | "generated",
  style: "wod" | "strength" | "conditioning" | "mobility" | "other",
  title: string,
  focus: string[],                    // muscle groups, e.g. ["back","biceps"]
  blocks: [
    {
      name: string,                   // "Warm-up", "Strength", "Metcon", ...
      format: string,                 // "5x5", "EMOM 12", "AMRAP 15", "For Time", ...
      movements: [
        { name: string,               // normalized, e.g. "Front squat"
          sets: number | null,
          reps: number | string | null,   // number, or e.g. "max", "21-15-9"
          load: number | null,
          unit: "kg" | "lb" | null,
          note: string | null }
      ],
      result: string | null           // "12:34", "7 rounds + 3", ...
    }
  ],
  rpe: number | null,                 // 1–10, optional
  notes: string | null,
  rawText: string,                    // original text, kept for re-parsing
  createdAt: number                   // epoch ms
}
```

### 5.2 `data/users/<id>/profile` (single doc, optional)

```
{ unit: "kg" | "lb", level: "beginner" | "intermediate" | "advanced", about: string }
```

`about` holds free text such as known maxes, injuries, usual equipment. It is included in every Claude request.

### 5.3 Not stored
- Generated workouts that are never marked done.
- Follow-up chat turns (only the final workout, once marked done).

### 5.4 Derived data (computed in the page, not stored)
- **Movement summary**: for each normalized movement name across all history, the most recent `{date, sets, reps, load, unit}` and the best (heaviest) load, converted to the profile's unit.
- **Recent window**: sessions from the last 14 days in compact form.

## 6. Claude calls

Every call is memoryless and self-contained: instructions + data + required JSON output format. All responses are validated against the expected schema before use.

### 6.1 Parse log
- Trigger: Log tab Save/preview, or "Mark done" result.
- Input: raw text, today's date, preferred unit, existing movement names (to encourage consistent naming).
- Output: one `session` object (§5.1 shape, minus `createdAt`/`rawText`, which the page adds).
- Must resolve relative dates ("yesterday") to `YYYY-MM-DD` and normalize movement names (e.g. "FS", "front squats" → "Front squat").
- Model tier: `quick`.

### 6.2 Generate workout
- Input: style, athlete's request text, profile, recent 14-day window, movement summary, today's date.
- Rules in the instructions:
  - Respect stated soreness, focus and exclusions.
  - Avoid heavily loading a muscle group trained within the last 48 hours.
  - Base loads on actual history: roughly 70–85% of a recent best for working sets, or a small increase if the last session at that movement was noted as easy. Never exceed ~5% above the recorded best.
  - Never invent history; mark loads as estimates when no history exists for a movement.
  - Fit stated time and equipment.
  - If pain or injury (not normal soreness) is mentioned, give a conservative alternative and suggest seeing a professional.
- Output: `{ title, rationale, style, focus, blocks }` (blocks as in §5.1, with `result: null`).
- Streams into the card via `onText`. Model tier: `default`.

### 6.3 Revise workout
- Input: current workout JSON, the change request, the same history context and rules as §6.2.
- Output: the full revised workout (same shape as §6.2), which replaces the card.
- Model tier: `default`.

## 7. Error handling

| Situation | Behavior |
|---|---|
| `db` unavailable (signed out) | Banner "Sign in to claude.ai to save your history". Generation may still run; nothing is saved. |
| `sample` unavailable or consent declined | Hide Generate/Parse controls with an explanation. History remains viewable. Do not re-prompt in the same page load. |
| `rate_limited` | "Busy, try again in a moment." No automatic retry loop. |
| Response fails schema validation | One retry with a stricter instruction; then "Couldn't build a workout, try rephrasing." Keep the athlete's input. |
| DB read exceeds 10 s | "Couldn't load history." Generate proceeds as if history is empty and says so. |
| DB write fails | Keep the entered text on screen; show Retry. |
| Generate pressed while a request runs | Abort the previous request (`AbortController`); only the newest runs. |

## 8. Code structure

Single HTML file, with logic split into small, pure, testable functions:

- `validateSession(obj)`, `validateWorkout(obj)`: schema validation of Claude output.
- `normalizeMovementName(name)`: canonical naming used when building summaries.
- `buildMovementSummary(sessions, unit)`: latest + best per movement, with kg↔lb conversion.
- `recentWindow(sessions, today, days = 14)`: compact recent history.
- `buildGeneratePrompt(...)`, `buildParsePrompt(...)`, `buildRevisePrompt(...)`: prompt assembly.
- UI and capability wiring are kept separate from the pure functions above.

## 9. Testing

- **Unit tests (local, Node)** on the pure functions with fixtures: empty history, mixed kg/lb, inconsistent movement names, malformed Claude output.
- **End-to-end check after publishing**, from the owner's account:
  1. Log three sessions, including "front squats yesterday".
  2. Generate with "legs sore, back focus" and confirm the plan avoids legs and its loads reference logged history.
  3. Mark done and confirm the session appears in History.
  4. Read the `db` (via `ArtifactData`) to confirm records are under `data/users/<id>/sessions` and match the schema.
- **Limit:** a second viewer's experience can't be checked from this session; per-viewer privacy relies on the platform's `data/users/<id>/` rule.
