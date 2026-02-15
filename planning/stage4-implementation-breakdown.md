# Stage 4 Implementation Breakdown

## Scope
Stage 4 completes the turn loop after Build and hardens interaction quality:
- development purchase flow with explicit spend decisions
- discard/turn-completion rules and validation
- UX and accessibility polish for turn actions
- stage-gate integration for full-turn composition and undo/redo safety

## Baseline Assumptions (Locked)
- Dice production auto-resolves when rerolls/choices are settled.
- Goods collection from dice is automatic; player only chooses goods when spending for developments.
- Random roll outcomes remain non-undoable; deterministic mutations remain undoable.
- Validation remains reducer/engine-owned; UI only reflects and gates.

## Slice Plan (Execution Order)

### S4.1 Slice D: Development Purchase
**Goal**
Ship a complete development-purchase experience with legal spend choices and clear feedback.

**Tasks**
- Add/finish reducer action for development purchase:
  - accepts development id
  - accepts selected goods types to spend
  - enforces phase and affordability checks
- Extend development selector contract with:
  - full catalog (including purchased)
  - affordability flags
  - spend-value summary for selected goods
  - owned developments list
- Update Development panel UI:
  - separate goods-selection section from development options
  - render each development as a persistent row/card (not transient buttons)
  - show effect description, cost, VP, and purchased status
  - show effective coins/purchasing-power preview

**Files**
- `src/store/gameSlice.ts`
- `src/store/gameState.ts`
- `src/store/selectors.ts`
- `src/App.tsx`
- `src/index.css`

**Tests**
- Reducer tests for legal and illegal development purchases.
- Selector tests for catalog visibility, affordability, and purchased-state visibility.
- Integration test for development purchase from UI.

**Acceptance**
- Player can purchase legal developments in the intended phases.
- Purchased developments remain visible and cannot be re-bought.
- Invalid purchases return stable reducer errors and do not mutate state.

### S4.2 Slice E: Discard + End-Turn Guards
**Goal**
Enforce post-development turn completion rules including goods overflow and discard requirements.

**Tasks**
- Add/finish reducer actions:
  - validate end-turn only when required phases are complete
  - discard-goods decision path when overflow exists
- Extend discard selector contract:
  - overflow amount and limit context
  - legal discard options
  - reason strings for blocked actions
- Update Discard/Actions UI:
  - explicit discard controls when overflow required
  - blocked end-turn messaging when unresolved discard/validation exists

**Files**
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`
- `src/App.tsx`
- `src/index.css`

**Tests**
- Reducer tests for overflow-required discard flow.
- Reducer tests for blocked/allowed end-turn transitions.
- Selector tests for discard options and reason messages.

**Acceptance**
- Overflow cannot be ignored.
- End-turn is blocked until discard/phase requirements are satisfied.
- Legal discard flow transitions to end-turn cleanly.

### S4.3 Slice F: Interaction Polish
**Goal**
Improve usability and consistency for turn controls without changing game rules.

**Tasks**
- Add keyboard shortcuts:
  - undo/redo
  - optional end-turn shortcut (if no accessibility conflicts)
- Improve control states and messages:
  - consistent disabled reasons
  - concise panel-level status language
- Tighten responsive behavior and focus flow:
  - tab order across action-heavy panels
  - focus retention after mutation

**Files**
- `src/App.tsx`
- `src/index.css`
- optionally `src/store/selectors.ts` (reason strings)

**Tests**
- Add focused integration assertions for keyboard-triggered undo/redo.
- Keep all existing stage integration tests green.

**Acceptance**
- Primary actions remain discoverable on desktop and mobile.
- Keyboard interactions function without breaking pointer workflows.
- No regressions in existing stage flows.

### S4.4 Stage Gate Integration
**Goal**
Prove full turn composition across Dice -> Build -> Development -> Discard -> End Turn with invalid-path protection.

**Tasks**
- Add stage-gate integration test:
  - deterministic full-turn happy path
  - one invalid path per phase boundary
  - undo/redo checkpoints around deterministic mutations
- Keep assertions against real store transitions (no mocked reducers).

**Files**
- `src/__tests__/integration/stage4-full-turn.integration.test.tsx`
- optionally `src/__tests__/testUtils.ts`

**Acceptance**
- Full turn completes through all required phases.
- Invalid actions are blocked and state-safe.
- Undo/redo behaves correctly for deterministic actions in the flow.

## Recommended PR Breakdown
1. `stage4/slice-d-development-purchase`
2. `stage4/slice-e-discard-endturn`
3. `stage4/slice-f-interaction-polish`
4. `stage4/stage-gate-full-turn`

## Per-Slice Quality Gate
Run after each slice:
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`
- Playwright smoke:
  - headed open
  - snapshot
  - console capture
  - desktop + mobile screenshots
  - artifacts under `output/playwright/`

## Stage 4 Exit Criteria
- Development purchases are fully interactive with explicit spend decisions and legality feedback.
- Discard/overflow and end-turn guardrails are enforced in reducer + UI.
- Interaction polish is shipped without breaking stage-2/stage-3 flows.
- Stage 4 full-turn integration gate passes with invalid-action coverage.
