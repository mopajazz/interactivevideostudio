import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { createRichTextEditor, isSafeLinkUrl, toStoredHtml } from '../src/components/richText';

const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'a']);

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = '';
});

/** A live editor in jsdom; returns every value it emitted through onChange. */
function setup(content = '') {
  const element = document.createElement('div');
  document.body.append(element);
  const emitted: string[] = [];
  editor = createRichTextEditor({ element, content, label: 'l', describedBy: 'd', onChange: (html) => emitted.push(html) });
  return { editor, emitted, last: () => emitted.at(-1) ?? '' };
}

/** Every tag and attribute name in an HTML string. */
function inventory(html: string) {
  const box = document.createElement('div');
  box.innerHTML = html;
  const tags = new Set<string>();
  const attrs = new Set<string>();
  box.querySelectorAll('*').forEach((el) => {
    tags.add(el.tagName.toLowerCase());
    for (const a of Array.from(el.attributes)) attrs.add(a.name);
  });
  return { tags, attrs };
}

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta name=Generator content="Microsoft Word 15"><style>p.MsoNormal{margin:0cm;font-family:Calibri}</style></head>
<body lang=EN-GB style='tab-interval:36.0pt'><!--StartFragment-->
<p class=MsoNormal style='margin:0;mso-line-height-rule:exactly'><b><span style='font-size:14pt;color:#C00000'>Plants</span></b><span style='mso-spacerun:yes'> </span><i>need</i> <span lang=EN-US style='font-family:"Comic Sans MS"'>light</span><o:p></o:p></p>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]-->
<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>Water</p>
<table class=MsoTableGrid border=1><tr><td>cell</td></tr></table>
<img width=200 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png" v:shapes="Picture_x0020_1">
<!--EndFragment--></body></html>`;

describe('RichText editor output', () => {
  it('emits only sanitized HTML: a pasted <script>, event handlers and images are gone', () => {
    const { editor, last } = setup();
    editor.view.pasteHTML('<p>Hello <script>alert(1)</script><b onclick="alert(2)">world</b></p><img src=x onerror="alert(3)"><iframe src="https://evil.example"></iframe>');
    const out = last();
    expect(out).toContain('Hello');
    expect(out).toContain('<strong>world</strong>');
    expect(out).not.toMatch(/<script|onerror|onclick|<img|<iframe|alert\(1\)/i);
    for (const t of inventory(out).tags) expect(ALLOWED).toContain(t);
  });

  it('reduces pasted Word HTML to the allowed tags, with no classes, styles or Office markup', () => {
    const { editor, last } = setup();
    editor.view.pasteHTML(WORD);
    const out = last();
    const { tags, attrs } = inventory(out);
    for (const t of tags) expect(ALLOWED).toContain(t);
    expect([...attrs]).toEqual([]);
    expect(out).not.toMatch(/mso|Calibri|<o:p|<style|<table|<img|StartFragment|clip_image/i);
    expect(out).toContain('<strong>Plants</strong>');
    expect(out).toContain('<em>need</em>');
    expect(out).toContain('light');
    expect(out).toContain('Water');
  });

  it('drops javascript: links from pasted HTML but keeps safe ones, opening in a new tab', () => {
    const { editor, last } = setup();
    editor.view.pasteHTML('<p><a href="javascript:alert(1)">bad</a> and <a href="https://example.com/a" style="color:red" class="x">good</a></p>');
    const out = last();
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('bad');
    expect(out).toMatch(/<a href="https:\/\/example\.com\/a"[^>]*>good<\/a>/);
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('keeps bold, italic, both list kinds and links that the author typed', () => {
    const { editor, last } = setup();
    editor.commands.setContent('<p>x</p>');
    editor.chain().selectAll().toggleBold().run();
    expect(last()).toBe('<p><strong>x</strong></p>');
    editor.chain().selectAll().toggleBold().toggleItalic().run();
    expect(last()).toBe('<p><em>x</em></p>');
    editor.chain().selectAll().toggleBulletList().run();
    expect(last()).toBe('<ul><li><p><em>x</em></p></li></ul>');
    editor.chain().selectAll().toggleOrderedList().run();
    expect(last()).toBe('<ol><li><p><em>x</em></p></li></ol>');
  });

  it('loads existing content through the sanitizer and labels the editable region', () => {
    const { editor } = setup('<p onclick="x()">Hi <script>bad()</script><span style="color:red">there</span></p>');
    expect(editor.getHTML()).toBe('<p>Hi there</p>');
    const dom = editor.view.dom;
    expect(dom.getAttribute('role')).toBe('textbox');
    expect(dom.getAttribute('aria-multiline')).toBe('true');
    expect(dom.getAttribute('aria-labelledby')).toBe('l');
    expect(dom.getAttribute('aria-describedby')).toBe('d');
  });
});

describe('toStoredHtml', () => {
  it('stores an empty editor as an empty string', () => {
    expect(toStoredHtml('<p></p>')).toBe('');
    expect(toStoredHtml('<p><br></p>')).toBe('');
    expect(toStoredHtml('<p>a</p>')).toBe('<p>a</p>');
  });
});

describe('isSafeLinkUrl', () => {
  it('accepts http, https and mailto only', () => {
    expect(isSafeLinkUrl('https://example.com')).toBe(true);
    expect(isSafeLinkUrl('http://example.com/x?y=1')).toBe(true);
    expect(isSafeLinkUrl('mailto:a@example.com')).toBe(true);
    for (const bad of ['', 'example.com', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,hi', 'ftp://x.org', 'https://', ' ']) {
      expect(isSafeLinkUrl(bad)).toBe(false);
    }
  });
});
