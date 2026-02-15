import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { buildCity, resolveProduction } from '@/store/gameSlice';
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

describe('stage3 flow integration', () => {
  it('composes roll -> decide -> resolve production -> build with invalid-action guards', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const user = userEvent.setup();
    const store = renderWithStore();

    await user.click(screen.getByRole('button', { name: 'Start Game' }));

    const stateBeforeInvalidResolve = store.getState().game.game?.state;
    act(() => {
      store.dispatch(resolveProduction());
    });
    expect(store.getState().game.lastError?.code).toBe('INVALID_PHASE');
    expect(store.getState().game.game?.state).toEqual(stateBeforeInvalidResolve);

    const stateBeforeInvalidBuildPhase = store.getState().game.game?.state;
    act(() => {
      store.dispatch(buildCity({ cityIndex: 3 }));
    });
    expect(store.getState().game.lastError?.code).toBe('INVALID_PHASE');
    expect(store.getState().game.game?.state).toEqual(stateBeforeInvalidBuildPhase);

    expect(rowText(/Phase:/)).toContain('rollDice');

    const lockButtons = screen.getAllByRole('button', { name: /^Lock/ });
    expect(lockButtons).toHaveLength(3);
    await user.click(lockButtons[0]);
    await user.click(lockButtons[1]);
    await user.click(lockButtons[2]);

    expect(rowText(/Phase:/)).toContain('build');
    expect(rowText(/Rolls Used:/)).toContain('1/3');
    expect(rowText(/Pending choices:/)).toContain('0');

    const workersBeforeInvalidTarget =
      store.getState().game.game?.state.turn.turnProduction.workers ?? 0;
    act(() => {
      store.dispatch(buildCity({ cityIndex: 99 }));
    });
    expect(store.getState().game.lastError?.code).toBe('INVALID_BUILD_TARGET');
    expect(store.getState().game.game?.state.turn.turnProduction.workers).toBe(
      workersBeforeInvalidTarget,
    );

    const workersBeforeValidBuild =
      store.getState().game.game?.state.turn.turnProduction.workers ?? 0;
    const buildHeading = screen.getByRole('heading', { name: 'Build Panel' });
    const buildSection = buildHeading.closest('section');
    expect(buildSection).not.toBeNull();
    if (!buildSection) {
      throw new Error('Build panel section not found');
    }

    const cityButtons = within(buildSection)
      .getAllByRole('button')
      .filter((button) => (button.textContent ?? '').startsWith('City '));
    expect(cityButtons.length).toBeGreaterThan(0);

    await user.click(cityButtons[0]);
    const workersAfterValidBuild =
      store.getState().game.game?.state.turn.turnProduction.workers ?? 0;
    expect(workersAfterValidBuild).toBeLessThan(workersBeforeValidBuild);

    randomSpy.mockRestore();
  });

  it('shows updated stored goods after production auto-assign', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const user = userEvent.setup();
    renderWithStore();

    await user.click(screen.getByRole('button', { name: 'Start Game' }));
    const lockButtons = screen.getAllByRole('button', { name: /^Lock/ });
    await user.click(lockButtons[0]);
    await user.click(lockButtons[1]);
    await user.click(lockButtons[2]);

    expect(screen.getByText(/^Wood:/).textContent).not.toBe('Wood: 0');

    randomSpy.mockRestore();
  });
});
