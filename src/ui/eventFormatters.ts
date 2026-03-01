import { DomainEvent, GameState } from '@/game';
import { formatResourceLabel } from '@/utils/gameUiFormatters';

function toSafeString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

function getPlayerName(game: GameState, playerId: string | null): string {
  if (!playerId) {
    return 'System';
  }
  return game.settings.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function toPlayerNames(game: GameState, indices: unknown): string {
  if (!Array.isArray(indices)) {
    return 'no players';
  }
  const names = indices
    .map((value) => Number(value))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < game.state.players.length)
    .map((index) => {
      const player = game.state.players[index];
      return getPlayerName(game, player?.id ?? null);
    });
  return names.length > 0 ? names.join(', ') : 'no players';
}

export function formatEventForLog(event: DomainEvent, game: GameState): string | null {
  switch (event.type) {
    case 'phase_transition':
      return `Phase ${toSafeString(event.payload.fromPhase, '?')} -> ${toSafeString(event.payload.toPhase, '?')}.`;
    case 'dice_roll_started':
      return 'Started dice roll.';
    case 'dice_roll_resolved':
      return `Dice resolved (pending choices: ${toSafeString(event.payload.pendingChoices, '0')}).`;
    case 'die_lock_changed':
      return `Die ${Number(event.payload.dieIndex ?? -1) + 1} lock ${toSafeString(event.payload.from, '?')} -> ${toSafeString(event.payload.to, '?')}.`;
    case 'production_resolved':
      return `Production resolved: food +${Number(event.payload.food ?? 0)}, coins +${Number(event.payload.coins ?? 0)}, workers +${Number(event.payload.workers ?? 0)}, goods +${Number(event.payload.goods ?? 0)}, skulls ${Number(event.payload.skulls ?? 0)}.`;
    case 'penalty_applied':
      if (event.payload.kind === 'foodShortage') {
        return `Food shortage: -${Number(event.payload.amount ?? 0)} ${formatResourceLabel('VP')}.`;
      }
      if (event.payload.kind === 'disasterImmunity') {
        const sourceText = event.payload.source
          ? ` via ${toSafeString(event.payload.source, 'effect')}`
          : '';
        return `Disaster penalty prevented for ${toPlayerNames(game, [event.payload.targetPlayerIndex])}${sourceText}.`;
      }
      if (event.payload.kind === 'disaster') {
        return `${toSafeString(event.payload.disasterName ?? event.payload.disasterId, 'Disaster')} applied to ${toPlayerNames(game, event.payload.targetPlayerIndices)}.`;
      }
      return 'Penalty applied.';
    case 'construction_progressed':
      return 'Construction progressed.';
    case 'construction_completed':
      return 'Construction completed.';
    case 'development_purchased':
      return `Purchased development ${toSafeString(event.payload.developmentId, 'unknown')}.`;
    case 'discard_resolved':
      return `Discard resolved (discarded ${Number(event.payload.discarded ?? 0)} goods).`;
    case 'turn_completed':
      return `Turn completed (${getPlayerName(game, event.actorPlayerId)}).`;
    case 'game_completed':
      return 'Game completed.';
    case 'diagnostic':
      return `Diagnostic: ${toSafeString(event.payload.reason, 'event pipeline cap reached')}.`;
    default:
      return null;
  }
}

export function formatEventForAnnouncement(
  event: DomainEvent,
  game: GameState,
): string | null {
  switch (event.type) {
    case 'phase_transition':
      return `Phase changed to ${toSafeString(event.payload.toPhase, 'unknown')}.`;
    case 'production_resolved':
      return `Production resolved for ${getPlayerName(game, event.actorPlayerId)}.`;
    case 'dice_roll_resolved':
      return 'Dice resolved.';
    case 'penalty_applied':
      if (event.payload.kind === 'foodShortage') {
        return `Food shortage penalty applied.`;
      }
      if (event.payload.kind === 'disasterImmunity') {
        return 'Disaster penalty prevented.';
      }
      if (event.payload.kind === 'disaster') {
        return `${toSafeString(event.payload.disasterName, 'Disaster')} resolved.`;
      }
      return 'Penalty applied.';
    case 'construction_completed':
      return 'Construction completed.';
    case 'development_purchased':
      return 'Development purchased.';
    case 'turn_completed':
      return 'Turn completed.';
    default:
      return null;
  }
}
