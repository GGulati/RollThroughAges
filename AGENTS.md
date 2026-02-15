# Repository Guidelines

## Project Structure & Module Organization
This repository is a client-only Roll Through the Ages app built with Vite, React, and TypeScript.

- `src/game/`: core game model and rule definitions.
- `src/game/engine/`: phase resolution and scoring logic (`*Engine.ts`).
- `src/__tests__/engine/`: rule-engine unit/integration tests.
- `src/App.tsx`, `src/main.tsx`: UI shell and app entry.
- `planning/`: product docs (`overview.md`, `project.md`, `requirements.md`).
- `dist/`: generated build output.

## Build, Test, and Development Commands
Run from repo root:

- `npm run dev`: start local dev server.
- `npm run build`: build production bundle to `dist/`.
- `npm run preview`: preview production build.
- `npm run typecheck`: run TypeScript checks.
- `npm run lint` / `npm run lint:strict`: run ESLint.
- `npm run format` / `npm run format:fix`: check or apply Prettier formatting.
- `npm test` / `npm run test:watch`: run Vitest once or in watch mode.

## Coding Style & Naming Conventions
- TypeScript-first; keep rules logic separate from UI code.
- Prettier conventions: 2 spaces, single quotes, semicolons, trailing commas, 90 char print width.
- Follow ESLint React hooks and TypeScript rules.
- Use `PascalCase` for components, `camelCase` for functions/variables, `*Engine.ts` for engine modules.
- Prefix intentionally unused values with `_`.

## Testing Guidelines
- Test framework: Vitest (`jsdom`) with Testing Library (`vitest.setup.ts`).
- Test files use `*.test.ts`; integration tests may use names like `gameFlow.integration.test.ts`.
- Add/update tests for all rules changes.
- Before PR: run `npm test`, `npm run lint:strict`, `npm run typecheck`.

## Commit & Pull Request Guidelines
- Follow existing commit style: short imperative subject lines (for example, `Fix engine bugs`).
- Keep commits focused by concern (engine logic, tests, formatting).
- PRs should include behavior summary, linked task/issue, test results, and UI screenshots.

## Architecture & Planning References
Use these as source-of-truth when work conflicts:

- `planning/overview.md`: architecture direction.
- `planning/project.md`: staged roadmap and current scope.
- `planning/requirements.md`: locked gameplay flow, undo/redo limits, accessibility requirements.

## Planning Stages (Execution Order)
Work in stage order unless explicitly directed otherwise.

1. **Stage 1 - Core Rules Engine**
- Data modeling (`GameState`, `PlayerState`, `TurnState`, enums/types).
- Pure phase logic for roll, decisions, production/feeding/disasters, build, development, discard.
- Engine test coverage and regression fixtures.

2. **Stage 2 - Redux Integration**
- Wire engine through Redux slices/actions.
- Add bounded undo/redo history (target: 20 mutations).
- Implement selectors for derived game state and endgame triggers.

3. **Stage 3 - UI Skeleton**
- Build layout shell and phase panels.
- Use mock data where needed while wiring views.
- Keep responsive tablet-first behavior.

4. **Stage 4 - Interactive Gameplay**
- Connect UI actions to Redux/engine flows.
- Add validation UX (disabled controls + inline errors).
- Add undo/redo controls and keyboard shortcuts.

5. **Stage 5 - Bot & Modes**
- Add pass-and-play vs bot mode controls.
- Implement deterministic bot behavior using shared rules.
- Add legality and difficulty tests.

6. **Stage 6 - Polish & Delivery**
- Accessibility and feedback polish.
- Cross-browser/mobile QA.
- Final docs and release readiness.

## Developer Workflow
Use this workflow for every non-trivial change:

1. **Read scope first**
- Review relevant files in `planning/` and affected engine/UI modules before editing.

2. **Implement in small slices**
- Make focused changes by concern (rules, state wiring, UI, tests).
- Prefer pure functions and predictable state transitions.

3. **Test immediately**
- Run targeted tests for touched modules first.
- Then run full checks before commit:
  - `npm test -- --run`
  - `npm run lint:strict`
  - `npm run typecheck`

4. **Review diff quality**
- Ensure no unrelated file churn.
- Keep naming/style consistent with existing modules.

5. **Commit workflow**
- Stage only intended files.
- Use clear imperative commit subjects.
- Prefer one logical change per commit.
- Example flow:
  - `git add <files>`
  - `git commit -m "Fix production phase edge cases"`

6. **PR workflow**
- Summarize what changed and why.
- Include test commands/results.
- Include screenshots for UI-impacting changes.
