export function getRerollEmoji(rerollsRemaining: number): string {
  if (rerollsRemaining <= 0) {
    return 'None';
  }
  return Array.from({ length: rerollsRemaining }, () => '🎲').join(' ');
}

export function getLockBadge(lockDecision: string): string {
  if (lockDecision === 'kept') {
    return '🔒 Locked (Kept)';
  }
  if (lockDecision === 'skull') {
    return '☠️ Locked (Skull)';
  }
  return '🔓 Unlocked';
}

export function getSkullDenotation(skulls: number): string {
  return Array.from({ length: skulls }, () => '☠️').join(' ');
}
