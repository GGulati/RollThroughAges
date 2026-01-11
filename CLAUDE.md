# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

First, plan changes & ask questions as needed. After writing code, write tests as well to ensure correctness & coverage.

## Development Commands

- **Start dev server**: `npm run dev`
- **Build**: `npm run build`
- **Run tests**: `npm test`
- **Watch tests**: `npm run test:watch`
- **Type checking**: `npm run typecheck`
- **Linting**: `npm run lint` (or `npm run lint:strict` for zero warnings)
- **Format code**: `npm run format:fix`

## Project Architecture

### Game Engine Structure
This is a **Roll Through the Ages** board game implementation using React + Redux Toolkit. The core game logic is modeled in TypeScript with immutable state management.

**Core Game Model** (`src/game/`):
- `game.ts` - Main game state interfaces, 6-phase turn system (RollDice → DecideDice → ResolveProduction → Build → Development → DiscardGoods)
- `dice.ts` - Die faces and resource production logic
- `goods.ts` - Goods tracking with value lookup tables
- `construction.ts` - Cities and monuments with worker requirements
- `disaster.ts` - Disaster effects and penalties
- `gameDefinitionConsts.ts` - Static game rules and configurations

**State Management**: Uses Redux Toolkit slices for players, game phases, and resources. Game state includes history tracking for undo/redo functionality.

### Development Stage
Currently in **Stage 1** (Core Rules Engine) per `planning/project.md`. The game model interfaces are defined but UI components are minimal placeholders. Next stages involve Redux integration, UI implementation, and bot AI.

### Key Architectural Decisions
- **Phase-driven gameplay**: Each turn progresses through 6 distinct phases with specific actions
- **Immutable state**: All game modifications go through Redux reducers
- **Type safety**: Strong TypeScript interfaces for all game entities
- **Modular design**: Game logic separated from UI concerns

### Alias Configuration
- `@/` maps to `src/` directory (configured in vite.config.ts)

### Testing Setup
- **Framework**: Vitest with jsdom environment
- **Setup file**: `vitest.setup.ts`
- **Coverage**: Text and lcov reporters enabled