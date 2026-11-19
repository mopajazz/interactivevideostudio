# Manual accessibility checklist (screen readers)

The automated tests (axe, keyboard-only runs, reflow, forced colors) can't tell us what a screen reader actually says. This script fills that gap. Run it with **both** pairings, for **both** the editor and the learner player:

- **NVDA + Chrome** on Windows
- **VoiceOver + Safari** on macOS

No screen reader was available where this version was built, so **every result below is PENDING**. Please fill in the results table as you go and commit the updated file.

## Before you start

1. Write down the versions: operating system, browser, and screen reader (NVDA: NVDA menu, Help, About; VoiceOver: the macOS version).
2. Use a normal network, so YouTube loads. Pick a short public YouTube video that has captions and allows embedding.
3. Start the editor (`pnpm --filter editor dev`) and open the address it prints.
4. For the learner checks, use a real package: build one in the editor (step E11 below), then upload it to SCORM Cloud or your LMS and launch it. If that isn't possible, unzip it and open `index.html` from a local web server (SCORM status calls are skipped without an LMS, which is fine for these checks).
5. Useful keys:
   - NVDA: Insert is the NVDA key. NVDA+Space switches between browse and focus mode. NVDA+F7 lists elements.
   - VoiceOver: Control+Option (VO) is the VoiceOver key. VO+U opens the rotor. Turn on "Safari > Settings > Advanced > Press Tab to highlight each item on a webpage".

For each step, compare what you hear with **Expected**. Mark Pass only if the whole expectation is met; otherwise mark Fail and write what you heard in Notes.

## Part 1: Editor (authors)

| ID | Do this | Expected |
|---|---|---|
| E1 | Load the editor. Press Tab once, then Enter. | "Skip to main content" is heard first; Enter moves to the main area. |
| E2 | Tab to "YouTube link". Paste the video address. | The label and hint are read. After the check, "Video found" and the length are announced without moving focus. |
| E3 | Type an address that isn't YouTube (for example `hello`), then Tab away. | "That doesn't look like a YouTube link" is announced, and the field is reported as invalid. |
| E4 | Fix the link, add a title, Tab to "Next: Interactions" and press Enter. | Focus lands on the "Interactions" heading, and it is read. |
| E5 | Tab to the "Quiz" tool button and press Enter. | Focus moves into the "Question" field of the new checkpoint's settings; its label is read. Type a question. |
| E6 | Tab through the choices. Type two answers. Tick "Correct" for choice 2. | Each field is read as "Choice 1", "Choice 2"; the checkbox is read as "Correct answer: choice 2" with its checked state. |
| E7 | Tab to "Time", type `0:30`, press Enter. Then Shift+Tab back to the timeline and use the arrow keys. | The time is accepted. On the timeline, each checkpoint is read with its type, number and time, for example "Quiz question 1 at 0:30", and which one is current. |
| E8 | Add an Image checkpoint without alt text. Go to Step 3. | "Add alt text or mark decorative" is read in the image settings. On Step 3, the blocker count ("Fix the item below to export.") and the list are read; "Export SCORM package" says it is unavailable and why. |
| E9 | On Step 3, type `abc` as the mastery score, then `70`. | "Enter a whole number from 0 to 100." is announced, and then the export reason is announced again when it changes. |
| E10 | Tab to "Disable forward scrubbing" and press Space twice. | It is read as a switch, with "on" or "off" (or "checked"/"not checked") changing each time, followed by its explanation. |
| E11 | Fix the blockers. Press "Export SCORM package". | "Building the package…" and then "Downloaded … Upload it to your LMS as a SCORM 1.2 package." are announced. A .zip file downloads. |
| E12 | Back on Step 2, press "Preview as learner". | A dialog named "Preview as learner" opens with focus on "Close preview". |
| E13 | In the preview, play until the question appears. Press Escape. | The preview closes even though the question is waiting, and focus is back on "Preview as learner". |
| E14 | Press "Start new project", then Escape. | A dialog "Start a new project?" is read with focus on Cancel; Escape closes it and focus returns to "Start new project". |
| E15 | In a question field, use the formatting toolbar (Tab into it, arrow keys across it, Enter on Bold). | The toolbar is read as "Formatting for Question"; each button is read by name with pressed or not pressed; typing then is bold. Note anything confusing about how the editing area itself is read. |
| E16 | On Step 3, Tab to "Let learners try a question again" and "Show the correct answer after checking" and press Space on each. Then Tab to "I've checked that this video has captions" (leave it unticked) and export. | Each switch is read with its name, its state (on/off or checked/not checked) changing with each press, and its explanation. The checkbox is read in a group "Before you export", with its explanation that it never blocks export. The export message announced ends with "Reminder: confirm your video has captions." |

