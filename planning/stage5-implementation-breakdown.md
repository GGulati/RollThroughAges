# Stage 5 Implementation Breakdown

## Scope
Stage 5 adds game modes and bot opponents while preserving shared engine legality:
- pass-and-play vs bot mode setup
- engine-first bot core that can run fully headless (no Redux/UI dependency)
- thin Redux adapter for human-bot UI orchestration
- pluggable bot strategies (multiple decision approaches)
- legality, determinism, and performance tests for repeatable behavior

## Baseline Assumptions (Locked)
- Bot turns must use the same reducer/engine actions as human turns.
- Bot core must depend on engine/domain only; Redux is adapter-only.
- Bot behavior must be deterministic for a given state and config (no hidden randomness).
- Undo/redo boundaries remain unchanged (random roll outcomes are still non-undoable).
- No separate rule path for bots; bots only choose legal actions from existing options.
- Strategy selection must be data-driven (bot type/profile per player).

## Bot Strategy Families (Target Support)
Stage 5 framework should support these strategy types without rewriting turn orchestration:
- `heuristic`: fixed scoring function / deterministic priorities per phase.
- `risk-aware heuristic`: heuristic with stronger disaster/shortage penalties.
- `lookahead`: bounded expectimax-style search with explicit chance probabilities and EV/risk utility.
- `hybrid`: rules/heuristics for most phases with selective lookahead for dice decisions.

## Shared Platform Changes Needed (Cross-Cutting)
These are required regardless of chosen bot type.
- **Engine action interface/adapter**:
  - bot chooses engine-level actions (not Redux actions)
  - shared action application path for headless and UI modes
- **Bot strategy interface**:
  - single `chooseAction(context)` contract
  - stable input/output types for all phases
  - strict legality validation before dispatch
- **Action candidate generator**:
  - reusable legal action enumeration by phase
  - shared between heuristic/lookahead/hybrid bots
- **Evaluation context builder**:
  - normalized features (risk, VP delta, economy, race pressure)
  - no direct UI coupling
- **Chance/utility model for lookahead**:
  - explicit probability model for dice outcomes at chance nodes
  - EV-first utility with risk-adjusted penalties (for example downside/worst-case weighting)
  - deterministic tie-break ordering for equal-utility actions
- **Bot profile config**:
  - per-player strategy + difficulty + tuning params
  - serializable in game setup state
- **Execution safety wrapper**:
  - guards against invalid actions
  - fallback behavior when no legal action is returned
- **Headless turn/game runner**:
  - pure loop that runs bot-vs-bot games using engine state transitions only
  - no `App.tsx`/Redux dependency
- **Observability hooks**:
  - action-log reason tags (`why action chosen`)
  - optional debug trace mode for bot decisions
- **Perf guardrails**:
  - max node/evaluation budget per decision
  - timeout fallback to deterministic heuristic

## Slice Plan (Execution Order)

### S5.1 Mode Setup + Player Configuration
**Goal**
Allow starting games with a mix of human and bot controllers.

**Tasks**
- Extend start-game UI/config to choose controller per seat (`human` or `bot`).
- Persist controller choice in `GameSettings.players`.
- Add selector model for mode configuration summary.
- Keep default behavior simple (all human unless explicitly changed).

**Files**
- `src/App.tsx`
- `src/store/selectors.ts`
- `src/game/game.ts`
- `src/game/gameDefinitionConsts.ts` (if defaults/helpers need updates)

**Tests**
- Selector tests for mixed controller setup rendering.
- Store test verifying `startGame` persists controllers correctly.

**Acceptance**
- User can start 2-4 player games with any human/bot mix.
- Active controller is visible in turn status.

### S5.2 Deterministic Bot Policy (v1)
**Goal**
Implement engine-only bot platform interfaces and first strategy implementation.

**Tasks**
- Add `BotStrategy` interface and action-candidate generator.
- Add bot decision context/evaluation helpers.
- Add engine-level bot action adapter (`choose -> validate -> apply`) with no store/UI coupling.
- Implement first strategy (`heuristic-standard`) with deterministic priorities by phase:
  - Dice: choose production options, lock strategy, reroll decisions.
  - Build: allocate workers to highest-priority legal target.
  - Development: purchase at most one legal development by deterministic scoring.
  - Discard: keep goods by deterministic value order.
- Add bot-turn driver that steps through phases until turn completion.
- Ensure bot never dispatches illegal actions; if no legal action exists, it must skip/advance legally.

**Files**
- `src/game/bot/` (new module folder)
- `src/game/engine/` (shared action application helpers if needed)

