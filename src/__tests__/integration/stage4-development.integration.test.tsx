import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
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

describe('stage4 development integration', () => {
  it('purchases a development from the development panel', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.67); // 7 coins
    const user = userEvent.setup();
    const store = renderWithStore();

    await user.click(screen.getByRole('button', { name: 'Start Game' }));
    const lockButtons = screen.getAllByRole('button', { name: /^Lock/ });
    await user.click(lockButtons[0]);
    await user.click(lockButtons[1]);
    await user.click(lockButtons[2]);

    const coinsBefore = store.getState().game.game?.state.turn.turnProduction.coins ?? 0;
    const leadershipCard = screen
      .getByText(/Leadership \(10🪙, \+2 VP\)/i)
      .closest('article');
    expect(leadershipCard).not.toBeNull();
    if (!leadershipCard) {
      throw new Error('Leadership card not found');
    }
    await user.click(within(leadershipCard).getByRole('button', { name: 'Buy Development' }));

    const coinsAfter = store.getState().game.game?.state.turn.turnProduction.coins ?? 0;
    expect(coinsAfter).toBeLessThan(coinsBefore);
    expect(screen.getByText(/Owned:/).textContent?.toLowerCase()).toContain(
      'leadership',
    );

    randomSpy.mockRestore();
  });
});
