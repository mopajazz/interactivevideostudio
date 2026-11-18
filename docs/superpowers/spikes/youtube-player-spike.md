# YouTube player spike

Question: can the final player use a custom playbar over a YouTube embed with native controls hidden (GO), or must it fall back to the visible YouTube player with overlays on top and a detect-and-rewind lock (FALLBACK)?

This spike ran in a container with no access to youtube.com or YouTube's policy pages. Only the page's own logic could be checked. Real-player behavior and the terms review are **UNVERIFIED**.

## What was built

`spike/index.html` loads the IFrame API with `controls=0&disablekb=1&modestbranding=1`. It has a hand-made playbar (play/pause button, range-input progress, captions toggle), a full-frame dimmed overlay shown on `pause`, and a scrub guard. Every 250 ms the guard compares `getCurrentTime()` with the furthest-watched time and calls `seekTo(furthest)` when the player is more than 1.5 s ahead. The overlay also fires at a set time (`?at=<seconds>`, default 5), which pauses the video. Captions use `loadModule('captions')` / `setOption('captions','track',...)` / `unloadModule('captions')`.

`?stub=1` swaps the real API for a small fake of the surface the page uses (`playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`, `getDuration`, `getPlayerState`, `loadModule`, `unloadModule`, `setOption`, `onReady`, `onStateChange`).

## Verified with the stub (`node spike/verify.cjs`, headless Chromium)

All of these passed:
- The page boots and the play button toggles Play/Pause.
- The overlay appears on pause, including the auto-pause at the set time, and hides on resume.
- A forward seek through the progress bar snaps back to the furthest-watched time. A backward seek is allowed.
- The captions toggle calls `loadModule`, `setOption` and `unloadModule`, and keeps `aria-pressed` in sync.
- Tab order reaches play, progress and captions, in that order.

This shows the page's wiring is correct against the API as the page assumes it. It says nothing about how the real player behaves.

## UNVERIFIED: real-player behavior

Owner checklist, in a normal browser with network access. Open `spike/index.html` (serve it over http, e.g. `npx serve spike`) with a public captioned video, `?v=<id>`:
1. Play and pause from the custom button work, and the button label tracks the real state, including when the video is paused or ended by other means.
2. The overlay appears on pause and at the `?at=` time, and covers the frame. Clicking the video area does not play or pause it behind the overlay, and the YouTube pause-state UI does not show through.
3. A forward drag or click on the progress bar snaps back to the furthest-watched point. Check how visible the jump is, and that the guard does not misfire during normal playback or buffering.
4. The captions toggle shows and hides captions on a captioned video. `loadModule('captions')` and `setOption` are not guaranteed to be supported, so confirm this works.
5. Keyboard focus reaches every control, and `disablekb=1` blocks YouTube's own shortcuts (arrow-key seek).
6. Try the same checks on a phone browser, since `playsinline` and autoplay rules differ there.

## UNVERIFIED: YouTube terms review

Nothing is claimed here about what YouTube permits. Read these pages and record the exact clauses and URLs:
- YouTube API Services Terms of Service
- YouTube API Services Developer Policies (including the required minimum functionality section)

Question to answer from them: are hiding native controls, a custom playbar, and overlays on the embedded player permitted?

If any of the three is not permitted, switch to FALLBACK: visible YouTube player, overlays on top, detect-and-rewind lock. Tasks 2 and 4 depend on this answer.

DECISION: GO (PROVISIONAL, UNVERIFIED)