**Tests**
- Unit tests for bot policy decisions per phase with fixture states.
- Integration tests for one full bot turn via engine-only harness.

**Acceptance**
- Bot platform compiles with one concrete strategy.
- Bot completes full turns without invalid-action errors.
- Behavior is stable/repeatable for the same input state and profile config.
- Bot can run headlessly without Redux/UI.

### S5.3 Turn Automation + UI Integration
**Goal**
Add thin Redux/UI orchestration for human-bot play while reusing engine bot core.

**Tasks**
- Trigger bot execution when turn changes to bot-controlled player via adapter calls into engine bot core.
- Add clear UX cues:
  - active player controller indicator
  - optional "Bot is taking turn..." status
  - action log entries with bot player attribution
- Prevent duplicate bot execution on rerenders/reselects.
- Keep human controls disabled only when bot is actively resolving actions.

**Files**
- `src/App.tsx`
- `src/store/gameSlice.ts` (or middleware/listener)
- `src/store/selectors.ts` (UI status only)

**Tests**
- Integration test for human -> bot handoff and bot -> human handoff.
- Regression tests ensuring no double-apply bot actions.

**Acceptance**
- Bot turns auto-run once per bot turn.
- UI remains responsive and phase-consistent during bot execution.

### S5.4 Difficulty Profiles + Legality Guardrails
**Goal**
Add multiple bot types/profiles without compromising legal play.

**Tasks**
- Define profile matrix as `strategyType + difficulty` (for example):
  - `heuristic/easy`, `heuristic/standard`, `heuristic/hard`
  - `risk-aware/standard`
  - `lookahead/hard` (bounded node/evaluation budget with EV/risk utility)
- Ensure each profile remains deterministic for same state/profile config.
- Add legality guard wrapper that rejects/recovers from invalid planned moves.
- Add deterministic evaluation harness for repeated bot-vs-bot runs:
  - illegal-action regression detection
  - performance budget checks
  - profile behavior snapshots

**Files**
- `src/game/bot/policies.ts`
- `src/game/bot/evaluator.ts` (or tests-only utility)
- `src/__tests__/bot/`

**Tests**
- Bot legality suite across strategies/profiles.
- Determinism suite: same state + profile -> same chosen action sequence.
- EV/risk suite: lookahead choices match expected utility priorities.
- Performance suite: decision budgets respected under repeated evaluations.

**Acceptance**
- Multiple strategy families run through same bot interface.
- All profiles produce legal turns.
- Determinism, legality, and budget tests pass consistently.

### S5.5 Stage Gate
**Goal**
Prove Stage 5 composition works end-to-end with mixed controllers.

**Tasks**
- Add engine-only stage-gate tests:
  - run at least one full bot-vs-bot game headlessly
  - verify legal progression and deterministic outcomes for fixed profile
- Add stage-gate integration tests:
  - start mixed human/bot game
  - complete at least one full human turn and one full bot turn
  - verify phase progression, action log attribution, and no invalid bot actions
- Add Playwright smoke scenario covering one observed bot turn in UI.

**Files**
- `src/__tests__/integration/stage5-headless-bot.integration.test.ts`
- `src/__tests__/integration/stage5-bot-mode.integration.test.tsx`
- `planning/e2e-testing.md` (reference scenario additions if needed)

**Acceptance**
- Headless bot execution works without Redux/UI wiring.
- Mixed-mode gameplay works end-to-end.
- Bot execution is legal, deterministic, and visible to players.

## Recommended PR Breakdown
1. `stage5/mode-setup`
2. `stage5/bot-interface-and-candidates`
3. `stage5/heuristic-standard-bot`
4. `stage5/bot-turn-automation`
5. `stage5/multi-profile-and-legality`
6. `stage5/stage-gate`

## Per-Slice Quality Gate
Run after each slice:
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`
- For UI-impacting slices, run Playwright smoke and capture artifacts in `output/playwright/`.

## Stage 5 Exit Criteria
- Mixed human/bot setup is configurable and persisted in game start flow.
- Engine-first bot core supports fully headless bot execution.
- Redux/UI bot orchestration is a thin adapter over the same core.
- Bot framework supports multiple strategy families through one interface.
- At least two distinct bot approaches are implemented (for example heuristic + risk-aware, or heuristic + lookahead).
- Deterministic bot profiles can complete full legal turns via existing reducer/engine actions.
- Bot automation across turn boundaries is stable (no duplicate execution).
- Strategy/difficulty profiles are deterministic, legality-tested, and budget-checked.
- Stage 5 integration gate passes with mixed-controller end-to-end coverage.
