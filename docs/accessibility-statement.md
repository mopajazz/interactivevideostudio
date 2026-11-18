# Accessibility statement

**Interactive Video Studio** (working title): the authoring tool (editor) and the learner player it exports as a SCORM 1.2 package.

Last reviewed: 18 November 2026, for the first (MVP) version.

## Our aim, and what this statement is not

We aim for the editor and the learner player to meet the **Web Content Accessibility Guidelines (WCAG) 2.2 at level AA**. The editor also follows the principles of the **Authoring Tool Accessibility Guidelines (ATAG) 2.0**: the editor itself should be usable by authors with disabilities, and it should help every author make content that learners with disabilities can use.

This statement describes what we built and what we tested. **It is not a claim of conformance or a certification.** No independent audit has been done, and there is no VPAT. Some things are still unverified; they are listed honestly under [Known gaps and what is unverified](#known-gaps-and-what-is-unverified).

## What is built in

Each point below says either what it was **designed for** (built that way, but not checked by a test), or which **automated check** backs it and where that check stops. The test files are `apps/editor/e2e/*.spec.ts` (editor) and `packages/player/e2e/*.spec.ts` (player). They run in Chromium only, with a stand-in for the YouTube player. No point below has been checked with a real screen reader yet.

### In the editor (for authors)

- **Keyboard.** Designed so that the steps, buttons, fields, dialogs and the timeline can be used with the keyboard alone. Checked by Playwright keyboard-only tests for one complete editor flow (link, title, a quiz question with its choices, correct answer and time, the mastery score, Export) and for the timeline, dialogs and Step 3 blockers; parts of the editor outside those flows are designed for keyboard use but not each tested.
- **Skip link and focus.** Designed with a "Skip to main content" link first and a visible focus ring (not tested). Tests check that focus moves to the new step's heading when you change step, and that a focus ring is drawn in emulated forced colors.
- **No dragging needed.** Designed so checkpoint times are set with the "Move to playhead" button or by typing a time like 1:05, not by dragging (WCAG 2.5.7). Typing a time is part of the keyboard test.
- **Timeline.** Designed as one Tab stop where arrow keys, Home and End move between checkpoints and Delete asks before removing one. Tests check the arrow keys, Delete with its confirmation, and each checkpoint's name (such as "Quiz question 1 at 0:30", with ", past the end of the video" when it is), as computed by the browser.
- **Labels, hints and errors.** Designed so every field has a visible label and hint, and errors are shown in words beside an icon (not by color alone). Tests check the error messages for the link, image alt text, web address, time and mastery fields, and that their live regions are always present so screen readers can announce them (announcement itself not yet heard with a screen reader). Buttons that can't be used yet stay focusable and say why (for example, "Fix the 2 items below to export"); tests check that the reason is a polite live region that updates in place.
- **Helping authors make content learners can use (ATAG Part B).** Tests check that export is blocked until each image has alt text or is marked decorative, and until each link checkpoint has a valid web address, and that Step 3 lists each blocker with a "Go to checkpoint" button that opens it.
- **Dialogs.** Designed as modal dialogs. Tests check, for the confirmation dialogs and "Preview as learner", that focus goes into them, Escape closes them and focus returns to the button you used, and that Escape closes the preview even while a question is waiting for an answer.
- **Status messages.** Tests check that save problems, import and export results, and the author's video failing to load are shown on screen in live regions, and that focus moves to the main content after you discard damaged data.
- **Contrast.** The color pairs in the editor's design tokens (`apps/editor/src/styles/tokens.css`) were chosen and their contrast ratios computed and reviewed by hand, not by a test. Axe checked the contrast of the rendered states listed under [How we checked](#how-we-checked), in the light and dark themes; it can't check every pair in every state.
- **Display.** Designed so light and dark themes follow your system setting and animation is turned off when your system asks for reduced motion; tests check the reduced-motion setting on the step-3 switch, and axe ran with reduced motion on. Forced colors (Windows High Contrast) were only **emulated** in Chromium: tests check that the tool buttons, checkpoints, focus ring and Export button keep visible edges there; real Windows High Contrast is unverified. Reflow: tests check there is no sideways scrolling at 320 px wide in the states listed under How we checked.
- **Target size.** Designed for targets of at least 44 by 44 px. Only the mastery field, the scrubbing switch and the Export button are measured by a test (at least 44 px tall).
- **Rich text.** Designed with a formatting toolbar of labelled buttons that say whether they are on, and keyboard shortcuts listed on screen. How screen readers read it is unverified (see known gaps).
- **Colors chosen by authors.** The editor doesn't let authors choose colors, so there is no author color to check for contrast.

### In the learner player (what learners get)

- **Our own playbar.** Designed with standard controls: Play/Pause, a progress slider that reads the time in words ("1 minute 5 seconds of 3 minutes"), a Captions button that says whether captions are on, and a playback speed menu (0.5× to 2×). Tests check the Tab order, the slider's time in words, the Captions button's pressed state and the speed setting with the stand-in player, and that the video area can't be reached by Tab. Whether YouTube's real frame stays out of reach is unverified.
- **Checkpoint cards.** Tests check that a card pauses the video and opens as a dialog, that focus moves into it, that Tab and Shift+Tab stay inside it (also inside an LMS-style frame), and that focus returns to the playbar when it closes. The player announces "Video paused.", and the dialog is named after the card, such as "Question" or "Note"; the test reads the live region's text, not what a real screen reader says.
- **Questions.** Designed with real radio buttons or checkboxes in a labelled group. Tests check that "Check answer" with nothing chosen shows "Choose an answer first." and puts it in the live region, and that feedback says "Correct" or "Incorrect" in words with any feedback the author wrote, also in the live region.
- **No time pressure.** Designed so the video waits on every card and hints are optional. Tests check that the video stays paused while a question card is open and that a hint appears only after "Show hint".
- **The end screen.** Tests check one "Submit answers" button (or "Finish" if nothing is scored) at least 44 by 44 px, and that the score is shown, put in the live region and given focus.
- **Errors.** Tests check that if the video can't play (for example, its owner doesn't allow embedding), a message explains why and links to the video on YouTube, and that the playbar is then made inert and marked disabled. That takes it out of the Tab order **and** hides it from screen readers (see known gaps).
- **Display.** Tests check that reduced motion turns off the card animation, that the Submit answers and Finish buttons keep visible borders in **emulated** forced colors, and that the player has no sideways scrolling at 320 px wide in the states tested. Player colors were chosen and their ratios computed by hand; axe checked contrast in the rendered states listed below. A unit test checks that the exported launch page has one main landmark and a level-one heading with the activity title; axe checked its language and page title.