## Part 2: Learner player

| ID | Do this | Expected |
|---|---|---|
| L1 | Launch the package. Tab through the playbar. | In order: "Play" button, "Video progress" slider (with the time in words, for example "0 seconds of 3 minutes 32 seconds"), "Captions" toggle button (not pressed), "Playback speed" menu. Nothing inside the YouTube frame takes focus. |
| L2 | Press Enter on Play. | The button now says "Pause". The video plays. |
| L3 | Press "Captions". | It is read as pressed; captions appear on the video. Press again: not pressed; captions go away. |
| L4 | Open "Playback speed" and choose 1.5×. | The options are read (0.5× to 2×); the video plays faster. |
| L5 | Let the video play to the first question. | The video pauses. "Video paused." is announced once, and the dialog's name ("Question") and the question text are read. Focus is in the card. Nothing is said twice. |
| L6 | Tab around the card and Shift+Tab back. | Focus stays in the card; the choices are read as a group with "Choose one answer." (or "Choose all that apply."). |
| L7 | Press "Check answer" with nothing chosen. | "Choose an answer first." is announced. |
| L8 | Choose a wrong answer and press "Check answer". | "Incorrect.", the author's feedback and (with the default settings) "Correct answer: …" are announced; focus moves to "Continue". |
| L9 | Press Continue. | The card closes; focus is back on the playbar ("Pause"); the video plays on. |
| L10 | At an info card (Note, Link, Image), press Escape. | The card closes and focus returns to the playbar. On a Link card, "Open link" is read as a link (note whether you are told it opens a new tab; nothing in the player says so yet). On an Image card, the alt text is read. |
| L11 | Play to the end. | A dialog named "End of video" opens with focus in it; "End of video" is not announced a second time. "Submit answers" is read as a button. |
| L12 | Press "Submit answers". | The score, "… of … correct" and "Passed" or "Not passed" are announced, and focus moves to the result. |
| L13 | (Optional) Launch a package whose video doesn't allow embedding. | The message is read as an alert, with a "Watch on YouTube" link. Tab goes to that link; the playbar controls are not reachable. |
| L14 | Use a package with "Let learners try a question again" on. At a question, choose a wrong answer and press "Check answer". Shift+Tab to "Try again" and press Enter. | After the check, "Incorrect." and the feedback are announced once, with no correct answer given; focus is on "Continue" and Shift+Tab reaches "Try again". After "Try again", "Try again. Choose an answer." is announced once, focus is on the first choice, nothing is chosen and the choices can be used again. |
| L15 | In the same package, now choose the right answer and press "Check answer". In a package with retry off (the default), check a wrong answer. | "Correct." is announced, then the feedback, then "Correct answer: …" (in the retry-off package, "Incorrect." then "Correct answer: …"), each said once. Arrowing over the choices, the correct one is read with "Correct answer" as part of its name. No "Try again" is offered after a correct answer, or ever with retry off. |

## Results

Fill in one row per step and pairing. Use Pass, Fail, or N/A (with the reason in Notes).

