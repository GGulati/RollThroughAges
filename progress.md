Original prompt: Fix the findings above first. Ignore finding 4, that's acceptable

- Initialized progress tracking for engine-fix pass.
- Scope: fix findings 1,2,3,5; skip finding 4 per user instruction.
- Implemented fix for history snapshots: replaced JSON cloning with explicit deep clone that preserves GoodsTrack Map key identity.
- Implemented Leadership roll bonus in roll eligibility and roll auto-advance checks.
- Implemented city build legality: only next incomplete city can receive workers.
- Updated build options to allow partial builds (city + monuments) when workers > 0.
- Implemented Quarrying goods bonus during Stone allocation in production.
- Added tests for leadership roll limit, map-safe undo/redo, city sequence restriction, partial build options, and quarrying bonus.
- Test status: `npm test -- --run` passes (226/226).

TODOs / suggestions:
- Consider a dedicated serialization strategy for Redux history in Stage 2 middleware to keep Map-based state robust.
- Clarify Quarrying exact rule semantics (per-good allocation vs per-die/turn) and adjust if needed once full rule source is finalized.
