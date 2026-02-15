import { createSlice } from '@reduxjs/toolkit';
import { GameSliceState } from './gameState';

const initialState: GameSliceState = {
  game: null,
  lastError: null,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {},
});

export const gameReducer = gameSlice.reducer;
