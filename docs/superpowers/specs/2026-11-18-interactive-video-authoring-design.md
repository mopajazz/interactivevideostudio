# Interactive Video Authoring Tool: Design (working title)

Status: draft for approval. Date: 2026-11-18.

## Intent and why

The author's organization has a large library of H5P content and is not leaving H5P. Interactive Video is its most-used content type, but authoring it is poor: dozens of unclear text boxes, no real rich-text or design tools, settings buried in menus, and a long list of overlay options of which about 75% are never used (several need heavy builds, e.g. drag and drop). On the learner side, submitting answers is a tiny star at the end of the playbar.

This project is a modern authoring tool for YouTube-based interactive video that feels like "Duolingo meets H5P": prettier, calmer, with a buttery feel and tasteful animation, and far less clutter. It exports a SCORM 1.2 package, with our own player, that sends the score to the LMS gradebook. It doubles as a portfolio piece, so the authoring experience is the star. A paid product is a hedge, not a plan.

Audience: authors are instructional designers and educators like the project owner and their colleagues. Learners meet the result inside an LMS.

## Goals

1. A three-step authoring flow, kept from H5P because the owner finds it sound:
   1. **Setup:** a YouTube URL and a title. Nothing else.
   2. **Interactions:** tools across the top of the video, a timeline with checkpoint markers, a settings drawer below.
   3. **Scoring and export:** mastery and grading options, then export.
2. Five interaction types: multiple choice, true/false, text overlay, link out, image.
3. Scored questions (multiple choice, true/false) with per-question feedback.
4. Learner-side answers are held until the learner presses a large, obvious **Submit answers** button; the score goes to the gradebook.
5. One clear author toggle to disable forward scrubbing.
6. Interactions appear as calm, full-frame takeovers (video pauses and dims), not small icons.
7. Accessibility built in to WCAG 2.2 AA, with UDL options (see Accessibility).
8. Export as a self-contained SCORM 1.2 zip using our own player.

## Non-goals

- Offline use or any video source other than YouTube (no direct video, Vimeo, PeerTube or HLS).
- H5P export. It can come later at lower fidelity, because H5P's own player would render it.
- Backend, accounts, cloud save, sharing or collaboration.
- Detailed analytics, an "I certify I watched" box, or any compliance attestation.
- Branching, xAPI, LTI, AI assist, or other interaction types.
- A VPAT/ACR or any certification claim in the MVP.

## Anti-goals (a failure even if it technically works)

- Clutter: option bloat, menus to dig through, unlabeled text boxes.
- A hidden or tiny way for learners to submit.
- Content or learner data leaving the author's machine.
- Motion that can't be turned down.

## Constraints and known risks

- YouTube's IFrame API gives play, pause, seek and time, and nothing more. Seeking cannot be blocked inside the iframe.
- The video needs YouTube to be reachable; the package is not offline-capable.
- SCORM 1.2 reports only a score (raw/min/max), a status, and a short `suspend_data` string (about 4 KB). Gradebook behavior varies by LMS.
- **Unverified risk:** YouTube's API terms may restrict hiding its controls or covering its player. Our custom playbar and full-frame overlays depend on that being allowed. Check before any public release.
- The owner's LMSs are Canvas and Moodle, both of which accept SCORM 1.2. The target is any SCORM 1.2 LMS; acceptance testing covers both, and SCORM Cloud is a stand-in until a course in each is available. Gradebook behavior differs between them, so the score and status mapping must be checked in each.
- Research limits: the `semantics.json` file from H5P's GitHub (unpinned master) was read. H5P's accessibility overview (hosted on documentation.h5p.com) was not reachable. No claim here relies on it.

## Approaches considered

