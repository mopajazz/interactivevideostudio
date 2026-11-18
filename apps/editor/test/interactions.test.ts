import { describe, expect, it } from 'vitest';
import { validateProject, type Interaction, type Project } from '@ivt/schema';
import {
  addChoice,
  addInteraction,
  checkpointName,
  maxTime,
  moveInteraction,
  outOfRange,
  removeChoice,
  removeInteraction,
  setCorrect,
  sortedInteractions,
  updateInteraction,
} from '../src/interactions';
import { parseTime } from '../src/format';
import { newProject } from '../src/project';

const video = (duration = 212): Project => ({ ...newProject(), title: 'T', videoId: 'dQw4w9WgXcQ', duration });
const only = (p: Project): Interaction => {
  expect(p.interactions).toHaveLength(1);
  return p.interactions[0]!;
};

describe('addInteraction', () => {
  it('adding twice at time 5 gives order 1 and 2, unique ids, both at 5 s', () => {
    const p = addInteraction(addInteraction(video(), 'text', 5), 'multipleChoice', 5);
    expect(p.interactions.map((i) => i.order)).toEqual([1, 2]);
    expect(p.interactions.map((i) => i.time)).toEqual([5, 5]);
    expect(new Set(p.interactions.map((i) => i.id)).size).toBe(2);
  });

  it('continues after the highest existing order, with ids unique in the project', () => {
    let p = addInteraction(addInteraction(video(), 'text', 1), 'text', 2);
    const first = p.interactions[0]!.id;
    p = removeInteraction(p, p.interactions[1]!.id);
    p = addInteraction(p, 'link', 3);
    expect(p.interactions.map((i) => i.order)).toEqual([1, 2]);
    expect(p.interactions[1]!.id).not.toBe(first);
    const imported = { ...video(), interactions: [{ id: 'i7', type: 'text' as const, time: 0, order: 9, promptHtml: '' }] };
    const q = addInteraction(imported, 'text', 0);
    expect(q.interactions[1]).toMatchObject({ order: 10 });
    expect(q.interactions[1]!.id).not.toBe('i7');
  });

  it('clamps a time past the end to half a second before it, and a negative time to 0', () => {
    expect(only(addInteraction(video(212), 'text', 500)).time).toBe(211.5);
    expect(only(addInteraction(video(212), 'text', 212)).time).toBe(211.5);
    expect(only(addInteraction(video(212), 'text', -3)).time).toBe(0);
    expect(only(addInteraction(video(212), 'text', Number.NaN)).time).toBe(0);
    expect(only(addInteraction(video(0.2), 'text', 10)).time).toBe(0);
  });

  it('a new multiple-choice question has two empty choices, exactly one marked correct', () => {
    const it = only(addInteraction(video(), 'multipleChoice', 5));
    expect(it).toMatchObject({ type: 'multipleChoice', promptHtml: '' });
    expect(it.choices).toHaveLength(2);
    expect(it.choices!.map((c) => c.html)).toEqual(['', '']);
    expect(it.choices!.filter((c) => c.correct)).toHaveLength(1);
    expect(new Set(it.choices!.map((c) => c.id)).size).toBe(2);
  });

  it('a new true/false question has True (correct) and False', () => {
    const it = only(addInteraction(video(), 'trueFalse', 5));
    expect(it.choices!.map((c) => [c.html, c.correct])).toEqual([['True', true], ['False', false]]);
  });

  it('new text, link and image items start empty, and every result is a valid project', () => {
    let p = video();
    for (const t of ['multipleChoice', 'trueFalse', 'text', 'link', 'image'] as const) p = addInteraction(p, t, 10);
    expect(p.interactions.map((i) => i.promptHtml)).toEqual(['', '', '', '', '']);
    expect(p.interactions[3]).toMatchObject({ type: 'link', url: '' });
    expect(p.interactions[4]).toMatchObject({ type: 'image', alt: '', decorative: false });
    expect(p.interactions[4]!.imageAssetId).toBeUndefined();
    expect(validateProject(p).ok).toBe(true);
  });

  it('does not change the project it was given', () => {
    const p = video();
    addInteraction(p, 'text', 5);
    expect(p.interactions).toEqual([]);
  });
});

describe('updateInteraction, moveInteraction, removeInteraction', () => {
  const base = () => addInteraction(addInteraction(video(212), 'text', 5), 'link', 9);

  it('updates only the named interaction, and clamps a new time', () => {
    const p = base();
    const [a, b] = p.interactions;
    const q = updateInteraction(p, a!.id, { promptHtml: '<p>Hi</p>', time: 999 });
    expect(q.interactions[0]).toMatchObject({ id: a!.id, promptHtml: '<p>Hi</p>', time: 211.5 });
    expect(q.interactions[1]).toBe(b);
    expect(updateInteraction(p, a!.id, (it) => ({ ...it, promptHtml: 'x' })).interactions[0]!.promptHtml).toBe('x');
    expect(updateInteraction(p, 'nope', { promptHtml: 'x' })).toEqual(p);
  });

  it('moves with the same clamping, keeping order', () => {
    const p = base();
    const id = p.interactions[1]!.id;
    expect(moveInteraction(p, id, 300).interactions[1]).toMatchObject({ time: 211.5, order: 2 });
    expect(moveInteraction(p, id, -1).interactions[1]!.time).toBe(0);
    expect(moveInteraction(p, id, 42.25).interactions[1]!.time).toBe(42.25);
  });

  it('removes the named interaction', () => {
    const p = base();
    const q = removeInteraction(p, p.interactions[0]!.id);
    expect(q.interactions).toEqual([p.interactions[1]]);
  });
});

