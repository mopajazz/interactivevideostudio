/** 212 -> "3:32", 3725 -> "1:02:05". */
export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** ISO 8601 duration for <time dateTime>. */
export const isoDuration = (seconds: number) => `PT${Math.floor(seconds)}S`;
