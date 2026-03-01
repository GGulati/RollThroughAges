import { GamePhase } from './game';

export type DomainEventType =
  | 'phase_transition'
  | 'dice_roll_started'
  | 'dice_roll_resolved'
  | 'die_lock_changed'
  | 'production_resolved'
  | 'penalty_applied'
  | 'construction_progressed'
  | 'construction_completed'
  | 'development_purchased'
  | 'discard_resolved'
  | 'turn_completed'
  | 'game_completed'
  | 'diagnostic';

export interface DomainEvent {
  id: string;
  type: DomainEventType;
  actorPlayerId: string | null;
  round: number | null;
  phase: GamePhase | null;
  payload: Record<string, unknown>;
  parentEventId?: string;
}

export interface EngineResult<TState> {
  nextState: TState;
  resolutionEvents: DomainEvent[];
  appliedEvents: DomainEvent[];
}

