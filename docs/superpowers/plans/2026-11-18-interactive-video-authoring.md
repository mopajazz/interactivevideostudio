# Interactive Video Authoring Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-only web editor that turns a YouTube URL into a scored interactive video and exports it as a SCORM 1.2 package with our own accessible player.

**Architecture:** A pnpm monorepo with four packages: `schema` (types, validation, sanitizing, URL parsing), `player` (framework-free player shared by editor preview and export), `scorm` (SCORM 1.2 runtime and zip export), and `apps/editor` (React three-step editor). Projects are JSON, autosaved to IndexedDB. A spike comes first to prove the custom playbar and check YouTube's API terms.

**Tech Stack:** TypeScript, pnpm workspaces, Vite, React, Vitest, Playwright with `@axe-core/playwright`, DOMPurify, JSZip, idb-keyval.

**Spec:** `/home/user/docs/superpowers/specs/2026-11-18-interactive-video-authoring-design.md`

## Global Constraints

- Video source is YouTube only. The package needs YouTube online; there is no offline mode.
- Five interaction types only: multiple choice, true/false, text, link, image.
- Step 1 asks for the YouTube URL and a title, nothing else.
- Target WCAG 2.2 AA; the editor follows ATAG 2.0 principles. No VPAT or compliance claims.
- SCORM 1.2 only: `cmi.core.score.raw/min/max`, `cmi.core.lesson_status` in {`passed`,`failed`,`incomplete`,`completed`}, `cmi.suspend_data` limit 4096 characters.
- Mastery threshold default 80%. All questions equal points. Unanswered counts wrong. Submission is final.
- Zero scored questions: show "Finish" instead of "Submit answers"; status `completed`.
- Rich text: bold, italic, lists, links only, as sanitized HTML; the player never runs author-supplied scripts.
- Images: required alt text or explicit "decorative" before export; compressed on import with a size cap.
- Checkpoints may share a time (play in `order`); none at or after video end; answered questions do not retrigger on backward seek.
- All data stays on the author's machine; no backend, no accounts.
- Cut line if time is short, cut first: playback speed, hints, animation polish.

## Review Focus

1. **YouTube URL variants and unusable videos:** `youtu.be/ID?t=30`, `/shorts/ID`, `/embed/ID`, playlist params, junk text. Expect the right ID or a clear "that doesn't look like a YouTube link" message; a deleted, private or embed-disabled video shows a graceful message, not a blank player. (Tasks 1, 4, 7)
2. **Pasted rich text with scripts or Word junk:** expect only the allowed tags to survive and no script execution. (Task 1)
3. **Learner relaunches mid-attempt:** expect resume at the right place with answers kept, and `suspend_data` never exceeds 4096 characters. (Task 5)
4. **Player opened outside an LMS (no SCORM API):** expect it to run standalone without errors or lost UI. (Task 5)
5. **Two checkpoints at one time, one in the last second, and backward seeks:** expect ordered playback, no skipped or repeated questions. (Task 2)

---

### Task 0: Spike (throwaway): prove the player approach and check YouTube terms

**Files:**
- Create: `spike/index.html`
- Create: `docs/superpowers/spikes/youtube-player-spike.md`

**Interfaces:**
- Produces: a written GO or FALLBACK decision that Tasks 2 and 4 follow.

- [ ] **Step 1: Build `spike/index.html`**: load the YouTube IFrame API with `controls=0&disablekb=1&modestbranding=1`, a hand-made playbar (play/pause, progress, captions toggle), a full-frame dimmed overlay shown on `pause`, and a scrub guard that snaps `seekTo` back to the furthest-watched time. Keep it one file; no tests (throwaway).
- [ ] **Step 2: Verify manually** in Chromium on a public captioned video: playbar works, overlay appears at a set time, forward seek snaps back, captions toggle works, keyboard focus reaches every control. Record results.
- [ ] **Step 3: Read YouTube's API Services Terms and Required Minimum Functionality / Developer Policies** and record whether hiding native controls, a custom playbar and overlays on the player are permitted, quoting the clauses and URLs.
- [ ] **Step 4: Write `youtube-player-spike.md`** ending with `DECISION: GO` (custom playbar) or `DECISION: FALLBACK` (visible YouTube player, overlays on top, detect-and-rewind lock). Commit.

