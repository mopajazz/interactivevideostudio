// Test and manual-check page. ?adapter=fake swaps in FakeAdapter (exposed as window.__fake).
// Other params: fixture=<name>, lock=1 (disable forward scrubbing), duration=<s>, initial=<json SuspendState>,
// escape=1 (pass an onEscape callback), clock=manual (the card's clock stands still until window.__tick(ms); see below), retry=1|0 and solution=1|0 (set allowRetry / showSolution; absent = default).
import { FakeAdapter } from '../src/fakeAdapter';
import { mount } from '../src/mount';
import { SWAP_GUARD_MS, clock } from '../src/ui/card';
import { fixtures } from './fixtures';

const qs = new URLSearchParams(location.search);
const project = (fixtures[qs.get('fixture') ?? 'scored'] ?? fixtures.scored!)();
if (qs.get('lock') === '1') project.settings.disableForwardScrubbing = true;
if (qs.has('retry')) project.settings.allowRetry = qs.get('retry') === '1';
if (qs.has('solution')) project.settings.showSolution = qs.get('solution') === '1';

const w = window as any;
{
  // The card ignores a click on a button it has just swapped in (SWAP_GUARD_MS). Tests click far faster than people,
  // so by default every read of this page's clock moves it on by a whole window, and no deliberate click is dropped.
  // ?clock=manual stands the clock still until window.__tick(ms), to test the window itself.
  let t = 0;
  const manual = qs.get('clock') === 'manual';
  clock.now = manual ? () => t : () => (t += SWAP_GUARD_MS);
  w.__tick = (ms: number) => { t += ms; };
}
let adapter: FakeAdapter | undefined;
if (qs.get('adapter') === 'fake') {
  adapter = new FakeAdapter(Number(qs.get('duration') ?? project.duration), { seekLagSamples: Number(qs.get('seekLag') ?? 0) });
  w.__fake = adapter;
  w.__results = [];
  w.__progress = [];
  w.__reasons = [];
}
const initial = qs.get('initial');
const player = mount(document.getElementById('app')!, project, {
  adapter,
  onResult: (r) => w.__results?.push(r),
  onProgress: (s, reason) => { w.__progress?.push(s); w.__reasons?.push(reason); },
  initial: initial ? JSON.parse(initial) : undefined,
  // ?escape=1: the host wants Escape (as the editor's preview does); calls are counted in window.__escapes.
  onEscape: qs.get('escape') === '1' ? () => { w.__escapes = (w.__escapes ?? 0) + 1; } : undefined,
});
if (adapter) w.__player = player;
// Stand-in for the YouTube iframe's own focusable title/logo links: keyboard focus must never reach it.
if (adapter) {
  const standIn = document.createElement('a');
  standIn.href = '#';
  standIn.className = 'standin-embed-link';
  standIn.textContent = 'Embed link stand-in';
  document.querySelector('.ivp-video')?.append(standIn);
}
