import { describe, it, expect } from 'vitest';
import { Announcer } from '../src/ui/announcer';

describe('Announcer', () => {
  it('say() writes to a polite live region inside the root', () => {
    const root = document.createElement('div');
    const a = new Announcer(root);
    a.say('Correct.');
    const region = root.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region!.textContent).toBe('Correct.');
  });

  it('repeating the same message still changes the region so it is re-read', () => {
    const root = document.createElement('div');
    const a = new Announcer(root);
    a.say('Correct.');
    const region = root.querySelector('[aria-live="polite"]')!;
    const first = region.textContent;
    a.say('Correct.');
    expect(region.textContent).not.toBe(first);
    expect(region.textContent!.trim()).toBe('Correct.');
  });

  it('uses one region per root and is visually hidden, not display:none', () => {
    const root = document.createElement('div');
    const a = new Announcer(root);
    a.say('x');
    a.say('y');
    expect(root.querySelectorAll('[aria-live]')).toHaveLength(1);
    const region = root.querySelector<HTMLElement>('[aria-live]')!;
    expect(region.hidden).toBe(false);
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });
});
