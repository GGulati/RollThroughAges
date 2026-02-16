import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function rowText(label: RegExp): string {
  const labelNode = screen.getByText(label);
  return labelNode.closest('p')?.textContent ?? '';
}

describe('stage5 bot mode integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-runs a bot turn once and hands off to next player', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const user = userEvent.setup();
    renderWithStore();

    await user.selectOptions(screen.getByLabelText('Player 1'), 'heuristicStandard');
    await user.selectOptions(screen.getByLabelText('Bot Speed'), 'veryFast');
    await user.click(screen.getByRole('button', { name: 'Start Game' }));

    expect(rowText(/Controller:/)).toContain('bot');

    await waitFor(() => {
      expect(rowText(/Active Player:/)).toContain('Player 2');
    }, {
      timeout: 10000,
    });
    expect(rowText(/Controller:/)).toContain('human');
    const logBox = screen.getByLabelText('Action log history');
    if (!(logBox instanceof HTMLTextAreaElement)) {
      throw new Error('Expected action log to be a textarea element');
    }
    expect(logBox.value).toContain('[Player 1] Ended turn:');

    randomSpy.mockRestore();
  });

  it('does not double-run bot execution after handoff to human', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const user = userEvent.setup();
    renderWithStore();

    await user.selectOptions(screen.getByLabelText('Player 1'), 'heuristicStandard');
    await user.selectOptions(screen.getByLabelText('Bot Speed'), 'veryFast');
    await user.click(screen.getByRole('button', { name: 'Start Game' }));

    await waitFor(() => {
      expect(rowText(/Active Player:/)).toContain('Player 2');
    }, {
      timeout: 10000,
    });

    const logBox = screen.getByLabelText('Action log history');
    if (!(logBox instanceof HTMLTextAreaElement)) {
      throw new Error('Expected action log to be a textarea element');
    }
    const endedTurnMatches = logBox.value.match(/\[Player 1\] Ended turn:/g) ?? [];
    expect(endedTurnMatches).toHaveLength(1);

    await waitFor(() => {
      expect(rowText(/Active Player:/)).toContain('Player 2');
    }, {
      timeout: 1500,
    });
    const endedTurnMatchesAfterWait =
      logBox.value.match(/\[Player 1\] Ended turn:/g) ?? [];
    expect(endedTurnMatchesAfterWait).toHaveLength(1);

    randomSpy.mockRestore();
  });
});
