# WODer
Design workouts of today for athlete.

**Live page:** https://claude.ai/artifact/Cv1mfV1RKyvRqyEBi4CtXL (claude.ai Artifact; each signed-in viewer gets a private history)

- Spec: `docs/superpowers/specs/2026-11-07-workout-designer-design.md`
- Plan: `docs/superpowers/plans/2026-11-07-workout-designer.md`
- Page source: `src/` (`index.html` is published; the `.js` modules are published beside it)
- Tests: `npm test` (Node 20+, no dependencies)
- Movement library: `docs/reference/CrossFit_Complete_Movement_Library.pdf` → `src/library.js`.
  To regenerate after a new PDF: `brew install poppler`, then
  `python3 scripts/extract-library.py docs/reference/CrossFit_Complete_Movement_Library.pdf src/library.js`
- Benchmark WODs (standard Rx versions): `src/benchmarks.js`
- Log page v2 spec/plan: `docs/superpowers/specs/2026-11-09-log-page-design.md`, `docs/superpowers/plans/2026-11-09-log-page.md`

## CrossFit.com workouts

The Today page shows crossfit.com's workout for today and the past 7 days, and Claude starts its suggestion from today's WOD.
The published page can't read other websites, so the list is refreshed **on request**: ask Claude Code "update CrossFit WODs".
Claude reads https://www.crossfit.com/workout/, then writes one doc per day (id `YYMMDD`) into the artifact's shared `crossfit`
collection with ArtifactData (fields: date, name, rest, rx[], intermediate[]|null, beginner[]|null, stimulus, url).
Only the owner can write that collection; every viewer can read it.
Spec/plan: `docs/superpowers/specs/2026-11-15-crossfit-wod-design.md`, `docs/superpowers/plans/2026-11-15-crossfit-wod.md`.
