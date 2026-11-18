import { inWords } from '@ivt/player';
import { formatDuration } from '../format';
import { IconPause, IconPlay } from '../ui/icons';

type Props = { time: number; duration: number; playing: boolean; onToggle: () => void; onSeek: (t: number) => void };

/** The author's playhead: play/pause, a slider read out in words, and the time. Not the learner's playbar. */
export function Scrubber({ time, duration, playing, onToggle, onSeek }: Props) {
  return (
    <div role="group" aria-label="Video controls" className="scrubber">
      <button type="button" className="btn btn-secondary btn-small scrub-play" onClick={onToggle}>
        {playing ? <IconPause /> : <IconPlay />}{playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        className="scrub-range"
        aria-label="Playhead"
        min={0}
        max={Math.floor(duration)}
        step={1}
        value={Math.floor(time)}
        aria-valuetext={`${inWords(time)} of ${inWords(duration)}`}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      {/* The slider's aria-valuetext says the same in words. */}
      <span className="scrub-time" aria-hidden="true">{formatDuration(time)} / {formatDuration(duration)}</span>
    </div>
  );
}
