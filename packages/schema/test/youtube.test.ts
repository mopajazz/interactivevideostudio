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
    'https://youtu.be/dQw4w9WgXcQ?list=PL1',
    'https://www.youtube.com/embed/dQw4w9WgXcQ?list=PL1',
    'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
    'youtu.be/dQw4w9WgXcQ',
    'www.youtube.com/watch?v=dQw4w9WgXcQ',
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
    'https://www.youtube.com/playlist?list=PL1',
    'https://youtu.be/',
    'watch this https://youtu.be/dQw4w9WgXcQ now',
    'youtu.be.evil.com/dQw4w9WgXcQ',
    'evilyoutube.com/watch?v=dQw4w9WgXcQ',
  ])('returns null for %s', (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});
