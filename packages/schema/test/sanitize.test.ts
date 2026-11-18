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

  describe('pasted and hostile input', () => {
    it('strips Word junk', () => {
      const html =
        '<meta charset="utf-8"><style>p{color:red}</style><!--[if mso]><p>x</p><![endif]--><p class="MsoNormal"><span style="color:red">Hi<o:p></o:p></span></p>';
      expect(sanitizeHtml(html)).toBe('<p>Hi</p>');
    });

    it('handles uppercase tags and attributes', () => {
      expect(sanitizeHtml('<P>a<SCRIPT>alert(1)</SCRIPT><B ONCLICK="x()">b</B></P>')).toBe('<p>a<b>b</b></p>');
    });

    it('removes mixed-case javascript: hrefs', () => {
      expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">l</a>')).toBe('<a>l</a>');
    });

    it('removes data: hrefs', () => {
      expect(sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">l</a>')).toBe('<a>l</a>');
    });

    it('unwraps nested disallowed tags but keeps their text', () => {
      expect(sanitizeHtml('<div><section><p>a <span>b</span></p></section></div>')).toBe('<p>a b</p>');
    });

    it('removes svg onload', () => {
      expect(sanitizeHtml('<svg onload="alert(1)"><circle r="1"></circle></svg>ok')).toBe('ok');
    });

    it('removes img onerror', () => {
      expect(sanitizeHtml('<img src="x" onerror="alert(1)">ok')).toBe('ok');
    });

    it('drops author style, class, target and rel but sets safe link attributes', () => {
      expect(
        sanitizeHtml('<a href="https://x.org" style="color:red" class="c" target="_self" rel="opener">l</a>'),
      ).toBe('<a href="https://x.org" rel="noopener noreferrer" target="_blank">l</a>');
    });
  });
});
