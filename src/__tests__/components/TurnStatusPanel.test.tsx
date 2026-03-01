import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TurnStatusPanel, TurnStatusData } from '@/components/panels/TurnStatusPanel';

const BASE_TURN_STATUS: TurnStatusData = {
  isGameActive: true,
  round: 2,
  phase: 'build',
  activePlayerId: 'p1',
  activePlayerName: 'Player 1',
  activePlayerController: 'human',
  playerPoints: [
    {
      playerId: 'p1',
      playerName: 'Player 1',
      breakdown: {
        monuments: 3,
        developments: 2,
        bonuses: 1,
        penalties: 0,
        total: 6,
      },
      progress: {
        citiesBuilt: 3,
        citiesTotal: 7,
        developmentsBuilt: 1,
        developmentsGoal: 5,
        monumentsBuilt: 1,
        monumentsTotal: 5,
        monumentStatuses: [
          {
            monumentId: 'stepPyramid',
            monumentName: 'Step Pyramid',
            workersCommitted: 3,
            workerCost: 3,
            completed: true,
            completedOrder: 1,
          },
        ],
      },
    },
  ],
};

describe('TurnStatusPanel', () => {
  it('renders latest announcement in a live status region', () => {
    const { rerender } = render(
      <TurnStatusPanel
        className="panel"
        turnStatus={BASE_TURN_STATUS}
        controlsLockedByBot={false}
        botStepDelayMs={1000}
        canEndTurn={false}
        endTurnReason="End turn unavailable."
        canUndo={false}
        canRedo={false}
        latestAnnouncement="Phase changed to build."
        onEndTurn={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Phase changed to build.');

    rerender(
      <TurnStatusPanel
        className="panel"
        turnStatus={BASE_TURN_STATUS}
        controlsLockedByBot={false}
        botStepDelayMs={1000}
        canEndTurn={false}
        endTurnReason="End turn unavailable."
        canUndo={false}
        canRedo={false}
        latestAnnouncement="Development purchased."
        onEndTurn={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Development purchased.');
  });

  it('does not render a status region when no announcement is available', () => {
    render(
      <TurnStatusPanel
        className="panel"
        turnStatus={BASE_TURN_STATUS}
        controlsLockedByBot={false}
        botStepDelayMs={1000}
        canEndTurn={false}
        endTurnReason="End turn unavailable."
        canUndo={false}
        canRedo={false}
        latestAnnouncement={null}
        onEndTurn={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
  });
});
