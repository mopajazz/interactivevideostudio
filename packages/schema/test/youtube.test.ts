import { describe, it, expect } from 'vitest';
import { parseYouTubeId } from '../src/youtube';

describe('parseYouTubeId', () => {
  it.each([
    'https://youtu.be/dQw4w9WgXcQ?t=30',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    '  https://youtu.be/dQw4w9WgXcQ  ',
  ])('extracts the id from %s', (url) => {
    expect(parseYouTubeId(url)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    'not a link',
    '',
    'https://vimeo.com/123',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/',
  ])('returns null for %s', (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});
