import type { SuspendState } from '@ivt/schema';

// Format: v1|<count>|<hash>|<furthest>|<submitted 0|1>|<idx>=<id>,<id>,;<idx>=...
// count and hash (FNV-1a 32 of orderedIds) fingerprint the question list: a changed
// package never misattributes old answers, the state just fails to decode.
// Each choice id is percent-encoded (so it never contains | ; , = or %-ambiguity)
// and terminated by ',' so that [] and [''] stay distinct.
const PREFIX = 'v1';

const toIndex = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

function fingerprint(ids: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of ids.join('\u0000')) {
    for (const b of new TextEncoder().encode(ch)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function build(ids: string[], furthest: number, submitted: boolean, body: string): string {
  return `${PREFIX}|${ids.length}|${fingerprint(ids)}|${furthest}|${submitted ? 1 : 0}|${body}`;
}

export function encodeSuspend(s: SuspendState, orderedIds: string[], limit = 4096): string {
  const furthest = toIndex(s.furthest);
  const parts: string[] = [];
  orderedIds.forEach((id, i) => {
    const a = s.answers[id];
    if (Array.isArray(a)) parts.push(`${i}=${a.map((c) => encodeURIComponent(c) + ',').join('')}`);
  });
  const full = build(orderedIds, furthest, s.submitted, parts.join(';'));
  return full.length <= limit ? full : build(orderedIds, furthest, s.submitted, '');
}

export function decodeSuspend(raw: string, orderedIds: string[]): SuspendState | null {
  if (typeof raw !== 'string' || !raw) return null;
  const f = raw.split('|');
  if (f.length !== 6 || f[0] !== PREFIX) return null;
  const [, count, hash, fur, sub, body] = f as [string, string, string, string, string, string];
  if (count !== String(orderedIds.length) || hash !== fingerprint(orderedIds)) return null;
  if (!/^\d+$/.test(fur) || (sub !== '0' && sub !== '1')) return null;
  const answers: Record<string, string[]> = {};
  if (body) {
    for (const entry of body.split(';')) {
      const m = /^(\d+)=((?:[^,]*,)*)$/.exec(entry);
      if (!m) return null;
      let list: string[];
      try {
        list = m[2]!.split(',').slice(0, -1).map(decodeURIComponent);
      } catch {
        return null;
      }
      const id = orderedIds[Number(m[1])];
      if (id !== undefined) answers[id] = list;
    }
  }
  return { furthest: Number(fur), answers, submitted: sub === '1' };
}
