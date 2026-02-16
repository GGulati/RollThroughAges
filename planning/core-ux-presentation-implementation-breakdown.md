# Core UX & Presentation Implementation Breakdown

## Purpose
Elevate game feel (animation, layout, feedback clarity) as a **core product architecture** concern, not an optional polish layer.

This plan builds on existing engine/store flows by introducing a first-class event model and using it as the single source for:
- visual transitions and emphasis
- action log generation
- accessibility announcements
- bot/human pacing consistency

## Scope
- Event-driven UX contract from store transitions
- Rich visual feedback for dice, phase flow, penalties, and milestones
- Layout upgrades for clarity and scanability on desktop/tablet/mobile
- Optional 3D dice presentation, gated by settings
- Accessibility and deterministic testability preserved

## Non-Goals
- No rule changes to game mechanics
- No networked multiplayer or persistence work
- No animation-only logic that bypasses reducer/engine truth

## Architecture Principles
- **Single semantic source**: reducer/engine transitions emit canonical events.
- **Renderer is downstream only**: UI consumes events and state; it never infers hidden rules.
- **Deterministic behavior**: visuals are paced by settings and current controller speed.
- **Accessible by design**: reduced motion, screen-reader updates, and focus behavior are first-class outputs.

## Event Contract (Core)
Define typed event payloads for meaningful outcomes, e.g.:
- `phase_transition`
- `dice_roll_started`
- `dice_roll_resolved`
- `die_lock_changed`
- `production_resolved`
- `penalty_applied` (starvation/disaster details)
- `construction_progressed`
- `construction_completed`
- `development_purchased`
- `discard_resolved`
- `turn_completed`
- `game_completed`

Each event should include:
- actor player id
- turn/round context
- phase context
- deterministic payload fields needed by UI/log/a11y

## Slice Plan (Execution Order)

### CUX.1 Event Foundation
**Goal**
Create a shared event stream that is emitted by reducer transitions and consumable by selectors/UI.

**Tasks**
- Add event types in store/domain types.
- Add event queue/history field(s) in Redux game state.
- Emit events in existing actions without changing game rules.
- Add selector helpers for latest event(s), phase-scoped events, and turn events.

**Files**
- `src/store/gameState.ts`
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`
- optionally shared types under `src/game/`

**Tests**
- Reducer tests for event emission on key transitions.
- Sequence tests for one full turn.

**Acceptance**
- All major turn transitions emit structured events.
- No event emission depends on component-local state.

### CUX.2 Feedback Unification (Log + A11y)
**Goal**
Drive action log and screen-reader announcements from events.

**Tasks**
- Replace ad-hoc log string generation where possible with event-driven formatting.
- Add event-to-announcement mapping for key game outcomes.
- Keep player attribution and final outcome details consistent.

**Files**
- `src/store/gameSlice.ts`
- `src/store/selectors.ts`
- `src/App.tsx` and/or extracted UI modules

**Tests**
- Store tests for log lines from events (starvation/disaster/build/development).
- UI tests for announcement regions and message rendering.

**Acceptance**
- Action Log coverage is complete for all core penalties and outcomes.
- A11y announcements are synchronized with real transitions.

### CUX.3 Layout Redesign (Core Information Architecture)
**Goal**
Improve panel hierarchy and scanability while preserving phase correctness.

**Tasks**
- Redesign top-level layout regions for setup, active gameplay, and game-over review.
- Keep high-importance panels near active decision zones:
  - Production + Disaster reference
  - Build/Development side-by-side where practical
  - Action Log adjacent to discard/testing outcomes
- Define reusable card/table patterns for:
  - player score breakdown
  - developments/cities/monuments
  - AI testing results

**Files**
- `src/App.tsx`
- extracted components under `src/components/` (recommended)
- `src/index.css`

**Tests**
- Integration tests for panel visibility by phase.
- Responsive smoke assertions (desktop + mobile viewport snapshots).

**Acceptance**
- Active phase panel is always obvious.
- Critical information is visible without redundant text blocks.

### CUX.4 Motion System (2D First)
**Goal**
Introduce meaningful, consistent motion driven by domain events.

**Tasks**
- Define animation tokens/durations tied to bot speed and interaction pacing.
- Add transition patterns for:
  - dice roll resolve
  - lock/unlock
  - penalty/emphasis
  - completion milestones
- Ensure animations are interrupt-safe and do not block legal actions.

**Files**
- `src/index.css`
- motion utility/hooks under `src/hooks/` or `src/ui/`
- event-consuming panel components

**Tests**
- UI integration checks for event-driven class/state changes.
- Reduced-motion behavior tests.

**Acceptance**
- Motion improves comprehension of state changes.
- No rule/state regressions from animation orchestration.

### CUX.5 Optional 3D Dice Presentation
**Goal**
Offer enhanced dice visuals while preserving deterministic state and fallback paths.

**Tasks**
- Implement a 3D dice renderer mode (CSS 3D transforms or canvas-based) gated by settings.
- Bind die face settle states to emitted roll events.
- Provide fallback to current 2D representation when disabled or unsupported.

**Files**
- dice panel component(s)
- settings UI
- styling/renderer modules

**Tests**
- Settings tests for 2D/3D mode toggling.
- Playwright smoke snapshots for both modes.

**Acceptance**
- 3D mode is optional and does not alter gameplay logic.
- 2D fallback remains correct and fully supported.

### CUX.6 Stage Gate (Core UX)
**Goal**
Prove end-to-end composition: event emission -> rendering/log/a11y -> playable flow.

**Tasks**
- Add integration coverage for full-turn paths with penalties and builds.
- Add Playwright smoke protocol for:
  - setup screen
  - active gameplay turn
  - game over screen
  - desktop/mobile screenshots
- Capture console and ensure no runtime errors.

**Files**
- `src/__tests__/integration/` (new/updated tests)
- `planning/e2e-testing.md` (scenario updates)

**Acceptance**
- Full turn remains playable with no phase regressions.
- Event-driven log/visual/a11y outputs are consistent.

## Settings Additions (Recommended)
- `visualMode`: `standard2d` | `dice3d`
- `reducedMotion`: boolean (defaults to system preference)
- `animationIntensity`: `off` | `subtle` | `full`
- reuse existing bot speed as pacing input for auto-advanced transitions

## Risk Register
- **Risk**: Event duplication and noisy logs.
  - **Mitigation**: strict event taxonomy and formatter ownership.
- **Risk**: Animation race conditions across phase auto-skips.
  - **Mitigation**: transition queue keyed by event ids and turn context.
- **Risk**: Accessibility regressions.
  - **Mitigation**: reduced-motion and live-region checks in integration tests.
- **Risk**: App.tsx complexity growth.
  - **Mitigation**: component extraction with selector-based props.

## PR Breakdown
1. `core-ux/events-foundation`
2. `core-ux/events-log-a11y`
3. `core-ux/layout-redesign`
4. `core-ux/motion-system`
5. `core-ux/optional-3d-dice`
6. `core-ux/stage-gate-e2e`

## Quality Gate Per Slice
- `npm test -- --run`
- `npm run lint:strict`
- `npm run typecheck`
- Playwright smoke captures for UI-impacting slices

## Exit Criteria
- Event-driven UX architecture is in place and used by log/visual/a11y outputs.
- Layout supports fast decision-making across all phases.
- Motion and optional 3D dice improve clarity without impacting rules.
- Full-turn and game-over flows are validated in tests and Playwright smoke.
