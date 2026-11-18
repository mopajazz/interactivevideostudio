# LMS acceptance test

## Purpose

The exported package has been tested only against a fake SCORM 1.2 API in a browser and in unit tests. No real LMS has run it yet. This document is the script for the first real run. It says what to upload, what to do, and what to write down, in SCORM Cloud, Moodle and Canvas.

Nothing in this file is a result. Every cell in the results table starts as PENDING. Where this file says "expected", that is what the package is built to do, not something an LMS has confirmed.

Two things are open owner questions:

- **How does your Canvas ingest SCORM packages?** (a built-in feature, an external tool, or an LTI integration). We do not know, so the Canvas steps below say "upload using whatever your institution provides". Please record which route you used.
- **Which versions of Moodle and Canvas** are in use. Record them in the table.

## What the package does in an LMS

Each exported `.zip` is one SCORM 1.2 activity. When a learner launches it:

- **Score.** After the learner presses "Submit answers", the package writes `cmi.core.score.raw` (the number of questions answered correctly), `cmi.core.score.min` (always 0) and `cmi.core.score.max` (the number of scored questions). With 3 of 4 correct that is raw 3, min 0, max 4, which is 75%. Every scored question is worth one point. A question with two correct choices counts as correct only if exactly those choices are selected. Unanswered questions count as wrong.
- **Status.** `cmi.core.lesson_status` is `incomplete` while the learner is watching or answering. Pressing "Submit answers" sets `passed` if the percentage is at or above the mastery percentage (80 in the sample), otherwise `failed`. A video with no scored questions shows "Finish" instead, and sets `completed` with no score. A learner who never submits stays `incomplete`.
- **Resume.** While the learner works, the package saves their position and answers in `cmi.suspend_data` and commits. On the next launch it picks up from the furthest point reached, with answers kept. If the saved data does not match the package (for example the list of checkpoints changed), it is ignored and the learner starts from the beginning.
- **Final submit.** A submit is final within an attempt. There is no retry button after submitting. Any retake comes from the LMS's own attempt settings.
- **The video** is a YouTube embed. The learner's browser must be able to reach youtube.com.

## What you need

- The sample package and its variants, built from this repository (needs Node 22 and pnpm, run from the repository root):

  ```
  pnpm install
  pnpm run sample:package                              # out/lms-acceptance-sample.zip
  node scripts/build-sample-package.mjs --variant=video-only
  node scripts/build-sample-package.mjs --variant=reworded
  node scripts/build-sample-package.mjs --variant=changed
  ```

  The `out/` folder is not committed. Add `--check` to any command to also verify the zip's contents.

  | File | What it is |
  | --- | --- |
  | `lms-acceptance-sample.zip` | 4 scored questions (two multiple choice, two true/false; one multiple choice question has two correct answers), 1 text card, 1 link, 1 image. Mastery 80. |
  | `lms-acceptance-sample-video-only.zip` | The same with the four questions removed. For check 6. |
  | `lms-acceptance-sample-reworded.zip` | The same, with only the wording of the first question changed. For check 5. |
  | `lms-acceptance-sample-changed.zip` | The same, plus one extra text card. For check 5. |

- The sample video is YouTube video `M7lc1UVf-VE`. Its length in the project file is entered as 300 seconds, which is a stand-in, not a measured value. Checkpoints are all placed before 300 seconds. If the real video is shorter, a checkpoint may fall after its end. To get the exact length, open `examples/lms-acceptance-sample.json` in the editor, enter the video link once more, and export from the editor instead.
- The answers to the sample questions:

  | Question | Correct answer |
  | --- | --- |
  | 1. Which of these is a colour? | Green |
  | 2. Water freezes at 0 degrees Celsius (true or false) | True |
  | 3. Select both even numbers | 2 and 4 (both) |
  | 4. The sun rises in the west (true or false) | False |

  For 3 of 4 correct (75%), answer question 4 with True. For 4 of 4, answer all correctly.
- A test learner account in each LMS (not an administrator or teacher preview if the LMS treats those differently; if only a preview is available, say so in the notes).
- A browser with developer tools. Test in one browser first, and note its name and version.
- A way to see the stored values (`cmi.core.*`). Which screen shows them depends on the LMS. If no screen does, use the browser's developer console, and see "What to send back".