---

### Task 1: Workspace and `schema` package

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/schema/package.json`, `packages/schema/src/index.ts`, `packages/schema/src/sanitize.ts`, `packages/schema/src/youtube.ts`, `packages/schema/src/validate.ts`
- Test: `packages/schema/test/youtube.test.ts`, `sanitize.test.ts`, `validate.test.ts`

**Interfaces:**
- Produces (all exported from `@ivt/schema`):
  - `type InteractionType = 'multipleChoice' | 'trueFalse' | 'text' | 'link' | 'image'`
  - `interface Choice { id: string; html: string; correct: boolean; feedbackHtml?: string }`
  - `interface Interaction { id: string; type: InteractionType; time: number; order: number; promptHtml: string; choices?: Choice[]; hintHtml?: string; url?: string; imageAssetId?: string; alt?: string; decorative?: boolean }`
  - `interface Project { version: 1; title: string; videoId: string; settings: { disableForwardScrubbing: boolean; masteryPercent: number }; interactions: Interaction[] }`
  - `parseYouTubeId(input: string): string | null`
  - `sanitizeHtml(html: string): string`
  - `validateProject(p: unknown): { ok: true; project: Project } | { ok: false; errors: string[] }`
  - `exportBlockers(p: Project): string[]` (human-readable reasons export is blocked, e.g. missing alt text)

- [ ] **Step 1: Write failing tests.** `parseYouTubeId`: `'https://youtu.be/dQw4w9WgXcQ?t=30'`, `'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1'`, `'https://www.youtube.com/shorts/dQw4w9WgXcQ'`, `'https://www.youtube.com/embed/dQw4w9WgXcQ'` all return `'dQw4w9WgXcQ'`; `'not a link'` and `'https://vimeo.com/123'` return `null`. `sanitizeHtml('<p>hi<script>alert(1)</script><b onclick="x()">b</b></p>')` equals `'<p>hi<b>b</b></p>'`; `<a href="javascript:x">` loses its href; allowed `<a href="https://x.org">` gains `rel="noopener noreferrer"` and `target="_blank"`. `exportBlockers` returns one message per image interaction with neither `alt` nor `decorative: true` (the checkpoint-at-video-end check needs the video duration, so it lives in Task 9). `validateProject` rejects `masteryPercent` outside 0-100 and unknown interaction types.
- [ ] **Step 2: Run** `pnpm --filter @ivt/schema test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the signatures above. `sanitizeHtml` uses DOMPurify with allowed tags `p, br, b, strong, i, em, ul, ol, li, a` and attributes `href` only. Set up the workspace, Vitest and `.gitignore` (`node_modules`, `dist`, `.superpowers/`).
- [ ] **Step 4: Run** `pnpm --filter @ivt/schema test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(schema): project types, YouTube URL parsing, sanitizer`.

---

### Task 2: Player core logic (no UI)

**Files:**
- Create: `packages/player/package.json`, `packages/player/src/adapter.ts`, `src/scrubGuard.ts`, `src/scheduler.ts`, `src/fakeAdapter.ts`
- Test: `packages/player/test/scrubGuard.test.ts`, `scheduler.test.ts`

**Interfaces:**
- Consumes: `Interaction` from `@ivt/schema`.
- Produces:
  - `interface VideoAdapter { play(): void; pause(): void; seekTo(s: number): void; getCurrentTime(): number; getDuration(): number; setRate(r: number): void; setCaptions(on: boolean): void; on(ev: 'time' | 'state' | 'error', cb: (v: any) => void): void; destroy(): void }`
  - `class FakeAdapter implements VideoAdapter` with `advance(seconds: number)` and `emitError(code: number)` for tests.
  - `class ScrubGuard { constructor(o: { enabled: boolean; tolerance?: number }); furthest: number; update(t: number): number | null; release(): void }` — `update` returns the time to snap back to, or `null`; default tolerance 1.5 s so normal playback is never snapped.
  - `class InteractionScheduler { constructor(items: Interaction[], duration: number); due(prev: number, cur: number): Interaction[]; markSeen(id: string): void }` — `due` returns interactions with `prev < time <= cur`, sorted by `order`, excluding seen ones; times `>= duration` are ignored.

