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

/** Reads "1:05", "1:02:05" or plain seconds "65"; null for anything else (seconds and minutes after a colon are 00-59). */
export function parseTime(text: string): number | null {
  const m = /^(?:(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d)|(\d+))$/.exec(text.trim());
  if (!m) return null;
  if (m[5] !== undefined) return Number(m[5]);
  if (m[1] !== undefined) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[4]);
  return Number(m[3]) * 60 + Number(m[4]);
}
