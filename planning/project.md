## Project Plan

### Stage 1 – Core Rules Engine
- **S1.1 Data modeling**: Define `GameState`, `PlayerState`, `TurnState`, and enums for dice faces, goods, disasters.
- **S1.2 Phase reducers**: Implement pure functions for each of the six phases per rules at https://www.yucata.de/en/Rules/RollAges; cover edge cases (skull locking, overflow goods).
- **S1.3 Validation suite**: Create exhaustive unit tests for the engine with canned scenarios and regression fixtures.

### Stage 2 – Redux Integration
- **S2.1 Slice wiring**: Hook engine into Redux Toolkit slices and actions (`ROLL`, `CHOOSE_FOOD`, `BUILD`, etc.).
- **S2.2 History middleware**: Add bounded undo/redo stack plus devtools hooks.
- **S2.3 Selectors & derived data**: Memoized selectors for resource summaries, monument eligibility, endgame triggers.

### Stage 3 – UI Skeleton
- **S3.1 Layout shell**: Base routing-less shell with header, main board area, sidebar for actions/log.
- **S3.2 Phase panels**: Implement TurnDashboard, GoodsTrack, CityMonumentBoard, DevelopmentShop using mock data.
- **S3.3 Styling pass**: Apply Tailwind (or utility CSS) tokens, ensure responsive layout for tablet play.

### Stage 4 – Interactive Gameplay
- **S4.1 Wire actions**: Connect UI controls to Redux actions, ensure optimistic updates per phase sequencing.
- **S4.2 Validation UX**: Disable/enable buttons contextually, surface rule errors inline.
- **S4.3 Undo/redo UX**: Provide history controls and keyboard shortcuts, include visual diff of last change.

### Stage 5 – Bot & Modes
- **S5.1 Mode toggles**: Add menu to choose pass-and-play vs solo, manage per-player prompts/curtains.
- **S5.2 Bot strategy v1**: Implement deterministic heuristic bot module using selectors + thunks.
- **S5.3 Bot tuning/tests**: Simulate batches to validate bot legality and difficulty sliders.

### Stage 6 – Polish & Delivery
- **S6.1 Audio/feedback**: Light SFX for rolls, milestone completion confetti, accessibility review.
- **S6.2 QA matrix**: Cross-browser testing (Chrome, Edge, Safari), mobile landscape verification.
- **S6.3 Launch package**: Document rules references, write README + deployment docs, final performance sweep.