## Script

Do the checks in order. The checks are described once in the next section; each script below says where to do them. Record every result in the results table, and write down anything surprising even if it passed.

### A. SCORM Cloud (start here)

SCORM Cloud is a neutral test system, so a failure here points at our package rather than at a particular institution's set-up.

1. Create or sign in to a SCORM Cloud account.
2. Import `lms-acceptance-sample.zip` as a new course. Note any warnings or errors the import reports (check 1).
3. Launch the course as a learner would. Note what appears (check 2).
4. Do checks 3 to 9 below. In SCORM Cloud, use whatever it provides to inspect a registration's reported score and status.

### B. Moodle

Moodle has a native SCORM activity (mod_scorm). This is general knowledge about Moodle, not something we have confirmed for your version, so please check it against the Moodle version you use.

1. In a test course, add a SCORM package activity and give it `lms-acceptance-sample.zip`. Note any import errors (check 1).
2. Look at the activity's settings for anything that affects attempts and grading (grading method, number of attempts, how the grade is reported, whether previous attempts are kept). Write down what they are set to, since they change what checks 3, 7 and 8 show.
3. Log in as the test learner and launch it (check 2).
4. Do checks 3 to 9 below. Look at the gradebook as the teacher or as the learner, and at any SCORM report the activity provides.

### C. Canvas

How your Canvas ingests SCORM is unknown to us (see the open question above), so these steps do not assume a particular route.

1. Upload `lms-acceptance-sample.zip` using whatever your institution provides for SCORM content. Write down which route that was (a built-in feature, an external tool, an LTI integration, or something else) and its name and version if it has one.
2. Note any import errors or warnings (check 1). If your route offers no way to add a SCORM package at all, record that in the notes and stop here for Canvas.
3. Launch it as a student (check 2).
4. Do checks 3 to 9 below. If the content has to be linked to an assignment to produce a grade, note how you did that.

## The checks

Use a fresh learner or a fresh attempt for each check unless the check says otherwise.

1. **Import.** The package imports without errors or warnings. Record any message verbatim.
2. **Launch.** The activity launches and the video shell appears: the video area, the custom play bar (play, progress, captions, speed), and no error panel. Record anything else you see.
3. **Score and status.** Launch fresh, play the video through, answer the questions as they appear, and press "Submit answers" at the end.
   - With 3 of 4 correct (answer question 4 with True), expect lesson status `failed` and a score of 75% (raw 3, min 0, max 4), and the player itself shows "Your score: 75%" and "Not passed".
   - With 4 of 4 correct, expect `passed` and 100% (raw 4, max 4).
   - Record what the LMS shows and, if you can see them, the raw `cmi.core.score.raw`, `.min`, `.max` and `cmi.core.lesson_status` values.
4. **Resume.** Launch fresh, answer the first two questions, then close the window or tab mid-video, without submitting. Launch again. Expect the video to resume near where you left off, with the earlier answers kept, and the status still incomplete. Record where it resumed and whether the answers were kept.
5. **Changed package.** With a half-finished attempt saved (as at the end of check 4), replace the package in the LMS with a changed one, using whatever the LMS offers for updating or re-uploading, then launch again as the same learner. Do this twice with a half-finished attempt each time:
   - `lms-acceptance-sample-changed.zip` (an extra checkpoint). Expected: the old resume data is ignored and the learner starts cleanly from the beginning, with no old answers carried over and no error.
   - `lms-acceptance-sample-reworded.zip` (only the wording of one question changed). The saved data is matched by checkpoint, not by wording, so we expect the learner to still resume with answers kept. This is our reading of the code, not a promise the design makes; record what you see.
   Also record how the LMS handled the replacement itself (new version, new activity, or replaced in place), since that affects whether old attempt data is kept at all.
