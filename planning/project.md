## Project Plan

### Stage 1 - Core Rules Engine
- **S1.1 Data modeling**: Define `GameState`, `PlayerState`, `TurnState`, and enums for dice faces, goods, disasters.
- **S1.2 Phase reducers**: Implement pure functions for each of the six phases per rules at https://www.yucata.de/en/Rules/RollAges; cover edge cases (skull locking, overflow goods).
- **S1.3 Validation suite**: Create exhaustive unit tests for the engine with canned scenarios and regression fixtures.

### Stage 2 - Redux Integration (E2E slices)
- **S2.1 Foundations**: Create Redux store, `game` slice, typed hooks, and bounded undo/redo history (20 mutations).
- **S2.2 Contract-first selectors**: Define memoized selector contracts for each future panel (dice, production, build, development, discard, turn status).
- **S2.3 Slice A (minimal playable)**: Deliver `startGame`, `rollDice`, `endTurn`, `undo`, `redo` wired through reducer, selectors, and minimal UI controls.
- **S2.4 Stage gate**: Add integration test proving a user can start, roll, end turn, and undo/redo from UI with no mocked reducers.

### Stage 3 - UI Skeleton and Mid-turn Flows (E2E slices)
- **S3.1 Layout shell**: Build routing-less app shell (header, board area, actions/log) backed by real Redux state.
- **S3.2 Slice B (dice decision + production)**: Implement `keepDie`, `selectProduction`, `resolveProduction`, `allocateGood` with corresponding panels and inline validation.
- **S3.3 Slice C (build loop)**: Implement `buildCity` and `buildMonument` actions with build panel and legality feedback.
- **S3.4 Stage gate**: Add integration tests for roll -> decide -> production -> build handoff and invalid-action prevention.
- **Detailed breakdown**: See `planning/stage3-implementation-breakdown.md`.

### Stage 4 - Full Turn Completion and UX Hardening (E2E slices)
- **S4.1 Slice D (development purchase)**: Wire development purchase flow including coin/goods spending decisions and reducer-level validation.
- **S4.2 Slice E (discard + end-of-turn)**: Implement overflow discard flow and strict turn completion guards through UI and reducers.
- **S4.3 Slice F (interaction polish)**: Add undo/redo controls + keyboard shortcuts, action log labels, and accessibility polish for interactive controls.
- **S4.4 Stage gate**: Add full-turn integration test (start -> complete turn path(s) -> undo/redo checkpoints) and critical validation-path tests.
- **Detailed breakdown**: See `planning/stage4-implementation-breakdown.md`.

### Stage 2-4 Composition Guardrails
- **Vertical slice rule**: Every increment must include reducer/action, selector contract, UI wiring, and integration test in the same PR.
- **Single validation source**: Rule validation originates in engine/reducer outputs; UI only renders and gates from those results.
- **No mock-only UI milestones**: Phase panels are considered complete only when they exercise real store transitions.
- **Per-slice quality gate**: Run `npm test -- --run`, `npm run lint:strict`, and `npm run typecheck` at each slice boundary.
- **Canonical smoke flow**: Keep one stable E2E test that always verifies one full playable turn and undo/redo behavior.

### Stage 5 - Bot & Modes
- **S5.1 Mode toggles**: Add menu to choose how many human vs bot players there are.
- **S5.2 Bot platform**: Implement pluggable bot interfaces and shared legal-action generation.
- **S5.3 Bot strategies**: Implement at least two deterministic approaches (for example heuristic and lookahead/risk-aware).
- **S5.4 Bot tuning/tests**: Simulate batches to validate legality, determinism, and decision budgets.
- **Detailed breakdown**: See `planning/stage5-implementation-breakdown.md`.

### Stage 6 - Polish & Delivery
- **S6.1 Audio/feedback**: Light SFX for rolls, milestone completion confetti, accessibility review.
- **S6.2 QA matrix**: Cross-browser testing (Chrome, Edge, Safari), mobile landscape verification.
- **S6.3 Launch package**: Document rules references, write README + deployment docs, final performance sweep.