describe('choices', () => {
  const mc = () => only(addInteraction(video(), 'multipleChoice', 1));

  it('addChoice appends an empty, incorrect choice with a fresh id', () => {
    const it = addChoice(addChoice(mc()));
    expect(it.choices).toHaveLength(4);
    expect(it.choices![3]).toMatchObject({ html: '', correct: false });
    expect(new Set(it.choices!.map((c) => c.id)).size).toBe(4);
  });

  it('removeChoice drops one choice', () => {
    const it = addChoice(mc());
    const gone = it.choices![1]!.id;
    expect(removeChoice(it, gone).choices!.map((c) => c.id)).not.toContain(gone);
  });

  it('setCorrect allows several correct answers in a multiple-choice question', () => {
    const it = mc();
    const both = setCorrect(it, it.choices![1]!.id, true);
    expect(both.choices!.map((c) => c.correct)).toEqual([true, true]);
    expect(setCorrect(both, it.choices![0]!.id, false).choices!.map((c) => c.correct)).toEqual([false, true]);
  });

  it('setCorrect keeps exactly one correct answer in a true/false question', () => {
    const tf = only(addInteraction(video(), 'trueFalse', 1));
    const f = setCorrect(tf, tf.choices![1]!.id, true);
    expect(f.choices!.map((c) => c.correct)).toEqual([false, true]);
  });
});

describe('sortedInteractions and checkpointName', () => {
  it('sorts by time, then by order for checkpoints that share a time', () => {
    let p = addInteraction(video(), 'text', 65);
    p = addInteraction(p, 'multipleChoice', 10);
    p = addInteraction(p, 'trueFalse', 65);
    expect(sortedInteractions(p).map((i) => i.type)).toEqual(['multipleChoice', 'text', 'trueFalse']);
  });

  it('names each node by kind, number within its kind, and time', () => {
    let p = addInteraction(video(), 'multipleChoice', 10);
    p = addInteraction(p, 'multipleChoice', 65);
    p = addInteraction(p, 'image', 3);
    p = addInteraction(p, 'trueFalse', 70);
    const [q1, q2, img, tf] = p.interactions;
    expect(checkpointName(p, q2!)).toBe('Quiz question 2 at 1:05');
    expect(checkpointName(p, q1!)).toBe('Quiz question 1 at 0:10');
    expect(checkpointName(p, img!)).toBe('Image 1 at 0:03');
    expect(checkpointName(p, tf!)).toBe('True/False question 1 at 1:10');
  });

  it('maxTime is half a second before the end, never negative', () => {
    expect(maxTime(video(212))).toBe(211.5);
    expect(maxTime(video(0))).toBe(0);
  });
});

describe('parseTime', () => {
  it('reads m:ss, h:mm:ss and plain seconds', () => {
    expect(parseTime('1:05')).toBe(65);
    expect(parseTime(' 0:00 ')).toBe(0);
    expect(parseTime('12:30')).toBe(750);
    expect(parseTime('1:02:05')).toBe(3725);
    expect(parseTime('95')).toBe(95);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'abc', '1:5', '1:60', '1:', ':05', '-1:00', '1:05:', '1.5:00', '1:2:3']) expect(parseTime(bad)).toBeNull();
  });
});

describe('outOfRange', () => {
  it('lists checkpoints at or after the end of the video, and nothing while the duration is unknown', () => {
    const p: Project = {
      ...video(95),
      interactions: [
        { id: 'a', type: 'text', time: 30, order: 1, promptHtml: '' },
        { id: 'b', type: 'text', time: 95, order: 2, promptHtml: '' },
        { id: 'c', type: 'link', time: 180, order: 3, promptHtml: '', url: '' },
        { id: 'd', type: 'text', time: 94.5, order: 4, promptHtml: '' },
      ],
    };
    expect(outOfRange(p)).toEqual(['b', 'c']);
    expect(outOfRange({ ...p, duration: 0 })).toEqual([]);
    expect(outOfRange(video(95))).toEqual([]);
  });

  it('an unrelated edit keeps an out-of-range time as it is (flagged, never silently clamped)', () => {
    const p: Project = { ...video(95), interactions: [{ id: 'c', type: 'text', time: 180, order: 1, promptHtml: '' }] };
    expect(updateInteraction(p, 'c', { promptHtml: '<p>x</p>' }).interactions[0]!.time).toBe(180);
  });
});
