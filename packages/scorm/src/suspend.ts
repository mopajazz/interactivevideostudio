import type { SuspendState } from '@ivt/schema';

// Format: v1|<furthest>|<submitted 0|1>|<idx>=<id>,<id>,;<idx>=...
// Each choice id is percent-encoded (so it never contains | ; , = or %-ambiguity)
// and terminated by ',' so that [] and [''] stay distinct.
const PREFIX = 'v1';

const toIndex = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

function build(furthest: number, submitted: boolean, body: string): string {
  return `${PREFIX}|${furthest}|${submitted ? 1 : 0}|${body}`;
}

export function encodeSuspend(s: SuspendState, orderedIds: string[], limit = 4096): string {
  const furthest = toIndex(s.furthest);
  const parts: string[] = [];
  orderedIds.forEach((id, i) => {
    const a = s.answers[id];
    if (Array.isArray(a)) parts.push(`${i}=${a.map((c) => encodeURIComponent(c) + ',').join('')}`);
  });
  const full = build(furthest, s.submitted, parts.join(';'));
  return full.length <= limit ? full : build(furthest, s.submitted, '');
}

export function decodeSuspend(raw: string, orderedIds: string[]): SuspendState | null {
  if (typeof raw !== 'string' || !raw) return null;
  const f = raw.split('|');
  if (f.length !== 4 || f[0] !== PREFIX) return null;
  const [, fur, sub, body] = f as [string, string, string, string];
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