- [ ] **Step 1: Write failing tests.** ScrubGuard: enabled, `update(10)` then `update(40)` returns `10`; `update(11)` returns `null`; after `release()` `update(99)` returns `null`; disabled never returns a value. Scheduler: two interactions at `time: 5` with `order` 2 and 1 come back as order 1 then 2; after `markSeen`, a seek back then forward past 5 returns `[]`; an interaction at `time: 100` with `duration 100` is never returned; one at `99.5` is returned when crossing it (Review Focus 5).
- [ ] **Step 2: Run** `pnpm --filter @ivt/player test`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces. Follow the spike's DECISION: if FALLBACK, `ScrubGuard` still applies but the player will not hide native controls (Task 4).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(player): scrub guard and interaction scheduler`.

---

### Task 3: Scoring

**Files:**
- Create: `packages/player/src/scoring.ts`
- Test: `packages/player/test/scoring.test.ts`

**Interfaces:**
- Consumes: `Interaction`, `Project['settings']`.
- Produces:
  - `type Result = { raw: number; max: number; percent: number; passed: boolean; scored: boolean; status: 'passed' | 'failed' | 'completed' }`
  - `class ScoreState { constructor(items: Interaction[], masteryPercent: number); setAnswer(id: string, choiceIds: string[]): void; getAnswers(): Record<string, string[]>; isSubmitted(): boolean; submit(): Result }` — a question scores 1 only if the chosen set equals the correct set; unanswered scores 0; `submit()` is final (second call returns the same `Result`; later `setAnswer` calls throw). With no scored questions, `scored: false` and `status: 'completed'`.

- [ ] **Step 1: Write failing tests.** 4 scored questions, 3 correct, mastery 80 → `percent 75`, `status 'failed'`; 4/4 → `'passed'`; unanswered counts wrong; multiple-correct question needs the exact set; two `submit()` calls give equal results and `setAnswer` after submit throws; only text/image interactions → `{ scored: false, status: 'completed' }`; non-question interactions never count toward `max`.
- [ ] **Step 2: Run** `pnpm --filter @ivt/player test scoring`. Expected: FAIL.
- [ ] **Step 3: Implement** `ScoreState`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(player): scoring with final submission`.

---

### Task 4: Player UI (playbar, full-frame cards, accessibility)

**Files:**
- Create: `packages/player/src/YouTubeAdapter.ts`, `src/mount.ts`, `src/ui/playbar.ts`, `src/ui/card.ts`, `src/ui/submit.ts`, `src/ui/announcer.ts`, `src/styles.css`
- Test: `packages/player/e2e/player.spec.ts` (Playwright, uses `FakeAdapter` via `?adapter=fake`), `packages/player/test/announcer.test.ts`

**Interfaces:**
- Consumes: `VideoAdapter`, `ScrubGuard`, `InteractionScheduler`, `ScoreState`, `Project`.
- Produces:
  - `mount(el: HTMLElement, project: Project, opts: { adapter?: VideoAdapter; onResult?: (r: Result) => void; onProgress?: (s: { furthest: number; answers: Record<string, string[]>; submitted: boolean }) => void; initial?: { furthest: number; answers: Record<string, string[]>; submitted: boolean } }): { destroy(): void }`
  - `class Announcer { constructor(root: HTMLElement); say(msg: string): void }` (a polite `aria-live` region).

- [ ] **Step 1: Write failing e2e tests** (Playwright with the fake adapter). Reaching a checkpoint pauses the video and shows a dialog with `role="dialog"` and `aria-modal="true"`; focus is inside it; closing returns focus to the play button; Tab never leaves the open card. With `prefers-reduced-motion: reduce` the card has no transition. Submitting shows the score; the "Submit answers" button is at least 44×44 px. A video with no scored questions shows "Finish". With scrubbing disabled, a forward seek snaps back. `FakeAdapter.emitError(101)` (embed disabled) shows a visible message with a link to watch on YouTube. The Announcer test checks `say()` writes to an element with `aria-live="polite"`.
- [ ] **Step 2: Run** `pnpm --filter @ivt/player e2e`. Expected: FAIL.
- [ ] **Step 3: Implement.** `YouTubeAdapter` wraps the IFrame API (parameters per the spike DECISION). Cards enter with a CSS transition (opacity + 8px translate, 250 ms) disabled under `prefers-reduced-motion`. Playbar controls are real `<button>`s with labels; captions toggle drives `setCaptions`; speed control (cut first if time is short). Check contrast and 44 px targets in `styles.css`.
- [ ] **Step 4: Run** the e2e and unit tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(player): accessible playbar, full-frame cards, submit flow`.

