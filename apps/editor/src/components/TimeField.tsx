import { useEffect, useId, useState } from 'react';
import { formatDuration, parseTime } from '../format';
import { IconAlert } from '../ui/icons';

type Props = {
  value: number;
  max: number;
  /** The video's length: a value at or after it is flagged until the author moves it earlier. */
  duration: number;
  onCommit: (seconds: number) => void;
};

/** The checkpoint's time as m:ss. Commits on Enter or leaving the field; refuses nonsense, clamps to `max`. */
export function TimeField({ value, max, duration, onCommit }: Props) {
  const id = useId();
  const [text, setText] = useState(formatDuration(value));
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => setText(formatDuration(value)), [value]);
  const pastEnd = duration > 0 && value >= duration;
  // A refused entry is reported first; otherwise a stored time past the end stays flagged until it is fixed.
  const shown = msg?.error || !pastEnd
    ? msg
    : { error: true, text: `This checkpoint is after the end of the video (${formatDuration(duration)}). Move it earlier.` };

  const commit = () => {
    if (text.trim() === formatDuration(value)) return setMsg(null);
    const t = parseTime(text);
    if (t === null) return setMsg({ error: true, text: 'Enter a time like 1:05' });
    const clamped = Math.min(t, max);
    setMsg(clamped < t ? { error: false, text: `Moved to ${formatDuration(clamped)}, the latest time a checkpoint can use.` } : null);
    setText(formatDuration(clamped));
    onCommit(clamped);
  };

  return (
    <div className="field time-field">
      <label htmlFor={`${id}-time`} className="field-label">Time</label>
      <p id={`${id}-hint`} className="field-hint">Minutes and seconds, like 1:05. The latest is {formatDuration(max)}.</p>
      <input
        id={`${id}-time`}
        className="input input-time"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={shown?.error || undefined}
        aria-describedby={`${id}-hint ${id}-msg`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      <div id={`${id}-msg`} role="status" className="field-status">
        {shown && <p className={`msg ${shown.error ? 'msg-error' : 'msg-info'}`}>{shown.error && <IconAlert />}{shown.text}</p>}
      </div>
    </div>
  );
}
