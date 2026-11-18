import { useEffect, useId, useState } from 'react';
import { formatDuration, parseTime } from '../format';
import { IconAlert } from '../ui/icons';

type Props = { value: number; max: number; onCommit: (seconds: number) => void };

/** The checkpoint's time as m:ss. Commits on Enter or leaving the field; refuses nonsense, clamps to `max`. */
export function TimeField({ value, max, onCommit }: Props) {
  const id = useId();
  const [text, setText] = useState(formatDuration(value));
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  useEffect(() => setText(formatDuration(value)), [value]);

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
        aria-invalid={msg?.error || undefined}
        aria-describedby={`${id}-hint ${id}-msg`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      <div role="status" className="field-status">
        {msg && <p id={`${id}-msg`} className={`msg ${msg.error ? 'msg-error' : 'msg-info'}`}>{msg.error && <IconAlert />}{msg.text}</p>}
      </div>
    </div>
  );
}
