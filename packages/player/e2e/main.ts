// Test and manual-check page. ?adapter=fake swaps in FakeAdapter (exposed as window.__fake).
// Other params: fixture=<name>, lock=1 (disable forward scrubbing), duration=<s>, initial=<json SuspendState>.
import { FakeAdapter } from '../src/fakeAdapter';
import { mount } from '../src/mount';
import { fixtures } from './fixtures';

const qs = new URLSearchParams(location.search);
const project = (fixtures[qs.get('fixture') ?? 'scored'] ?? fixtures.scored!)();
if (qs.get('lock') === '1') project.settings.disableForwardScrubbing = true;

const w = window as any;
let adapter: FakeAdapter | undefined;
if (qs.get('adapter') === 'fake') {
  adapter = new FakeAdapter(Number(qs.get('duration') ?? project.duration));
  w.__fake = adapter;
  w.__results = [];
  w.__progress = [];
}
const initial = qs.get('initial');
const player = mount(document.getElementById('app')!, project, {
  adapter,
  onResult: (r) => w.__results?.push(r),
  onProgress: (s) => w.__progress?.push(s),
  initial: initial ? JSON.parse(initial) : undefined,
});
if (adapter) w.__player = player;