6. **No scored questions.** Import `lms-acceptance-sample-video-only.zip` as a separate activity. Play it through and press "Finish". Expect status `completed` and no score. Record how the gradebook or report shows an activity with no score.
7. **Attempts.** Record only; do not judge. After finishing one attempt, launch the same activity again and note what happens: does the LMS start a new attempt, show the old result, or refuse? Finish a second attempt with a different score. Record what the gradebook shows after repeated launches (first, last, highest, or average), and the activity's attempt settings. Our package treats a submit as final and has no retake logic of its own.
8. **Gradebook display.** Record how the score from check 3 is displayed: as a percentage or as points (for example 75%, 75 out of 100, or 3 out of 4), and whether passed or failed is shown separately. Record any difference between the three systems. This matters because SCORM 1.2 has no percentage field: we report raw 3 of max 4, and an LMS may display that as 3, as 75, or as 75%. If a gradebook shows 3 where you expect 75%, say so exactly; that would mean the mapping needs to change.
9. **Blocked YouTube.** Launch with YouTube unreachable: turn on an ad blocker that blocks YouTube embeds, or test from a network that blocks youtube.com, whichever you can do. Expect the player to show a visible error with the message "The YouTube player couldn't load. Check your connection, or ask whether YouTube is blocked on this network." and a "Watch on YouTube" link, and the play bar disabled. Record what the learner sees, and what status the LMS then shows (expect no change from not-attempted or incomplete).

## Also exercised by this test

These came out of earlier tasks as unverified, because this environment cannot reach YouTube. The real runs above will exercise them. Note anything odd.

- **Real YouTube duration lookup.** The editor reads a video's length from YouTube when you enter a link. It has only been tested against a stand-in. If you re-enter the sample video's link in the editor (see "What you need"), check that the length that appears is right.
- **YouTube API load.** The player loads YouTube's script and creates its player inside the LMS frame. Watch for it failing to load, or for console errors about frames, referrer or content security policy.
- **Caption toggle.** The "Captions" button should show and hide YouTube's captions, and its pressed state should follow. This only works if the video has captions; the sample video may not, so a caption button that does nothing on this video is worth recording but not necessarily a fault.
- **Forward-scrub lock and checkpoints on a real video.** Dragging forward past the furthest point should snap back, and each checkpoint should pause the video and open its card. Seek lag and a visible jump back were flagged as risks in the first spike.

## Results

Fill in one cell per check and system. Use PASS, FAIL or N/A, with the observed detail in notes. Every cell starts as PENDING.

| Check | SCORM Cloud | Moodle | Canvas | Notes | Tester | Date | Versions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Package imports without errors | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2. Launches, video shell appears | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 3a. 3 of 4 correct: failed, 75% (raw 3, max 4) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 3b. 4 of 4 correct: passed, 100% (raw 4, max 4) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 4. Close mid-way and relaunch: resumes, answers kept | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 5a. Changed package (extra checkpoint): clean restart | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 5b. Reworded package: what happens (expected: resumes) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 6. Video-only: completed, no score | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 7. Attempts and retake behavior (record only) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 8. Gradebook display: percentage or points | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 9. YouTube blocked: "Watch on YouTube" message | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Real YouTube duration lookup | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| YouTube API loads inside the LMS | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Caption toggle | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

Also record, once per system: the Canvas ingest route, the SCORM Cloud, Moodle and Canvas versions, the browser and version, and the operating system.

## What to send back to the developer

For each failed or surprising check:

1. The check number and the system.
2. The values the LMS holds for the attempt, if you can see them: `cmi.core.score.raw`, `cmi.core.score.min`, `cmi.core.score.max`, `cmi.core.lesson_status`, and `cmi.suspend_data` (a short text starting `v1|`). Where the LMS has a screen or report that lists them, copy them from there. Otherwise open the browser's developer console while the activity is open, and read them with `API.LMSGetValue("cmi.core.lesson_status")` (and the same for the other names), after the LMS has stored them. If the LMS hides its API object from the console, say so.
3. A screenshot of the gradebook or report line for the attempt, showing the score and status as the learner or teacher sees it, for checks 3, 6, 7 and 8.
4. Anything in the browser developer console (the Console tab) at launch and after submitting: red errors, and warnings about frames, cookies, referrer or content security policy. Copy the text, with the page address it came from.
5. A screenshot of the screen the learner sees, for checks 2 and 9.
6. The import message, verbatim, for check 1.
7. The route used to get the package into Canvas, and the settings you saw on the Moodle activity (check 7).
8. The versions listed in the results table.
