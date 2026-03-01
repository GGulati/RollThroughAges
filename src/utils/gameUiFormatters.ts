const RESOURCE_EMOJI_BY_KEY: Record<string, string> = {
  food: '🍖',
  worker: '👷',
  workers: '👷',
  coin: '🪙',
  coins: '🪙',
  good: '📦',
  goods: '📦',
  skull: '☠️',
  skulls: '☠️',
  wood: '🪵',
  stone: '🪨',
  ceramic: '🏺',
  fabric: '🧵',
  spearhead: '🗡️',
  spearheads: '🗡️',
  vp: '🏆',
  'victory point': '🏆',
  'victory points': '🏆',
};

function normalizeResourceKey(resource: string): string {
  return resource.trim().toLowerCase();
}

export function getResourceEmoji(resource: string): string {
  const normalized = normalizeResourceKey(resource);
  return RESOURCE_EMOJI_BY_KEY[normalized] ?? '📦';
}

export function formatResourceLabel(resource: string): string {
  return `${getResourceEmoji(resource)} ${resource}`;
}

const RESOURCE_WORDS = [
  'food',
  'workers',
  'worker',
  'coins',
  'coin',
  'goods',
  'good',
  'skulls',
  'skull',
  'wood',
  'stone',
  'ceramic',
  'fabric',
  'spearheads',
  'spearhead',
  'vp',
];

export function formatResourceTextWithEmojis(text: string): string {
  let result = text;
  for (const word of RESOURCE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(regex, (match) => formatResourceLabel(match));
  }
  return result;
}

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
    return '☠️ Locked';
  }
  return '🔓 Unlocked';
}

export function getSkullDenotation(skulls: number): string {
  return Array.from({ length: skulls }, () => '☠️').join(' ');
}
