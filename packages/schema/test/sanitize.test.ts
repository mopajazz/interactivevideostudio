import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../src/sanitize';

describe('sanitizeHtml', () => {
  it('strips scripts and event handlers', () => {
    expect(sanitizeHtml('<p>hi<script>alert(1)</script><b onclick="x()">b</b></p>')).toBe('<p>hi<b>b</b></p>');
  });

  it('removes javascript: hrefs', () => {
    expect(sanitizeHtml('<a href="javascript:x">l</a>')).not.toContain('href');
  });

  it('adds rel and target to allowed links', () => {
    const out = sanitizeHtml('<a href="https://x.org">l</a>');
    expect(out).toContain('href="https://x.org"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('drops disallowed tags and attributes but keeps text', () => {
    expect(sanitizeHtml('<div class="a"><img src="x">t</div>')).toBe('t');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
