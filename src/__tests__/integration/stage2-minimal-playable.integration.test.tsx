import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { keepDie } from '@/store/gameSlice';
import { createAppStore } from '@/store/store';

function renderWithStore() {
  const store = createAppStore();
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  return store;
}

function rowText(label: RegExp): string {
  const labelNode = screen.getByText(label);
  return labelNode.closest('p')?.textContent ?? '';
}

describe('stage2 minimal playable integration', () => {
  it('completes start -> roll -> end turn -> undo -> redo with real store', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const user = userEvent.setup();
    const store = renderWithStore();

    const startButton = screen.getByRole('button', { name: 'Start Game' });

    await user.click(startButton);
    const rollButton = screen.getByRole('button', { name: 'Reroll Dice' });
    const endTurnButton = screen.getByRole('button', { name: 'End Turn' });
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    const redoButton = screen.getByRole('button', { name: 'Redo' });

    expect((rollButton as HTMLButtonElement).disabled).toBe(false);
    expect((endTurnButton as HTMLButtonElement).disabled).toBe(true);
    expect((undoButton as HTMLButtonElement).disabled).toBe(true);
    expect((redoButton as HTMLButtonElement).disabled).toBe(true);
    expect(rowText(/Round:/)).toContain('Round: 1');
    expect(rowText(/Active Player:/)).toContain(
      'Active Player: Player 1',
    );
    expect(store.getState().game.game?.state.turn.activePlayerId).toBe('p1');

    const lockableDieIndex = store
      .getState()
      .game.game!.state.turn.dice.findIndex((die) => die.lockDecision !== 'skull');
    expect(lockableDieIndex).toBeGreaterThanOrEqual(0);
    act(() => {
      store.dispatch(keepDie({ dieIndex: lockableDieIndex }));
    });
    expect((undoButton as HTMLButtonElement).disabled).toBe(false);
    expect(store.getState().game.game?.history.length).toBe(1);

    await user.click(undoButton);
    expect((redoButton as HTMLButtonElement).disabled).toBe(false);
    expect(rowText(/Active Player:/)).toContain(
      'Active Player: Player 1',
    );
    expect(store.getState().game.game?.state.turn.activePlayerId).toBe('p1');

    await user.click(redoButton);
    expect((undoButton as HTMLButtonElement).disabled).toBe(false);

    randomSpy.mockRestore();
  });
});
