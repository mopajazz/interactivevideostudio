import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** The WCAG rule sets every scan must pass with zero violations. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/** Waits for finite CSS animations and transitions (card entrance, panel slide-in) so colors are measured at rest. */
export const settle = (page: Page) =>
  Promise.all(page.frames().map((f) =>
    f.evaluate(() =>
      Promise.all(
        document.getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    ),
  ));

/**
 * Runs axe on the whole page (frames included). Fails on any violation of a WCAG A/AA rule, and on best-practice
 * findings rated serious or critical; lesser best-practice findings are attached to the test as annotations.
 */
export async function expectNoAxeViolations(page: Page) {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS, 'best-practice']).analyze();
  const isWcag = (tags: string[]) => tags.some((t) => WCAG_TAGS.includes(t));
  const failing = violations.filter((v) => isWcag(v.tags) || v.impact === 'serious' || v.impact === 'critical');
  for (const v of violations.filter((x) => !failing.includes(x))) {
    test.info().annotations.push({ type: 'axe best-practice', description: `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}` });
  }
  const summary = failing.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(1).join(' ').trim()}`),
  }));
  expect(summary, 'axe violations').toEqual([]);
}

/** True when the page scrolls sideways (WCAG 1.4.10 reflow at 320 CSS px). */
export const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
