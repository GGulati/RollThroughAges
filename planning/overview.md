## Project Overview

- **Stack**: `Vite + React + TypeScript` for a fast dev loop and type-safe UI.
- **State**: `Redux Toolkit` slices for players, dice, goods, monuments, developments, disasters, and a phase state machine; selectors drive derived data.
- **Modes**: Client-only play with pass-and-play or solo vs. bot toggled purely through Redux; no routing required beyond simple view switches.
- **Undo/Redo**: History-aware middleware keeps a ring buffer of recent states so players can roll back within the current session; history clears on refresh.
- **Bot Logic**: Encapsulated heuristics layer invoked via Redux thunks; deterministic decision-making so test runs are reproducible.
- **Persistence**: None; state lives entirely in memory and restarting the app begins a fresh game.
- **UI Toolkit**: Utility-first CSS (e.g., Tailwind) for quick layout of dice pools, goods tracks, and phase controls; no animations needed.
- **Testing**: `Vitest`/`Jest` for reducers and rule validation, `React Testing Library` for phase rendering checks.
- **Rule Engine**: Pure TypeScript functions for each game phase per the official Yucata rules, shared by UI and bot for consistency.