---

### Task 5: SCORM 1.2 runtime and resume

**Files:**
- Create: `packages/scorm/package.json`, `src/client.ts`, `src/suspend.ts`
- Test: `packages/scorm/test/client.test.ts`, `suspend.test.ts`

**Interfaces:**
- Produces:
  - `interface ScormClient { connected: boolean; init(): void; setScore(raw: number, min: number, max: number): void; setStatus(s: 'passed' | 'failed' | 'incomplete' | 'completed'): void; getSuspend(): string; setSuspend(s: string): void; commit(): void; finish(): void }`
  - `createScormClient(win: Window): ScormClient` — walks `win.parent` chain (max 10) for `API`; when none is found returns a client with `connected: false` whose methods are no-ops.
  - `interface SuspendState { furthest: number; answers: Record<string, string[]>; submitted: boolean }`
  - `encodeSuspend(s: SuspendState, orderedIds: string[], limit?: number): string` (default limit 4096; answers stored by interaction index; if over limit, drops answers and keeps `furthest` and `submitted`)
  - `decodeSuspend(raw: string, orderedIds: string[]): SuspendState | null` (`null` for empty or malformed).

- [ ] **Step 1: Write failing tests.** Fake `API` object on a parent window: `createScormClient` finds it two levels up and `setScore(8,0,10)` calls `LMSSetValue('cmi.core.score.raw','8')`, `...min`, `...max`; `setStatus('passed')` sets `cmi.core.lesson_status`. No `API` → `connected === false` and no call throws (Review Focus 4). `encodeSuspend` → `decodeSuspend` round trip equals the input; 300 questions with answers produces a string `<= 4096` characters and still decodes with `furthest` and `submitted` intact (Review Focus 3); `decodeSuspend('garbage', ids)` returns `null`.
- [ ] **Step 2: Run** `pnpm --filter @ivt/scorm test`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules. Wire into the exported page (Task 6): on load `getSuspend` → `initial` for `mount`; `onProgress` → `setSuspend` + `commit` (status `incomplete`); `onResult` → `setScore`, `setStatus(result.status)`, `commit`, `finish`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(scorm): SCORM 1.2 client and compact suspend data`.

---

### Task 6: SCORM export

**Files:**
- Create: `packages/scorm/src/manifest.ts`, `src/exportZip.ts`, `src/launch.html.ts`
- Test: `packages/scorm/test/export.test.ts`

**Interfaces:**
- Consumes: `Project`, `ScormClient`, the built player bundle.
- Produces:
  - `buildManifest(title: string, files: string[]): string` (SCORM 1.2 `imsmanifest.xml` with one SCO, `adlcp:scormtype="sco"`, launch `index.html`)
  - `buildScormZip(project: Project, assets: Map<string, Uint8Array>, bundle: { js: string; css: string }): Promise<Blob>` (zip contains `imsmanifest.xml`, `index.html`, `player.js`, `player.css`, `project.json`, `assets/*`).

- [ ] **Step 1: Write failing tests.** Unzip the Blob: contains exactly the files listed; `imsmanifest.xml` parses as XML, has `<schemaversion>1.2</schemaversion>`, a resource with `href="index.html"`, and every listed file; `index.html` references `player.js` and has no external script other than the YouTube IFrame API; the title is XML-escaped (`A & B <c>`).
- [ ] **Step 2: Run** `pnpm --filter @ivt/scorm test export`. Expected: FAIL.
- [ ] **Step 3: Implement** with JSZip. The launch page imports the player bundle, creates the SCORM client and wires resume/progress/result as described in Task 5 Step 3.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(scorm): SCORM 1.2 package export`.

---

### Task 7: Editor shell, Step 1, storage, JSON import/export

**Files:**
- Create: `apps/editor/package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/steps/Setup.tsx`, `src/storage/projectStore.ts`, `src/storage/images.ts`
- Test: `apps/editor/test/projectStore.test.ts`, `apps/editor/test/images.test.ts`, `apps/editor/e2e/setup.spec.ts`

**Interfaces:**
- Consumes: `parseYouTubeId`, `validateProject`, `Project`.
- Produces:
  - `saveProject(p: Project): Promise<void>`, `loadProject(): Promise<Project | null>` (IndexedDB via idb-keyval)
  - `exportProjectJson(p: Project, assets: Map<string, Blob>): Promise<Blob>` and `importProjectJson(file: Blob): Promise<{ project: Project; assets: Map<string, Blob> }>` (round trip includes images)
  - `compressImage(file: File, maxEdge?: number, maxBytes?: number): Promise<Blob>` (default 1600 px, 800 KB; throws a readable error above the cap after compression)
  - `<App/>` three-step shell with a visible step indicator; `<Setup/>` with URL + title fields only.

- [ ] **Step 1: Write failing tests.** Save then load returns an equal project; export then import returns equal project and equal asset bytes; import of malformed JSON rejects with a readable message; `compressImage` on a 4000 px image returns a blob with longest edge `<= 1600`. E2E: pasting a bad URL shows "That doesn't look like a YouTube link" and keeps Next disabled; a good URL plus a title enables Next; Step 1 has exactly two inputs.
- [ ] **Step 2: Run** `pnpm --filter editor test` and `pnpm --filter editor e2e`. Expected: FAIL.
- [ ] **Step 3: Implement.** Autosave debounced 500 ms. Fetch the video's duration and availability through the IFrame API on Step 1; if unavailable or embed-disabled show a clear message (Review Focus 1). Page chrome follows the Spec's visual direction: calm, modern, color-coded.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(editor): shell, setup step, storage, JSON round trip`.

---

### Task 8: Editor Step 2: interactions

**Files:**
- Create: `apps/editor/src/steps/Interactions.tsx`, `src/components/ToolBar.tsx`, `Timeline.tsx`, `Drawer.tsx`, `RichText.tsx`, `src/steps/editors/{Question,Text,Link,Image}Editor.tsx`
- Test: `apps/editor/test/interactions.test.ts`, `apps/editor/e2e/interactions.spec.ts`

**Interfaces:**
- Consumes: `Interaction`, `sanitizeHtml`, `mount` (for live preview), `compressImage`.
- Produces:
  - `addInteraction(p: Project, type: InteractionType, time: number): Project` (assigns `id` and next `order`; clamps `time` to `[0, duration - 0.5]`)
  - `<RichText value onChange/>` emitting sanitized HTML only
  - `<Timeline/>` with one round node per interaction (keyboard-selectable), "+" adds at the current playhead.

- [ ] **Step 1: Write failing tests.** `addInteraction` twice at `time 5` gives `order` 1 and 2; time past the end is clamped; adding a multiple-choice question creates two empty choices with exactly one marked correct; unit: `RichText` onChange output never contains `<script>` after pasted input (Review Focus 2). E2E: five tool buttons exist in the top bar in the order Quiz, True/False, Text, Link, Image; clicking a tool adds a node at the playhead; clicking a node opens the drawer with that type's fields only; image without alt text shows an inline "Add alt text or mark decorative" error; every control is reachable by Tab and nodes by arrow keys.
- [ ] **Step 2: Run** `pnpm --filter editor test interactions` and the e2e spec. Expected: FAIL.
- [ ] **Step 3: Implement** with the layout from the spec: chunky color-coded tool buttons (subtle 3D press), timeline with round nodes, drawer under the timeline. Use a maintained rich-text library for `RichText` with only the allowed formatting.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(editor): interactions step with timeline and drawer`.

---

### Task 9: Editor Step 3: scoring, scrubbing, export

**Files:**
- Create: `apps/editor/src/steps/Finish.tsx`, `src/export/runExport.ts`
- Test: `apps/editor/test/runExport.test.ts`, `apps/editor/e2e/export.spec.ts`

**Interfaces:**
- Consumes: `exportBlockers`, `buildScormZip`, `Project.settings`.
- Produces:
  - `runExport(p: Project, assets: Map<string, Blob>): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; blockers: string[] }>` (filename is the slugified title + `.zip`; blockers include `exportBlockers` plus any checkpoint at or after the video end).
  - Step 3 UI: mastery threshold (0–100, default 80), the "Disable forward scrubbing" toggle, a summary of questions and points, and the Export button.

- [ ] **Step 1: Write failing tests.** `runExport` with a missing-alt image returns `ok: false` with that message; a clean project returns a Blob whose zip contains `imsmanifest.xml`; filename for title `"My Video!"` is `my-video.zip`; mastery `101` is rejected by the UI. E2E: toggle persists across reload; Export is disabled with a visible reason list while blockers exist.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** Step 3 and `runExport`. The scrubbing toggle sits here as one labelled switch with a one-line explanation.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(editor): scoring options and SCORM export`.

---

### Task 10: Accessibility pass

**Files:**
- Create: `apps/editor/e2e/a11y.spec.ts`, `packages/player/e2e/a11y.spec.ts`, `docs/accessibility-statement.md`, `docs/manual-a11y-checklist.md`
- Modify: whatever the audit flags in `apps/editor/src/**`, `packages/player/src/**`

**Interfaces:**
- Consumes: the running editor and an unzipped exported package served locally.

- [ ] **Step 1: Write the failing tests.** Axe scan (`wcag2a, wcag2aa, wcag21aa, wcag22aa` tags) on each editor step and on the player in these states: playing, question card open, feedback shown, submit screen. Expected zero violations. A keyboard-only Playwright flow completes the whole editor (add a question, set mastery, export) and the whole player (answer, submit).
- [ ] **Step 2: Run** `pnpm e2e a11y`. Expected: FAIL with the current violations.
- [ ] **Step 3: Fix** every violation; add the contrast check for author-chosen colors if the editor exposes any.
- [ ] **Step 4: Run.** Expected: PASS. Then complete `manual-a11y-checklist.md` with NVDA + Chrome and VoiceOver + Safari (open card announced, focus return, captions toggle, result announced) and record outcomes.
- [ ] **Step 5: Write `accessibility-statement.md`** (what is supported, known gaps, how to report problems) with no certification claims. Commit.

---

### Task 11: LMS acceptance

**Files:**
- Create: `docs/lms-acceptance.md`
- Modify: `packages/scorm/src/**` only if a mapping change is needed

**Interfaces:**
- Consumes: an exported `.zip` of a sample project with 4 scored questions, mastery 80.

- [ ] **Step 1: Upload the sample package to SCORM Cloud**; confirm launch, resume after closing mid-video, score `raw/min/max`, and status `passed`/`failed` after Submit.
- [ ] **Step 2: Repeat in Moodle and in Canvas.** For each, record in `lms-acceptance.md` how the gradebook shows the score and status, and any difference (e.g. how an `incomplete` attempt appears).
- [ ] **Step 3: Fix mapping differences** in `packages/scorm` with a test per fix, then re-run Steps 1–2.
- [ ] **Step 4: Commit** `docs: LMS acceptance results` plus any fixes.

---

## Self-Review

- **Spec coverage:** three-step flow (7, 8, 9); five interactions and drawer (8); scored feedback and Submit (3, 4); gradebook score (5, 6, 11); scrub toggle (2, 9); full-frame takeover and reduced motion (4); WCAG/UDL/ATAG items (4, 8, 10); client-only storage and JSON round trip (7); spike and YouTube terms (0); Canvas/Moodle acceptance (11); cut line (Global Constraints).
- **Types:** `Result`, `SuspendState`, `VideoAdapter`, `Interaction` and `Project` are defined once (Tasks 1–5) and consumed by name later.
- **Known gap:** UDL hints appear in the data model (`hintHtml`) and the drawer; if cut, remove them together.
