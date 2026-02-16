# Stage 5 Implementation Breakdown

## Scope
Stage 5 adds game modes and bot opponents while preserving shared engine legality:
- pass-and-play vs bot mode setup
- deterministic bot decision policy using existing engine/store actions
- legality and difficulty tests for repeatable behavior

## Baseline Assumptions (Locked)
- Bot turns must use the same reducer/engine actions as human turns.
- Bot behavior must be deterministic for a given state and config (no hidden randomness).
- Undo/redo boundaries remain unchanged (random roll outcomes are still non-undoable).
- No separate rule path for bots; bots only choose legal actions from existing options.

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
Implement a deterministic bot that can take complete legal turns.

**Tasks**
- Add bot policy module with deterministic priorities by phase:
  - Dice: choose production choices, lock strategy, reroll decisions.
  - Build: allocate workers to highest-priority legal target.
  - Development: purchase at most one legal development by fixed heuristic.
  - Discard: keep goods by deterministic value order.
- Add a bot-turn driver that steps through phases until turn completion.
- Ensure bot never dispatches illegal actions; if no legal action exists, it must skip/advance legally.

**Files**
- `src/game/bot/` (new module folder)
- `src/store/gameSlice.ts` (or thunks/listener wiring)
- `src/store/selectors.ts` (bot-ready derived options, if needed)

**Tests**
- Unit tests for bot policy decisions per phase with fixture states.
- Integration tests for one full bot turn across key phase paths.

**Acceptance**
- Bot completes full turns without invalid-action errors.
- Behavior is stable/repeatable for the same input state.

### S5.3 Turn Automation + UI Integration
**Goal**
Run bot turns automatically when the active player is a bot, while keeping UI understandable.

**Tasks**
- Trigger bot execution when turn changes to bot-controlled player.
- Add clear UX cues:
  - active player controller indicator
  - optional "Bot is taking turn..." status
  - action log entries with bot player attribution
- Prevent duplicate bot execution on rerenders/reselects.
- Keep human controls disabled only when bot is actively resolving actions.

**Files**
- `src/App.tsx`
- `src/store/gameSlice.ts` (or middleware/listener)
- `src/store/selectors.ts`

**Tests**
- Integration test for human -> bot handoff and bot -> human handoff.
- Regression tests ensuring no double-apply bot actions.

**Acceptance**
- Bot turns auto-run once per bot turn.
- UI remains responsive and phase-consistent during bot execution.

### S5.4 Difficulty Profiles + Legality Guardrails
**Goal**
Add deterministic difficulty profiles without compromising legal play.

**Tasks**
- Define difficulty presets (for example `easy`, `standard`, `hard`) as policy weights/priorities.
- Ensure each preset remains deterministic (no random tie-breaking).
- Add legality guard wrapper that rejects/recovers from invalid planned moves.
- Add simulation harness for repeated bot-vs-bot runs to detect illegal-action regressions.

**Files**
- `src/game/bot/policies.ts`
- `src/game/bot/simulator.ts` (or tests-only utility)
- `src/__tests__/bot/`

**Tests**
- Bot legality suite across difficulties.
- Determinism suite: same state + difficulty -> same chosen action sequence.

**Acceptance**
- All difficulty profiles produce legal turns.
- Determinism and legality tests pass consistently.

### S5.5 Stage Gate
**Goal**
Prove Stage 5 composition works end-to-end with mixed controllers.

**Tasks**
- Add stage-gate integration tests:
  - start mixed human/bot game
  - complete at least one full human turn and one full bot turn
  - verify phase progression, action log attribution, and no invalid bot actions
- Add Playwright smoke scenario covering one observed bot turn in UI.

**Files**
- `src/__tests__/integration/stage5-bot-mode.integration.test.tsx`
- `planning/e2e-testing.md` (reference scenario additions if needed)

**Acceptance**
- Mixed-mode gameplay works end-to-end.
- Bot execution is legal, deterministic, and visible to players.

## Recommended PR Breakdown
1. `stage5/mode-setup`
2. `stage5/bot-policy-v1`
3. `stage5/bot-turn-automation`
4. `stage5/difficulty-and-legality`
5. `stage5/stage-gate`

## Per-Slice Quality Gate
Run after each slice:
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`
- For UI-impacting slices, run Playwright smoke and capture artifacts in `output/playwright/`.

## Stage 5 Exit Criteria
- Mixed human/bot setup is configurable and persisted in game start flow.
- Deterministic bot can complete full legal turns via existing reducer/engine actions.
- Bot automation across turn boundaries is stable (no duplicate execution).
- Difficulty presets are deterministic and legality-tested.
- Stage 5 integration gate passes with mixed-controller end-to-end coverage.
