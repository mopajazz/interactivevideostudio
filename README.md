# Interactive Video Studio (working title)

A browser-based authoring tool for interactive YouTube videos. An author pastes a YouTube link, adds checkpoints on a
timeline (multiple choice, true/false, text, link and image cards), sets a mastery score, and exports a **SCORM 1.2**
package. The package contains our own small learner player: at each checkpoint the video pauses and a full-frame card
opens; at the end the learner presses **Submit answers** and the score goes to the LMS gradebook.

Everything runs in the browser. There is no backend: projects autosave to the browser's IndexedDB and can be
exported and imported as a JSON file. The design and its reasons are in
[docs/superpowers/specs/2026-11-18-interactive-video-authoring-design.md](docs/superpowers/specs/2026-11-18-interactive-video-authoring-design.md);
the build plan is [docs/superpowers/plans/2026-11-18-interactive-video-authoring.md](docs/superpowers/plans/2026-11-18-interactive-video-authoring.md).

## Requirements

- **Node 22** and **pnpm 10** (the repository's `packageManager` field names the exact pnpm version; `corepack enable` picks it up).
- For the browser tests, a Chromium that Playwright can drive (see [End-to-end tests](#end-to-end-tests)).
- The editor and exported packages need **youtube.com** to be reachable to play videos.

## Getting started

From the repository root:

```sh
pnpm install
pnpm dev        # the editor, at http://localhost:5175/
```

`pnpm dev` first builds the learner bundles (the player and the SCORM launch script), then starts the editor's dev
server. To try a ready-made project, open the editor and use **Import JSON** with
[`examples/lms-acceptance-sample.json`](examples/lms-acceptance-sample.json).

## Scripts (repository root)

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds the learner bundles, then runs the editor's dev server. |
| `pnpm build` | Builds the learner bundles and the editor for production. |
| `pnpm test` | Unit tests in every package (Vitest). Also builds the sample package once (see below). |
| `pnpm e2e` | Browser tests: the player's, then the editor's (Playwright, Chromium). |
| `pnpm run sample:package` | Builds `out/lms-acceptance-sample.zip` from the example project, with the editor's own import and export code. |
| `pnpm run sample:package -- --check` | The same, then validates the zip (exact file list, manifest references, launch page, `project.json` against the schema). Exits 1 on a problem. |

The sample script also takes `--variant=video-only|reworded|changed` and `--duration=SECONDS`; see the comment at the
top of [`scripts/build-sample-package.mjs`](scripts/build-sample-package.mjs) and
[docs/lms-acceptance.md](docs/lms-acceptance.md), which says what each variant is for.

### Where `dist/` comes from

Nothing built is committed. `packages/player/dist/` (`player.js`, `player.css`) and `packages/scorm/dist/launch.js`
are the learner bundles every exported package ships; the editor imports them as text. The editor's `dev`, `build`,
`test` and `e2e` scripts build them first (`pnpm --filter editor bundles`), so a fresh clone works without a manual
step. `apps/editor/dist/` is the editor's production build from `pnpm build`. `out/` holds the sample packages.

### End-to-end tests

The Playwright configs use Playwright's own browser by default. On a developer machine, install it once:

```sh
pnpm --filter editor exec playwright install chromium
```

To use a Chromium already on the machine instead, set `CHROMIUM_PATH`:

```sh
CHROMIUM_PATH=/path/to/chromium pnpm e2e
```

The e2e tests never contact YouTube: they use a stand-in video adapter, or a stub of the YouTube IFrame API, and a
recording fake of the SCORM API.

## Layout

| Path | What it is |
| --- | --- |
| `packages/schema` | The project JSON types, `validateProject`, `exportBlockers`, the HTML sanitizer, settings defaults (`resolveSettings`). |
| `packages/player` | The framework-free learner player: YouTube adapter, scheduler, scrub lock, cards, playbar, final screen. Used by the editor's preview and inside every package. |
| `packages/scorm` | The SCORM 1.2 side: finding the LMS API, `suspend_data` encoding, the launch glue (score, status, resume, commits), the manifest and the zip. |
| `apps/editor` | The React editor (three steps: Setup, Interactions, Scoring & export), local storage, JSON import and export. |
| `scripts/` | `build-sample-package.mjs` and `check-package.mjs` (package validation). |
| `examples/` | The LMS acceptance sample project. |
| `docs/` | The accessibility statement, the manual screen-reader checklist, the LMS acceptance script, and the spec and plan. |
| `spike/` | The early YouTube player spike (a stub-only check, kept for reference). |

## Documentation

- [docs/accessibility-statement.md](docs/accessibility-statement.md): what is built for accessibility, what the tests check, and the known gaps.
- [docs/manual-a11y-checklist.md](docs/manual-a11y-checklist.md): the screen-reader script (NVDA, VoiceOver); every result is still PENDING.
- [docs/lms-acceptance.md](docs/lms-acceptance.md): the script for the first real LMS runs (SCORM Cloud, Moodle, Canvas); every result is still PENDING.
- The design spec and build plan, linked above.

## What is not verified yet

Be clear about this before relying on the tool:

- **Real YouTube behavior.** All automated tests use a stand-in for the YouTube player, because YouTube was unreachable where this was built. Captions, speed, focus inside YouTube's frame, YouTube's own errors, resume seeking before the first play, and whether a phone starts the video from our Play button are unverified.
- **Real LMS runs.** No LMS has run a package yet. Score and status mapping, resume, commit behavior, `cmi.core.exit` and `session_time`, and what happens after Submit have only been checked against a fake SCORM API. The script is [docs/lms-acceptance.md](docs/lms-acceptance.md).
- **Screen readers.** No screen reader has been used with the editor or the player. The script is [docs/manual-a11y-checklist.md](docs/manual-a11y-checklist.md).
- **Browsers.** Automated tests run in Chromium only.

## Decisions the owner still has to make

- **License.** There is no LICENSE file yet; until there is one, the code is not licensed for reuse.
- **Defaults for retry and show-solution.** Currently "Let learners try a question again" is off and "Show the correct answer after checking" is on by default (`packages/schema/src/settings.ts`). Please confirm.
- **YouTube API terms.** Hiding YouTube's controls and covering the player with our own playbar and cards must be checked against YouTube's Developer Policies before any public release.
- **Privacy-enhanced embed.** Whether to use `youtube-nocookie.com` for the embed.
- **Canvas route.** How your Canvas ingests SCORM packages (built-in, an external tool, or an LTI integration); the acceptance script records it as an open question.
