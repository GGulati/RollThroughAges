import { configureStore } from '@reduxjs/toolkit';
import { gameReducer } from './gameSlice';

export function createAppStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredPaths: ['game.game'],
        },
      }),
  });
}

export const store = createAppStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
