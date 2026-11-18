import type { Project } from '@ivt/schema';

export const sampleProject = (): Project => ({
  version: 1,
  title: 'Photosynthesis in 5 minutes',
  videoId: 'dQw4w9WgXcQ',
  duration: 212,
  settings: { disableForwardScrubbing: true, masteryPercent: 80 },
  interactions: [
    {
      id: 'q1', type: 'multipleChoice', time: 12, order: 0, promptHtml: '<p>What do plants need?</p>',
      choices: [{ id: 'a', html: 'Light', correct: true }, { id: 'b', html: 'Noise', correct: false }],
    },
    { id: 'l1', type: 'link', time: 30, order: 1, promptHtml: '<p>Read more</p>', url: '' },
    { id: 'img1', type: 'image', time: 40, order: 2, promptHtml: '', imageAssetId: 'Ab3_dE-fGh1J.webp', alt: 'A leaf' },
  ],
});

export const bytes = (...n: number[]) => new Uint8Array(n);
