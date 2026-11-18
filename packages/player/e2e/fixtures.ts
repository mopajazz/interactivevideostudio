import type { Project } from '@ivt/schema';

const base = (interactions: Project['interactions']): Project => ({
  version: 1,
  title: 'Test video',
  videoId: 'M7lc1UVf-VE',
  duration: 30,
  settings: { disableForwardScrubbing: false, masteryPercent: 50 },
  interactions,
});

export const fixtures: Record<string, () => Project> = {
  scored: () => base([
    {
      id: 'q1', type: 'multipleChoice', time: 5, order: 0,
      promptHtml: '<p>Which colour is the <b>sky</b>?</p>',
      hintHtml: '<p>Look up.</p>',
      choices: [
        { id: 'a', html: 'Blue', correct: true, feedbackHtml: '<p>Yes, blue.</p>' },
        { id: 'b', html: 'Green', correct: false, feedbackHtml: '<p>No, that is grass.</p>' },
      ],
    },
    {
      id: 'q2', type: 'trueFalse', time: 10, order: 0,
      promptHtml: '<p>Water is dry.</p>',
      choices: [
        { id: 't', html: 'True', correct: false, feedbackHtml: '<p>It is wet.</p>' },
        { id: 'f', html: 'False', correct: true, feedbackHtml: '<p>Right, it is wet.</p>' },
      ],
    },
    { id: 't1', type: 'text', time: 15, order: 0, promptHtml: '<p>A note for you.</p>' },
    { id: 'l1', type: 'link', time: 20, order: 0, promptHtml: '<p>Read more.</p>', url: 'https://example.com/more' },
    { id: 'i1', type: 'image', time: 25, order: 0, promptHtml: '<p>A diagram.</p>', imageAssetId: 'diagram.png', alt: 'A labelled diagram' },
  ]),
  unscored: () => base([{ id: 't1', type: 'text', time: 5, order: 0, promptHtml: '<p>Just a note.</p>' }]),
  empty: () => ({ ...base([]), duration: 180 }),
  zero: () => base([{ id: 't0', type: 'text', time: 0, order: 0, promptHtml: '<p>Welcome.</p>' }]),
  three: () => base([{
    id: 'r1', type: 'multipleChoice', time: 5, order: 0, promptHtml: '<p>Pick one.</p>',
    choices: [
      { id: 'a', html: 'Alpha', correct: true },
      { id: 'b', html: 'Bravo', correct: false },
      { id: 'c', html: 'Charlie', correct: false },
    ],
  }]),
  multi: () => base([{
    id: 'm1', type: 'multipleChoice', time: 5, order: 0, promptHtml: '<p>Pick the primes.</p>',
    choices: [
      { id: 'a', html: '2', correct: true },
      { id: 'b', html: '3', correct: true },
      { id: 'c', html: '4', correct: false },
    ],
  }]),
  xss: () => base([{
    id: 'x1', type: 'multipleChoice', time: 5, order: 0,
    promptHtml: '<p>Safe<img src=x onerror="window.__xss=1"><script>window.__xss=2</script></p>',
    choices: [
      { id: 'a', html: '<span onclick="window.__xss=3">A</span><iframe src="javascript:window.__xss=4"></iframe>', correct: true, feedbackHtml: '<a href="javascript:window.__xss=5">bad</a>' },
      { id: 'b', html: 'B', correct: false },
    ],
  }]),
};
