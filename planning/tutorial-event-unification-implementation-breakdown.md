# Tutorial + Event Unification Implementation Breakdown

## Purpose
Unify gameplay UX systems under one event-driven architecture so tutorial, action log, accessibility announcements, and motion all consume the same canonical state transitions.

This removes reducer-level tutorial entanglement and enables predictable composition as game UX evolves.

## Problem Summary
- Tutorial progression and gating are currently spread across action reducers.
- Log and UX feedback are partially ad hoc and not fully event-based.
- New UX features (highlighting, animation, risk feedback) increase the chance of divergence unless tutorial uses the same event contract.

## Target Architecture
1. Reducers emit typed `GameEvent` records for meaningful transitions.
2. Tutorial progression is owned by a dedicated `tutorialEngine` module.
3. Step completion uses event predicates first, state predicates as fallback.
4. Action log and announcements are derived from shared event formatters.
5. UI highlighting and motion consume tutorial state + event stream without reducer special cases.

## Core Domain Contracts

### `GameEvent`
- `id`
- `type`
- `actorPlayerId`
- `round`
- `phase`
- `payload` (typed by `type`)

Recommended event types:
- `phase_transition`
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
Introduce typed event emission from core reducer transitions.

**Tasks**
- Add `GameEvent` types to store/domain layer.
- Add per-turn event queue and bounded event history in store state.
- Emit events for core transitions in existing reducers.
- Add selectors for latest event, turn events, and phase-filtered events.

**Files**
- `src/store/gameState.ts`
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`

**Acceptance**
- Core actions emit structured events with actor/round/phase context.
- No behavior/rule changes.

### TUE.2 Tutorial Engine Extraction
**Goal**
Move tutorial gating/progression logic out of action handlers.

**Tasks**
- Add `src/tutorial/engine.ts` for:
  - `isTutorialActionAllowed(...)`
  - `advanceTutorialFromEvents(...)`
  - `resolveTutorialInstruction(...)`
- Replace action-local tutorial checks with centralized calls.
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

### TUE.4 Unified Log + A11y Formatting
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

### TUE.5 Validation Gate
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
- Reducer: event emission sequence and payload correctness.
- Integration: full tutorial run + mode separation.
- Playwright: tutorial flow, final dismiss, desktop/mobile artifacts, console capture.

## Quality Gate
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`
- Playwright tutorial smoke steps from `planning/e2e-testing.md`

## Exit Criteria
- Tutorial logic is centralized and event-driven.
- Reducers are free of duplicated tutorial progression branches.
- Log/a11y/motion can rely on shared events.
- Tutorial and standard gameplay remain fully composable and test-stable.
