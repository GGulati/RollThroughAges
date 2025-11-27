## Requirements Lock

### Game Modes
- Pass-and-play for 2–4 human players sharing one device; UI exposes turn handoff prompt.
- Solo vs deterministic bot that uses the same rules engine and difficulty toggles that adjust heuristics only.
- No online or persistence requirements; refreshing restarts the session.

### Core Gameplay Flow
- Follow Yucata Roll Through the Ages phases strictly: roll, reroll, feed, disasters, build, end-of-turn upkeep.
- Dice pool options (workers, goods, coins, skulls) must match official die faces; skulls trigger disasters immediately after feeding.
- Monument and development availability matches physical game costs including prerequisites, caps, and shared builds.

### State & Undo
- Entire game state lives in Redux Toolkit slices; no local storage persistence.
- Built-in undo/redo stack (bounded to last 20 mutations) available during a session; history clears on refresh or when a game finishes.
- Every phase action (roll, allocate goods, build, buy) is undoable unless it resolves hidden bot decisions; bot turns expose a summarized history entry instead.

### Bot Expectations
- Deterministic heuristic bot so repeat runs with the same seed reproduce outcomes.
- Bot obeys all rules via shared selectors/actions; no privileged moves.
- Difficulty slider adjusts decision weights (e.g., prioritize food vs. monuments) but never cheats with dice.

### UI & Accessibility
- Single-page layout with responsive design for tablets in landscape orientation.
- Action log and per-phase panels provide affordances; buttons disabled when an action is invalid with inline messaging.
- Keyboard shortcuts for undo/redo, focus outlines, and screen-reader labels for dice, goods tracks, and monuments.

### Testing & Quality
- Vitest unit tests for rules engine reducers, with fixtures covering skull combos, goods overflow, monument contention, and endgame triggers.
- React Testing Library coverage for critical UI flows (dice roll, feeding, building, undo).
- ESLint + Prettier enforced via npm scripts and CI-ready commands.

