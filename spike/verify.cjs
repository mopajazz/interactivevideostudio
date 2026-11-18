// Headless check of the spike page's own logic against the stubbed IFrame API (?stub=1).
// Does NOT exercise the real YouTube player.
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'index.html') + '?stub=1&at=3');
  const calls = () => page.evaluate(() => window.__stub.calls);
  const ok = (m) => console.log('PASS ' + m);

  await page.waitForFunction(() => document.getElementById('log').textContent.includes('ready'));
  ok('page boots with stubbed API');

  await page.click('#play');
  assert.strictEqual(await page.textContent('#play'), 'Pause'); ok('play button toggles to Pause');
  assert((await calls()).includes('play'));

  await page.waitForFunction(() => window.__stub.state === 2, null, { timeout: 8000 });
  assert(await page.$eval('#overlay', e => e.classList.contains('on'))); ok('overlay shown on pause (auto-pause at set time 3s)');
  assert((await page.textContent('#log')).includes('overlay at 3'));
  assert.strictEqual(await page.textContent('#play'), 'Play');

  await page.click('#play');
  assert(!(await page.$eval('#overlay', e => e.classList.contains('on')))); ok('overlay hidden on resume');

  // forward seek via the progress bar should snap back to furthest watched
  const furthest = await page.evaluate(() => window.__stub.t);
  await page.evaluate(() => { const s = document.getElementById('seek'); s.value = 900; s.dispatchEvent(new Event('input')); });
  await page.waitForFunction(() => document.getElementById('log').textContent.includes('guard: snap'), null, { timeout: 3000 });
  const after = await page.evaluate(() => window.__stub.t);
  assert(after < 10 && after >= furthest - 0.01 && after <= furthest + 1, `snapped back (t=${after}, furthest=${furthest})`);
  ok('forward seek snaps back to furthest watched');

  // backward seek must be allowed
  await page.evaluate(() => { const s = document.getElementById('seek'); s.value = 10; s.dispatchEvent(new Event('input')); });
  const c = await calls();
  assert(c.some(x => /^seekTo:0\.6/.test(x)), 'backward seek issued');
  ok('backward seek allowed (not snapped)');

  // captions toggle
  await page.click('#cc');
  assert.strictEqual(await page.getAttribute('#cc', 'aria-pressed'), 'true');
  let c2 = await calls();
  assert(c2.includes('loadModule:captions') && c2.some(x => x.startsWith('setOption:captions:track')));
  await page.click('#cc');
  c2 = await calls();
  assert(c2.includes('unloadModule:captions') && await page.getAttribute('#cc', 'aria-pressed') === 'false');
  ok('captions toggle wires loadModule/setOption/unloadModule and aria-pressed');

  // keyboard focus reaches every control
  await page.evaluate(() => document.activeElement.blur());
  const seen = [];
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => document.activeElement.id)); }
  const i0 = seen.indexOf('play'); assert(i0 >= 0 && seen[i0 + 1] === 'seek' && seen[i0 + 2] === 'cc', 'tab order: ' + seen.join(',')); ok('Tab order reaches play, progress, captions: ' + seen.join(','));

  await browser.close();
  console.log('ALL PASSED (stub only; real YouTube player not exercised)');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
