import { useEffect, useRef, useState } from 'react';
import { BotAction, BotStrategy } from '@/game/bot';
import { GameState } from '@/game';
import { BotProfile } from '@/screens/types';

type UseBotTurnRunnerParams = {
  game: GameState | null;
  isGameOver: boolean;
  activePlayerController: 'human' | 'bot' | null;
  pauseBotActions: boolean;
  activeGameBotProfilesByPlayerId: Record<string, BotProfile>;
  configuredHeuristicBot: BotStrategy;
  standardHeuristicBot: BotStrategy;
  standardLookaheadBot: BotStrategy;
  botStepDelayMs: number;
  dispatchBotAction: (action: BotAction) => void;
};

export function useBotTurnRunner({
  game,
  isGameOver,
  activePlayerController,
  pauseBotActions,
  activeGameBotProfilesByPlayerId,
  configuredHeuristicBot,
  standardHeuristicBot,
  standardLookaheadBot,
  botStepDelayMs,
  dispatchBotAction,
}: UseBotTurnRunnerParams): { isBotTurn: boolean; controlsLockedByBot: boolean } {
  const botTimerRef = useRef<number | null>(null);
  const [isBotResolving, setIsBotResolving] = useState(false);
  const isBotTurn =
    Boolean(game) && !isGameOver && activePlayerController === 'bot';
  const controlsLockedByBot = isBotTurn && isBotResolving;

  useEffect(() => {
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }

    if (!isBotTurn || !game || pauseBotActions) {
      setIsBotResolving(false);
      return;
    }

    setIsBotResolving(true);
    botTimerRef.current = window.setTimeout(() => {
      const activePlayerId = game.state.turn.activePlayerId;
      const profile = activeGameBotProfilesByPlayerId[activePlayerId];
      const strategy =
        profile === 'heuristicStandard'
          ? standardHeuristicBot
          : profile === 'lookaheadStandard'
            ? standardLookaheadBot
            : configuredHeuristicBot;
      const action = strategy.chooseAction({ game });
      if (!action) {
        setIsBotResolving(false);
        return;
      }
      dispatchBotAction(action);
    }, botStepDelayMs);

    return () => {
      if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [
    activeGameBotProfilesByPlayerId,
    botStepDelayMs,
    configuredHeuristicBot,
    dispatchBotAction,
    game,
    isBotTurn,
    pauseBotActions,
    standardLookaheadBot,
    standardHeuristicBot,
  ]);

  return { isBotTurn, controlsLockedByBot };
}
