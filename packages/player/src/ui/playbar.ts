import { button, h } from './dom';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

/** "1:05", or "1:02:05" past an hour. */
export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** "1 minute 5 seconds" for screen readers. */
export function inWords(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (t >= 3600) parts.push(unit(Math.floor(t / 3600), 'hour'));
  if (t % 3600 >= 60) parts.push(unit(Math.floor((t % 3600) / 60), 'minute'));
  if (t % 60 || parts.length === 0) parts.push(unit(t % 60, 'second'));
  return parts.join(' ');
}

export type PlaybarHandlers = {
  onToggle: () => void;
  onSeek: (t: number) => void;
  onCaptions: (on: boolean) => void;
  onRate: (r: number) => void;
};

/** Our own playbar, used whether or not forward scrubbing is locked. All controls are native elements. */
export class Playbar {
  readonly el = h('div', 'ivp-bar');
  private play = button('', 'ivp-btn ivp-icon ivp-play');
  private range = h('input', 'ivp-range');
  private time = h('span', 'ivp-time', '0:00 / 0:00');
  private cc = button('Captions', 'ivp-btn ivp-cc');
  private rate = h('select', 'ivp-rate');
  private status = h('span', 'ivp-status');
  private dragging = false;
  private duration = 0;

  constructor(hd: PlaybarHandlers) {
    this.setPlaying(false);
    this.play.addEventListener('click', () => hd.onToggle());

    Object.assign(this.range, { type: 'range', min: '0', max: '0', step: '1', value: '0' });
    this.range.setAttribute('aria-label', 'Video progress');
    // Update the label while dragging; seek once on release (keyboard arrows fire both events).
    this.range.addEventListener('input', () => {
      this.dragging = true;
      this.showTime(Number(this.range.value));
    });
    this.range.addEventListener('change', () => {
      this.dragging = false;
      hd.onSeek(Number(this.range.value));
    });

    this.cc.setAttribute('aria-pressed', 'false');
    this.cc.addEventListener('click', () => {
      const on = this.cc.getAttribute('aria-pressed') !== 'true';
      this.cc.setAttribute('aria-pressed', String(on));
      hd.onCaptions(on);
    });

    this.rate.setAttribute('aria-label', 'Playback speed');
    for (const r of RATES) {
      const opt = h('option', '', `${r}×`);
      opt.value = String(r);
      opt.selected = r === 1;
      this.rate.append(opt);
    }
    this.rate.addEventListener('change', () => hd.onRate(Number(this.rate.value)));

    this.status.setAttribute('role', 'status');
    this.time.setAttribute('aria-hidden', 'true'); // the slider's aria-valuetext carries the same information
    this.el.append(this.play, this.range, this.time, this.cc, this.rate, this.status);
  }

  setPlaying(playing: boolean) {
    this.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; // static markup, no author content
  }

  setBuffering(on: boolean) {
    this.status.textContent = on ? 'Loading video…' : '';
    this.el.classList.toggle('is-buffering', on);
  }

  setTime(t: number, duration: number) {
    this.duration = duration;
    if (this.dragging) return;
    this.range.max = String(Math.floor(duration));
    this.range.value = String(Math.floor(t));
    this.showTime(t);
  }

  focusPlay() { this.play.focus(); }

  /** After a fatal error: the controls can do nothing, so they leave the Tab order and say they are unavailable. */
  disable() {
    this.el.inert = true;
    this.el.classList.add('is-disabled');
    for (const c of [this.play, this.range, this.cc, this.rate]) c.setAttribute('aria-disabled', 'true');
  }

  private showTime(t: number) {
    this.time.textContent = `${clock(t)} / ${clock(this.duration)}`;
    this.range.setAttribute('aria-valuetext', `${inWords(t)} of ${inWords(this.duration)}`);
  }
}
