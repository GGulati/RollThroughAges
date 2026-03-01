import { useEffect, useState } from 'react';

export function useEventPulse(
  eventId: string | null,
  durationMs: number,
): boolean {
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      return;
    }
    setActiveEventId(eventId);
    const timeoutId = window.setTimeout(() => {
      setActiveEventId((current) => (current === eventId ? null : current));
    }, durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, eventId]);

  return activeEventId != null && activeEventId === eventId;
}
