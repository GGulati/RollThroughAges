# Stage 3 Implementation Breakdown

## Scope
Stage 3 delivers UI skeleton and mid-turn gameplay flows as vertical slices:
- real layout shell on Redux state
- dice decision + production resolution flow
- build-loop actions and validation
- stage-gate integration coverage for phase handoff and invalid actions

## Baseline Assumptions (Locked)
- First roll is automatic at turn start.
- Max rolls per turn includes that first roll (`3` total by default, `4` with Leadership).
- Dice showing skull are auto-locked and never rerollable.
- Random roll actions are non-undoable; deterministic mutations remain undoable.

## Slice Plan (Execution Order)

### S3.1 Layout Shell on Real State
**Goal**
Ship a routing-less shell that reads only real Redux state (no mock-only panel state).

**Tasks**
- Keep `src/App.tsx` backed by selectors for:
  - turn status
  - dice panel
  - production panel
  - build panel
  - development/discard placeholders
- Maintain tablet-first responsive layout with:
  - status/board region
  - actions region
  - action log region
- Ensure existing Stage 2 controls continue to function.

**Files**
- `src/App.tsx`
- `src/index.css`
- `src/store/selectors.ts`

**Acceptance**
- UI shell renders all planned panel regions.
- No game logic in component-local state.
- Stage 2 loop still works end-to-end.

### S3.2 Slice B: Dice Decision + Production
**Goal**
Make the dice decision and production phases interactive and validated.

**Tasks**
- Implement Redux actions/reducer paths:
  - `keepDie` (toggle for non-skull dice)
  - `selectProduction` (choice dice only)
  - `resolveProduction` (requires zero pending choices)
  - `allocateGood` (consumes pending goods)
- Extend selector contracts with panel-ready flags and reasons:
  - `canRoll`, `rerollsRemaining`
  - per-die choice metadata
  - pending choice count
  - can/cannot resolve production reason
- Update Dice/Production UI:
  - per-die controls
  - reroll affordance + remaining rerolls display
  - explicit lock state labels
  - inline reason messaging for invalid phase/choice states

**Files**
- `src/store/gameSlice.ts`
- `src/store/gameState.ts`
- `src/store/selectors.ts`
- `src/App.tsx`
- `src/index.css`

**Tests**
- Update/add reducer tests in `src/__tests__/store/gameSlice.test.ts` for:
  - keep/unlock behavior
  - pending-choice guard on production resolution
  - goods allocation decrement behavior
- Update selector contract tests in `src/__tests__/store/selectors.test.ts`.
- Keep stage-2 integration flow green in `src/__tests__/integration/stage2-minimal-playable.integration.test.tsx`.

**Acceptance**
- Player can complete roll -> decide -> resolve production -> allocate goods.
- Invalid paths are blocked with reducer-provided reasons.
- Skull dice cannot be rerolled or unlocked.

### S3.3 Slice C: Build Loop
**Goal**
Implement city/monument build actions with legality feedback.

**Tasks**
- Add reducer actions:
  - `buildCity`
  - `buildMonument`
- Validate in reducer/engine:
  - available workers
  - target existence and completion state
  - monument contention/player-count constraints
- Extend `selectBuildPanelModel`:
  - legal targets
  - disabled reasons per action/target
  - worker availability summary
- Add Build panel controls and inline legality feedback.

**Files**
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`
- `src/App.tsx`
- `src/index.css`

**Tests**
- Add reducer tests for legal/illegal city and monument builds.
- Add selector tests for build target availability and reason strings.

**Acceptance**
- Build actions mutate real store state and decrement workers correctly.
- Illegal build actions do not mutate state and return stable errors.

### S3.4 Stage Gate Integration
**Goal**
Lock composition between Dice -> Production -> Build phases and invalid-action guardrails.

**Tasks**
- Add integration test:
  - `roll -> decide -> resolve production -> build` handoff
  - invalid-action prevention assertions (phase mismatches, illegal targets)
- Ensure UI assertions are against real reducer/store transitions.

**Files**
- `src/__tests__/integration/stage3-flow.integration.test.tsx`
- optionally `src/__tests__/testUtils.ts` helpers if needed

**Acceptance**
- Stage 3 handoff flow passes in one test run with no reducer mocking.
- Invalid action attempts are visibly gated and state-safe.

## Recommended PR Breakdown
1. `stage3/layout-shell`
2. `stage3/slice-b-dice-production`
3. `stage3/slice-c-build-loop`
4. `stage3/stage-gate-integration`

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
  - artifacts saved under `output/playwright/`

## Stage 3 Exit Criteria
- All six panel regions are rendered from real selectors.
- Slice B actions (`keepDie`, `selectProduction`, `resolveProduction`, `allocateGood`) are reducer-validated and UI-wired.
- Slice C actions (`buildCity`, `buildMonument`) are reducer-validated and UI-wired.
- Stage 3 integration gate proves phase handoff and invalid-action prevention.
- All quality gates pass.
