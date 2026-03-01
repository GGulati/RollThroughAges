# Tutorial + Event Unification Implementation Breakdown

## Purpose
Unify gameplay UX systems under one event-driven architecture so tutorial, action log, accessibility announcements, and motion all consume the same canonical state transitions.

This removes reducer-level tutorial entanglement and enables predictable composition as game UX evolves.

## Problem Summary
- Tutorial progression and gating are currently spread across action reducers.
- Log and UX feedback are partially ad hoc and not fully event-based.
- New UX features (highlighting, animation, risk feedback) increase the chance of divergence unless tutorial uses the same event contract.

## Target Architecture
1. Engine commands return eventful results: `EngineResult = { nextState, resolutionEvents, appliedEvents }`.
2. Tutorial progression is owned by a dedicated `tutorialEngine` module.
3. Step completion uses event predicates first, state predicates as fallback.
4. Action log, announcements, and motion consume shared event formatters.
5. Store/reducers persist engine outputs; they do not re-implement rule semantics.

## Core Domain Contracts

### `DomainEvent`
- `id`
- `type`
- `actorPlayerId`
- `round`
- `phase`
- `payload` (typed by `type`)
- `parentEventId?` (for derived events)

Recommended event types:
- `phase_transition`
- `dice_roll_started`
- `dice_roll_resolved`
- `die_lock_changed`
- `production_resolved`
- `penalty_applied`
- `construction_progressed`
- `construction_completed`
- `development_purchased`
- `discard_resolved`
- `turn_completed`
- `game_completed`

### Event Streams
- `resolutionEvents`: intermediate trace (proposed, modified, negated, rewritten).
- `appliedEvents`: finalized canonical outcomes used for state folding and external consumers.

UX can consume both streams for satisfying "would happen -> prevented by X" sequences while state remains driven by finalized events.

### `TutorialStepDefinition` (revised)
- `id`
- `title`
- `instruction`
- `hint`
- `highlightTarget`
- `allowedActions`
- `completion`
  - `eventTypes?: string[]`
  - `statePredicate?: (gameState) => boolean`
- `instructionResolver?: (gameState) => string`

## Slice Plan

### TUE.1 Event Foundation
**Goal**
Introduce typed event contracts and persistence of event streams.

**Tasks**
- Add `DomainEvent` types to engine/store domain.
- Add `resolutionEvents` and `appliedEvents` queues/history in store state.
- Persist per-command event batches in store.
- Add selectors for latest event, turn events, and phase-filtered events.

**Files**
- `src/store/gameState.ts`
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`

**Acceptance**
- Event streams are typed, queryable, and bounded.
- No behavior/rule changes.

### TUE.2 Tutorial Engine Extraction
**Goal**
Move tutorial gating/progression logic out of action handlers.

**Tasks**
- Add `src/tutorial/engine.ts` for:
  - `isTutorialActionAllowed(...)`
  - `advanceTutorialFromEvents(appliedEvents, resolutionEvents, gameState)`
  - `resolveTutorialInstruction(...)`
- Replace action-local tutorial checks with centralized engine calls.
- Keep existing tutorial content behavior parity.

**Files**
- `src/tutorial/engine.ts` (new)
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`
- `src/store/gameState.ts`

**Acceptance**
- Tutorial action gating and progression are centralized.
- Reducers no longer duplicate step advancement calls per action.

### TUE.3 Declarative Step Completion
**Goal**
Switch step completion to declarative event/state predicates.

**Tasks**
- Migrate steps from `completionActions` to `completion` definitions.
- Use event-based completion for dice/build/development/discard/end-turn steps.
- Keep state predicate fallback for informational steps.

**Files**
- `src/store/gameState.ts`
- `src/tutorial/engine.ts`

**Acceptance**
- Tutorial completion logic is data-driven and auditable in one place.
- Final-step dismissal behavior remains explicit and tested.

### TUE.4 Engine Event Resolution Pipeline (Generic)
**Goal**
Move from ad hoc event emission to a deterministic pipeline that supports modifiers/interactions without loops.

**Tasks**
- Implement generic command pipeline stages:
  1. `emit` (base events)
  2. `transform` (effect processors rewrite/annotate/suppress/augment events)
  3. `finalize` (derive canonical applied events)
  4. `fold` (apply canonical events to state)
- Effect processors must be pure and deterministic.
- Processors operate over canonical event taxonomy from core UX plan, not per-feature special cases.
- Add cycle/loop protections:
  - `appliedEffectKeys` per event
  - stable processor ordering
  - `maxTransformPasses`
  - `maxDerivedEventsPerCommand`
  - deterministic diagnostic event on cap breach

**Files**
- `src/game/engine/*`
- `src/game/*` shared event types
- `src/store/gameSlice.ts` (consume `EngineResult`, persist streams)

**Acceptance**
- Engine resolves interactions (immunity/rewrite/mitigation/etc.) via event transforms.
- No infinite loops; deterministic safeguards enforced.

### TUE.5 Unified Log + A11y Formatting
**Goal**
Use shared event formatters for action log and accessibility announcements.

**Tasks**
- Add event formatting module:
  - `formatEventForLog(event, state)`
  - `formatEventForAnnouncement(event, state)`
- Replace direct string assembly in reducers where feasible.
- Keep player attribution and effect details.

**Files**
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`
- `src/ui/` or `src/tutorial/` formatter module(s)

**Acceptance**
- Log and announcement messages are event-derived and consistent.

### TUE.6 Validation Gate
**Goal**
Prove end-to-end stability across tutorial + normal mode.

**Tasks**
- Maintain full tutorial integration test (step 1 -> 20 -> dismiss).
- Add non-tutorial regression test after tutorial start/exit.
- Add Playwright tutorial smoke scenario with final dismiss check.

**Files**
- `src/__tests__/integration/tutorial-single-game.integration.test.ts`
- `planning/e2e-testing.md`

**Acceptance**
- Tutorial and normal mode compose without cross-mode contamination.
- Final step dismiss behavior remains stable.

## Juice Integration Hooks (Design + UX)
Use emitted events to drive:
- pre-roll risk strip updates
- production outcome delta cards
- disaster emphasis and immunity callouts
- construction payoff moments (progress/completion)
- opponent pressure indicators in game status
- paced phase auto-skip transitions

This ensures game-feel improvements use canonical game truth.

## Testing Strategy
- Unit: tutorial engine action gating and progression predicates.
- Engine: pipeline stage sequencing, transform determinism, loop caps.
- Reducer/store: event persistence and selectors.
- Integration: full tutorial run + mode separation.
- Playwright: tutorial flow, final dismiss, desktop/mobile artifacts, console capture.

## Quality Gate
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`
- Playwright tutorial smoke steps from `planning/e2e-testing.md`

## Exit Criteria
- Tutorial logic is centralized and event-driven.
- Store/reducers are free of duplicated tutorial progression and rule semantics.
- Log/a11y/motion can rely on shared event streams.
- Tutorial and standard gameplay remain fully composable and test-stable.