### What authors still need to do

The tool can't check everything. To help more learners use your content, please:

- choose a video that has **accurate captions** (YouTube's automatic captions are often wrong), and a transcript if you can;
- write **alt text** that says what an image shows and why it matters;
- write link text that says **where a link goes**;
- use plain language in questions and feedback, and keep hints helpful rather than giving the answer away.

## How we checked

These checks run automatically with the project's tests, in Chromium (Playwright 1.63.0):

- **axe-core 4.14** (through `@axe-core/playwright` 4.14.0) with the WCAG 2.0 A and AA, WCAG 2.1 AA and WCAG 2.2 AA rule sets. Zero violations are required. Best-practice rules also run; serious or critical findings fail the tests, and lesser ones are reported.
  - **Editor**, each in the light theme, the dark theme and with reduced motion: Step 1 (valid; an invalid link with its error; a video that can't be embedded), Step 2 (empty; each of the five checkpoint drawers; the image drawer with its missing-alt-text message; the link drawer with its missing-address message; a checkpoint past the end of the video; "Preview as learner" with a question showing), Step 3 (ready; with blockers; with an invalid mastery score), the confirmation dialog, the damaged-data bar, and the "saving is unavailable" notice.
  - **Player:** playing with the playbar; a multiple-choice card (with its hint open); a true/false card (with the "choose an answer" message); feedback; the text, link and image cards; the Submit answers screen; the Finish screen; the results; the error panel; the player inside an LMS-style frame; and the launch page of a real exported, unzipped package.
- **Reflow:** no sideways scrolling at 320 CSS px wide in each of the three editor steps (with each of the five drawers), the damaged-data bar, the confirmation dialog, the preview with a card, and the player while playing, on a card, with feedback, on the final screen and on the error panel.
- **Forced colors** (emulated): the five tool buttons, the checkpoints (and the extra ring on the selected one), the focus ring, the Export button and the player's Submit answers and Finish buttons keep visible edges.
- **Keyboard only** (no mouse): one complete editor flow, from pasting a link to downloading the package (adding a quiz question, its choices, marking an answer correct, its time, the mastery score); and one complete player flow, from Play to the results. Focus is checked at each step.
- **Screen reader announcements** (in the test browser, by reading what the live region says, not with a real screen reader): a card announces "Video paused." without repeating the dialog's name, and the end screen adds nothing its title already says.

Automated tools find only some accessibility problems. They can't tell whether something is easy to understand or pleasant to use with a screen reader.

## Known gaps and what is unverified

- **Screen readers have not been tested.** No screen reader was available where this version was built. The script in [manual-a11y-checklist.md](manual-a11y-checklist.md) (NVDA with Chrome, VoiceOver with Safari) is written, and every result is still PENDING.
- **The real YouTube player is unverified.** All automated tests use a stand-in player, because YouTube couldn't be reached from the build environment. Not yet checked with the real player: that the Captions button really shows captions (it picks the video's first caption track; learners can't choose a language), that speed changes work, that YouTube's frame never takes keyboard focus, and how YouTube's own errors and loading states behave.
- **Captions and other third-party content.** Whether a video has captions, and how good they are, depends on the video the author picks. The design asks the editor to remind authors to confirm the video has captions; **this reminder is not built yet.**
- **The rich-text editor (Tiptap)** has labelled buttons and shortcuts, but how screen readers read its editing area, lists and link form is unverified.
- **Photo orientation.** Turning photos the right way up (EXIF orientation) was tested only with a small generated test image in Chromium, not with real camera photos or other browsers.
- **Browsers.** Automated checks ran only in Chromium. Safari, Firefox, mobile browsers, real browser zoom, and real Windows High Contrast are unverified. Text spacing changes (WCAG 1.4.12) were not tested.
- **Language.** Pages are marked as English. Content written in another language isn't marked, so screen readers may pronounce it wrongly.
- **Not in this version:** per-question retry and "show the solution" settings.
- **New tabs.** A Link card's "Open link" opens a new tab without saying so beforehand.
- **Focus while a card is open** is kept inside the whole player page. That is right when the package runs in its own LMS frame, but a host page that puts other controls on the same page would find them unreachable until the card closes.
- **Axe "incomplete" results are not reviewed.** Axe reports some checks it can't decide, such as text contrast over the video or over the dimmed overlay behind a card. The tests fail only on clear violations; these undecided results were not looked at by a person.
- **After a fatal player error the playbar is hidden from screen readers**, not only removed from the Tab order. A screen reader user hears the error message and the "Watch on YouTube" link, but not that the playbar exists.
- **Known axe finding, not in the product:** the player's internal test page has no level-one heading (axe best-practice `page-has-heading-one`). The exported launch page has one, so learners are not affected.

## Tell us about a problem

If something in the editor or the learner player doesn't work for you, please tell us. Include what you were doing, what happened, and your browser and assistive technology (for example, "NVDA 2024.4 with Chrome 131") if you use one.

Contact: **[OWNER TO FILL IN: name, email address or web form, and how soon you will reply]**

Learners who have a problem inside a course can also ask their instructor or LMS administrator, who can pass it on.