- **A. Client-only app (chosen).** The editor runs in the browser. A project is a JSON file, autosaved locally and importable/exportable. SCORM export zips a prebuilt player, the config, images and the manifest in the browser. *Trade-off:* no cloud save or sharing. *Why:* content never leaves the machine, it's cheap to host and demo, and it shows the editor best.
- **B. Client plus backend** with accounts and a database. Rejected for the MVP: auth, database and hosting are a large share of the work and don't address the stated problem. It can be added later because projects are already JSON.
- Dropped: a Moodle plugin (ties the project to one LMS) and H5P-first export (the learner experience would be H5P's, not ours).

## Design decisions

### Author interface (layout "A, with C's checkpoint markers")
- Five color-coded, chunky tool buttons across the top of the video: Quiz, True/False, Text, Link, Image. Subtle 3D press effect.
- Timeline under the video. Each interaction is a round checkpoint node. "+" or a tool button adds one at the current playhead time. Clicking a node opens it.
- A settings drawer under the timeline opens for the selected node. It contains a real rich-text field and only the settings that matter for that type.
- Smooth, restrained animation throughout (drawer, node placement, transitions).

### Learner experience
- At an interaction's time the video pauses and dims; a full-frame card enters with a calm, modern transition. Reduced-motion users get a simple fade or none.
- Scored questions show feedback. Answers are held; the final **Submit answers** screen has a large primary button and shows the score.
- Text and Image cards have a "Continue" button; Link has "Open link" plus "Continue". All five types pause the video. *(My call, not the owner's.)*

### Scrubbing toggle
- One author setting: "Disable forward scrubbing." When on, YouTube's controls and keyboard shortcuts are hidden or disabled, our own playbar is shown, and any attempt to seek past the furthest-watched point snaps back.
- Our own playbar is used in both modes so the look stays consistent. *(My call.)*

### Grading and SCORM
- Mastery model: the score is the result. Step 3 has a single mastery threshold. Default 80%, adjustable. *(My call; owner said "mastery" without a number.)*
- SCORM 1.2 mapping: `cmi.core.score.raw/min/max`, and `lesson_status` set to `passed` or `failed` against the threshold. A learner who never submits stays `incomplete`. *(My call.)*
- Per-question retry and show-solution are author choices with sensible defaults.
- Submission is final (owner's decision): no whole-video retry after Submit, so there is one score per launch and no best-or-latest logic. Any retry beyond that is up to the LMS's own attempt settings.

### Accessibility (build in, not bolt on)
Target WCAG 2.2 AA; the editor follows ATAG 2.0 principles (the editor itself is accessible and helps authors produce accessible content). *(My call.)*
- Full keyboard operation of editor, player and every interaction. Visible focus, no traps.
- Focus moves into each full-frame card when it opens and returns to the playbar when it closes. Screen readers hear an announcement as a card appears, and when answers are right or wrong.
- Captions: a visible toggle in our playbar, driven by YouTube's own caption track. The editor prompts the author to confirm the video has captions, since the content's accessibility depends on it.
- Images require alt text or an explicit "decorative" mark before export.
- Contrast is checked in the editor for any author-chosen colors; the player meets contrast and target-size requirements and reflows at zoom and on small screens.
- Reduced-motion support everywhere.
- UDL options: playback speed control, optional hints on questions, no time pressure, retry setting, show-solution setting, multiple representations (text, image and captions).
- An accessibility statement ships with the project. No VPAT or compliance claims in the MVP.

### Technology (my calls)
TypeScript throughout; React for the editor; a small, framework-free player bundle shared by the editor's live preview and the exported package; client-side zipping; autosave to local storage plus JSON import/export; a maintained rich-text library for the editor field.

## Calls made after builder review (my calls, not the owner's)

- **Build order and fallback.** The plan starts with a short spike that proves the custom playbar, full-frame overlays and scrub lock on a YouTube embed, and reviews YouTube's API terms. If the terms don't allow hiding controls, the fallback is the visible YouTube player with overlays on top and a weaker "detect and rewind" lock. The rest of the design is unchanged.
- **Furthest-watched and resume.** Resume is supported: `suspend_data` holds answers, held-answer state and the furthest-watched point, kept compact. The scrub lock applies until the learner submits; after that they can rewatch freely and nothing is re-scored.
- **Edge cases in scoring.** Unanswered questions count as wrong. Submit appears once the learner reaches the end. All questions are worth equal points. A video with zero scored questions shows "Finish" instead of "Submit answers" and exports as `completed`.
- **Images and storage.** Images are compressed on import with a size cap, and projects autosave to IndexedDB (local storage is too small). JSON export bundles images so import is a faithful round trip.
- **Timeline edges.** Two checkpoints may share a time and play in the order added. A checkpoint can't be placed at or after the video's end. Seeking backward does not retrigger a question already answered.
- **Rich text.** Bold, italic, lists and links, stored as sanitized HTML. Math is out of the MVP. The player never runs author-supplied scripts, since it runs inside the LMS.
- **MVP cut line.** In: all five types, the three steps, scrub toggle, Submit and gradebook score, keyboard and screen-reader support, required alt text, reduced motion. First to cut if time is short: playback speed, hints, and the finer animation polish.

## Left to the builder
Visual design tokens and exact animation specs, copy and microcopy, the project JSON schema, the rich-text library choice, project structure, and test strategy (including a real-LMS SCORM test and automated plus manual accessibility testing).
