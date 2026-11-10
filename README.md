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
