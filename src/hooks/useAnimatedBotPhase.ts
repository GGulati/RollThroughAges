import { useEffect, useMemo, useRef, useState } from 'react';
import { GAME_PHASE_ORDER, GamePhase } from '@/game';

function getPhaseStepSequence(
  fromPhase: GamePhase,
  toPhase: GamePhase,
): GamePhase[] {
  const fromIndex = GAME_PHASE_ORDER.indexOf(fromPhase);
  const toIndex = GAME_PHASE_ORDER.indexOf(toPhase);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return [];
  }

  if (toIndex > fromIndex) {
    return GAME_PHASE_ORDER.slice(fromIndex + 1, toIndex + 1);
  }

  return [
    ...GAME_PHASE_ORDER.slice(fromIndex + 1),
    ...GAME_PHASE_ORDER.slice(0, toIndex + 1),
  ];
}

type UseAnimatedBotPhaseParams = {
  phase: GamePhase | null;
  enabled: boolean;
  stepDelayMs: number;
};

export function useAnimatedBotPhase({
  phase,
  enabled,
  stepDelayMs,
}: UseAnimatedBotPhaseParams): {
  displayedPhase: GamePhase | null;
  isAnimating: boolean;
} {
  const [displayedPhase, setDisplayedPhase] = useState<GamePhase | null>(phase);
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutIdsRef.current = [];

    if (!phase) {
      setDisplayedPhase(null);
      return;
    }

    if (!enabled) {
      setDisplayedPhase(phase);
      return;
    }

    if (displayedPhase === null) {
      setDisplayedPhase(phase);
      return;
    }

    const startPhase = displayedPhase ?? phase;
    if (startPhase === phase) {
      return;
    }

    const sequence = getPhaseStepSequence(startPhase, phase);
    if (sequence.length === 0) {
      setDisplayedPhase(phase);
      return;
    }

    sequence.forEach((stepPhase, index) => {
      const timeoutId = window.setTimeout(() => {
        setDisplayedPhase(stepPhase);
      }, stepDelayMs * (index + 1));
      timeoutIdsRef.current.push(timeoutId);
    });
  }, [displayedPhase, enabled, phase, stepDelayMs]);

  const isAnimating = useMemo(
    () => Boolean(enabled && phase && displayedPhase && phase !== displayedPhase),
    [displayedPhase, enabled, phase],
  );

  return { displayedPhase, isAnimating };
}