| ID | Tester | Date | OS, browser and version | Screen reader and version | Result | Notes |
|---|---|---|---|---|---|---|
| E1 | | | Windows, Chrome | NVDA | PENDING | |
| E1 | | | macOS, Safari | VoiceOver | PENDING | |
| E2 | | | Windows, Chrome | NVDA | PENDING | |
| E2 | | | macOS, Safari | VoiceOver | PENDING | |
| E3 | | | Windows, Chrome | NVDA | PENDING | |
| E3 | | | macOS, Safari | VoiceOver | PENDING | |
| E4 | | | Windows, Chrome | NVDA | PENDING | |
| E4 | | | macOS, Safari | VoiceOver | PENDING | |
| E5 | | | Windows, Chrome | NVDA | PENDING | |
| E5 | | | macOS, Safari | VoiceOver | PENDING | |
| E6 | | | Windows, Chrome | NVDA | PENDING | |
| E6 | | | macOS, Safari | VoiceOver | PENDING | |
| E7 | | | Windows, Chrome | NVDA | PENDING | |
| E7 | | | macOS, Safari | VoiceOver | PENDING | |
| E8 | | | Windows, Chrome | NVDA | PENDING | |
| E8 | | | macOS, Safari | VoiceOver | PENDING | |
| E9 | | | Windows, Chrome | NVDA | PENDING | |
| E9 | | | macOS, Safari | VoiceOver | PENDING | |
| E10 | | | Windows, Chrome | NVDA | PENDING | |
| E10 | | | macOS, Safari | VoiceOver | PENDING | |
| E11 | | | Windows, Chrome | NVDA | PENDING | |
| E11 | | | macOS, Safari | VoiceOver | PENDING | |
| E12 | | | Windows, Chrome | NVDA | PENDING | |
| E12 | | | macOS, Safari | VoiceOver | PENDING | |
| E13 | | | Windows, Chrome | NVDA | PENDING | |
| E13 | | | macOS, Safari | VoiceOver | PENDING | |
| E14 | | | Windows, Chrome | NVDA | PENDING | |
| E14 | | | macOS, Safari | VoiceOver | PENDING | |
| E15 | | | Windows, Chrome | NVDA | PENDING | |
| E15 | | | macOS, Safari | VoiceOver | PENDING | |
| E16 | | | Windows, Chrome | NVDA | PENDING | |
| E16 | | | macOS, Safari | VoiceOver | PENDING | |
| L1 | | | Windows, Chrome | NVDA | PENDING | |
| L1 | | | macOS, Safari | VoiceOver | PENDING | |
| L2 | | | Windows, Chrome | NVDA | PENDING | |
| L2 | | | macOS, Safari | VoiceOver | PENDING | |
| L3 | | | Windows, Chrome | NVDA | PENDING | |
| L3 | | | macOS, Safari | VoiceOver | PENDING | |
| L4 | | | Windows, Chrome | NVDA | PENDING | |
| L4 | | | macOS, Safari | VoiceOver | PENDING | |
| L5 | | | Windows, Chrome | NVDA | PENDING | |
| L5 | | | macOS, Safari | VoiceOver | PENDING | |
| L6 | | | Windows, Chrome | NVDA | PENDING | |
| L6 | | | macOS, Safari | VoiceOver | PENDING | |
| L7 | | | Windows, Chrome | NVDA | PENDING | |
| L7 | | | macOS, Safari | VoiceOver | PENDING | |
| L8 | | | Windows, Chrome | NVDA | PENDING | |
| L8 | | | macOS, Safari | VoiceOver | PENDING | |
| L9 | | | Windows, Chrome | NVDA | PENDING | |
| L9 | | | macOS, Safari | VoiceOver | PENDING | |
| L10 | | | Windows, Chrome | NVDA | PENDING | |
| L10 | | | macOS, Safari | VoiceOver | PENDING | |
| L11 | | | Windows, Chrome | NVDA | PENDING | |
| L11 | | | macOS, Safari | VoiceOver | PENDING | |
| L12 | | | Windows, Chrome | NVDA | PENDING | |
| L12 | | | macOS, Safari | VoiceOver | PENDING | |
| L13 | | | Windows, Chrome | NVDA | PENDING | |
| L13 | | | macOS, Safari | VoiceOver | PENDING | |
| L14 | | | Windows, Chrome | NVDA | PENDING | |
| L14 | | | macOS, Safari | VoiceOver | PENDING | |
| L15 | | | Windows, Chrome | NVDA | PENDING | |
| L15 | | | macOS, Safari | VoiceOver | PENDING | |

When a step fails, also note it in [accessibility-statement.md](accessibility-statement.md) under "Known gaps" until it is fixed.
