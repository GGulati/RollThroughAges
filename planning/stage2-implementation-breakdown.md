# Stage 2 Implementation Breakdown

## Scope
Stage 2 delivers Redux integration as end-to-end slices:
- store wiring
- game slice actions/reducer
- bounded undo/redo (20 mutations)
- selector contracts for future panels
- minimal playable UI flow (`startGame -> rollDice -> endTurn -> undo/redo`)

## Slice Plan (Execution Order)

### S2.1 Foundations (Store + Typed Hooks)
**Goal**
Establish the Redux boundary so all game interactions flow through one store.

**Tasks**
- Create `src/store/store.ts`.
- Create `src/store/hooks.ts` with typed hooks.
- Add `Provider` in `src/main.tsx`.
- Add Stage-2 game state adapter in `src/store/gameState.ts` (engine-backed shape for Redux state).
- Add deterministic RNG seam for roll actions (injectable source for tests).

**Files**
- `src/main.tsx`
- `src/store/store.ts`
- `src/store/hooks.ts`
- `src/store/gameState.ts`

**Acceptance**
- App boots with Redux provider.
- Typed hooks compile and are used by app code.
- No game mutations occur outside Redux actions.

### S2.2 Game Slice + History Ring Buffer
**Goal**
Implement core Stage 2 actions and undo/redo behavior safely.

**Tasks**
- Create `src/store/gameSlice.ts`.
- Implement actions: `startGame`, `rollDice`, `endTurn`, `undo`, `redo`.
- Implement history policy:
  - push snapshot before mutation
  - cap `history` at 20
  - clear `future` on new mutation
  - `undo`/`redo` swap present with stacks correctly
- Implement reducer-level legality handling for invalid actions via stable error state.

**Files**
- `src/store/gameSlice.ts`
- `src/store/gameState.ts`

**Tests**
- Add `src/__tests__/store/gameSlice.test.ts`:
  - `history` capped at 20
  - `future` cleared on fresh mutation
  - multi-step `undo` and `redo` correctness
  - invalid action leaves state unchanged and reports error

**Acceptance**
- Undo/redo mechanics are deterministic and pass reducer tests.
- History clears when a new game starts.

### S2.3 Contract-First Selectors
**Goal**
Lock selector contracts now so Stage 3 panels compose without rewrites.

**Tasks**
- Create `src/store/selectors.ts`.
- Add memoized selectors:
  - `selectTurnStatus`
  - `selectDicePanelModel`
  - `selectProductionPanelModel`
  - `selectBuildPanelModel`
  - `selectDevelopmentPanelModel`
  - `selectDiscardPanelModel`
  - `selectCanUndo`
  - `selectCanRedo`
  - `selectEndgameStatus`
- Ensure selector outputs contain:
  - current values
  - `isActionAllowed` style booleans
  - inline reason strings for disabled/invalid states

**Files**
- `src/store/selectors.ts`

**Tests**
- Add `src/__tests__/store/selectors.test.ts`:
  - selector shape contract tests
  - enabled/disabled condition coverage for Stage 2 actions
  - regression checks for action reason strings

**Acceptance**
- UI can rely on selectors without internal rule duplication.
- Selector contracts are test-locked.

### S2.4 Minimal Playable UI + Stage Gate
**Goal**
Ship a real playable baseline with no mocked reducers.

**Tasks**
- Replace placeholder panel in `src/App.tsx` with minimal controls:
  - `Start Game`
  - `Roll Dice`
  - `End Turn`
  - `Undo`
  - `Redo`
- Wire all controls through Redux actions/selectors only.
- Add inline error/status messaging from selector/reducer outputs.

**Files**
- `src/App.tsx`
- `src/store/selectors.ts`
- `src/store/gameSlice.ts`

**Tests**
- Add `src/__tests__/integration/stage2-minimal-playable.integration.test.ts`:
  - start game
  - roll dice
  - end turn
  - undo
  - redo
  - assert enabled/disabled transitions and visible error/status text
  - verify real store transitions (no mocked reducer path)

**Acceptance**
- One user can complete the Stage 2 minimal loop in UI.
- Undo/redo works through UI controls and not just reducer tests.

## Composition Rules (Non-Negotiable)
- Each slice includes reducer/action changes + selectors + tests in same PR.
- Validation source is reducer/engine outputs only; UI does not re-implement legality.
- No mock-only completion claims for any Stage 2 milestone.
- Keep canonical Stage 2 integration test green at all times.

## Recommended PR Breakdown
1. `stage2/store-foundation`
2. `stage2/game-slice-history`
3. `stage2/selectors-contracts`
4. `stage2/minimal-playable-ui`

## Per-PR Quality Gate
Run after each slice:
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`

## Stage 2 Exit Criteria
- Store/provider + typed hooks in place.
- `game` slice implements `startGame`, `rollDice`, `endTurn`, `undo`, `redo`.
- Undo/redo ring buffer capped at 20 and fully tested.
- Stage 3-facing selectors are implemented and contract-tested.
- Minimal playable UI loop works end-to-end against real Redux state.
- Full quality gate passes.
