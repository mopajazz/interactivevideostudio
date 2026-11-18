# Accessibility statement

**Interactive Video Studio** (working title): the authoring tool (editor) and the learner player it exports as a SCORM 1.2 package.

Last reviewed: 18 November 2026, for the first (MVP) version.

## Our aim, and what this statement is not

We aim for the editor and the learner player to meet the **Web Content Accessibility Guidelines (WCAG) 2.2 at level AA**. The editor also follows the principles of the **Authoring Tool Accessibility Guidelines (ATAG) 2.0**: the editor itself should be usable by authors with disabilities, and it should help every author make content that learners with disabilities can use.

This statement describes what we built and what we tested. **It is not a claim of conformance or a certification.** No independent audit has been done, and there is no VPAT. Some things are still unverified; they are listed honestly under [Known gaps and what is unverified](#known-gaps-and-what-is-unverified).

## What is built in

### In the editor (for authors)

- **Keyboard.** Every step, button, field, dialog and the timeline can be used with the keyboard alone. A "Skip to main content" link comes first. Focus is always visible (a thick ring), and it moves to the new step's heading when you change step.
- **No dragging needed.** Checkpoint times are set with the "Move to playhead" button or by typing a time like 1:05, so nothing depends on dragging with a mouse.
- **Timeline.** The checkpoints are one Tab stop: arrow keys, Home and End move between them, and Delete asks before removing one. Each checkpoint has a spoken name such as "Quiz question 1 at 0:30", and one placed past the end of the video says so in words, not just with an icon.
- **Labels, hints and errors.** Every field has a visible label and hint. Errors are shown in words beside an icon (never by color alone), tied to their field, and announced politely by screen readers. Buttons that can't be used yet stay focusable and say why (for example, "Fix the 2 items below to export"), and that reason is announced when it changes.
- **Helping you make accessible content (ATAG Part B).** An image can't be exported until it has alt text or is marked as decorative. Link checkpoints need a valid web address before export. Step 3 lists everything that blocks export, each with a "Go to checkpoint" button.
- **Dialogs.** Confirmations and "Preview as learner" are modal dialogs: focus goes into them, Escape closes them, and focus returns to the button you used. Escape closes the preview even while a question is waiting for an answer.
- **Status messages.** Save problems, import and export results, and a video that fails to load are all shown on screen and announced. After you discard damaged data, focus moves to the main content instead of being lost.
- **Display.** Light and dark themes follow your system setting, and each documented color pair meets WCAG contrast. Animation is turned off when your system asks for reduced motion. Windows High Contrast (forced colors) keeps borders and focus rings visible. The layout reflows to a 320 px wide window (the same as 400% zoom on a 1280 px screen) without sideways scrolling. Targets are at least 44 by 44 px.
- **Rich text.** The formatting toolbar uses labelled buttons that say whether they are on, with keyboard shortcuts listed on screen.
- **Colors.** The editor doesn't let authors choose colors, so there is no author color to check for contrast.

### In the learner player (what learners get)

- **Our own playbar** made of standard controls: Play/Pause, a progress slider that reads the time in words ("1 minute 5 seconds of 3 minutes"), a Captions button that says whether captions are on, and a playback speed menu (0.5× to 2×). YouTube's own controls are hidden and can't be reached by Tab.
- **Each checkpoint card** pauses the video and opens as a dialog. Focus moves into it, Tab stays inside it (also when the package runs inside an LMS frame), and focus returns to the playbar when it closes. The player announces "Video paused.", and the dialog is named after the card, such as "Question" or "Note" (how real screen readers read this is still to be checked).
- **Questions** use real radio buttons or checkboxes in a labelled group. "Check answer" with nothing chosen shows and announces "Choose an answer first." Feedback says "Correct" or "Incorrect" in words (not just color) and is announced, with any feedback the author wrote.
- **No time pressure.** The video waits on every card. Hints are optional, and only appear when the learner asks.
- **The end screen** has one large "Submit answers" button (or "Finish" if nothing is scored). The score is shown, announced and given focus.
- **Errors.** If the video can't play (for example, its owner doesn't allow embedding), a message explains why and links to the video on YouTube, and the playbar is disabled and taken out of the Tab order so it doesn't look usable.
- **Display.** Reduced motion turns off the card animation. Forced colors keep button borders visible. The player reflows to 320 px wide. The exported launch page has a language, a page title, one main landmark and a level-one heading with the activity title.

### What authors still need to do

The tool can't check everything. For accessible content, please:

- choose a video that has **accurate captions** (YouTube's automatic captions are often wrong), and a transcript if you can;
- write **alt text** that says what an image shows and why it matters;
- write link text that says **where a link goes**;
- use plain language in questions and feedback, and keep hints helpful rather than giving the answer away.

## How we checked

These checks run automatically with the project's tests, in Chromium (Playwright 1.63.0):

- **axe-core 4.14** (through `@axe-core/playwright` 4.14.0) with the WCAG 2.0 A and AA, WCAG 2.1 AA and WCAG 2.2 AA rule sets. Zero violations are required. Best-practice rules also run; serious or critical findings fail the tests, and lesser ones are reported.
  - **Editor**, each in the light theme, the dark theme and with reduced motion: Step 1 (valid; an invalid link with its error; a video that can't be embedded), Step 2 (empty; each of the five checkpoint drawers; the image drawer with its missing-alt-text message; the link drawer with its missing-address message; a checkpoint past the end of the video; "Preview as learner" with a question showing), Step 3 (ready; with blockers; with an invalid mastery score), the confirmation dialog, the damaged-data bar, and the "saving is unavailable" notice.
  - **Player:** playing with the playbar; a multiple-choice card (with its hint open); a true/false card (with the "choose an answer" message); feedback; the text, link and image cards; the Submit answers screen; the Finish screen; the results; the error panel; the player inside an LMS-style frame; and the launch page of a real exported, unzipped package.
- **Reflow:** no sideways scrolling at 320 CSS px wide in every editor step, drawer and dialog, the preview, and the player's states.
- **Forced colors** (emulated): the five tool buttons, the checkpoints (and the extra ring on the selected one), the focus ring, the Export button and the player's Submit answers and Finish buttons keep visible edges.
- **Keyboard only** (no mouse): the whole editor, from pasting a link to downloading the package (adding a quiz question, its choices, marking an answer correct, its time, the mastery score); and the whole player, from Play to the results. Focus is checked at each step.
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
- **Known axe finding, not in the product:** the player's internal test page has no level-one heading (axe best-practice `page-has-heading-one`). The exported launch page has one, so learners are not affected.

## Tell us about a problem

If something in the editor or the learner player doesn't work for you, please tell us. Include what you were doing, what happened, and your browser and assistive technology (for example, "NVDA 2024.4 with Chrome 131") if you use one.

Contact: **[OWNER TO FILL IN: name, email address or web form, and how soon you will reply]**

Learners who have a problem inside a course can also ask their instructor or LMS administrator, who can pass it on.
