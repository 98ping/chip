---
name: canvas-quiz
description: Work a Canvas-native quiz (Classic Quizzes) — find it, open the attempt, read every question, save it to output/, fill the answers, and stop short of submitting. Use whenever Max points at a Canvas quiz, asks about a "syllabus quiz" or a quiz he still has to take, asks what a quiz is asking, or when a Canvas assignment turns out to have submission_types ["online_quiz"] with a quiz_id. Not for MyOpenMath quizzes — those are external_tool assignments and belong to the myopenmath skill.
---

# Canvas quizzes

Drives a Canvas Classic Quiz end to end with the **Claude in Chrome** tools. The
full runbook — every trap, with the fix — is **`tooling/CANVAS_QUIZZES.md`**.
Read it before the first interaction; what follows is the shape of the job.

The page helper is **`tooling/canvas-quiz.js`**, the CLI is
**`scripts/canvas-quiz.mjs`**.

## Which runbook

Check the assignment's `submission_types`:

- `["online_quiz"]` + a `quiz_id` → **this skill**.
- `["external_tool"]` at myopenmath.com → **`myopenmath`** skill. Different
  machinery entirely (LTI iframe, MathQuill, per-question submits).

## Ask first

Three separate asks, and they do not imply each other:

1. **Opening the attempt** — the one people underestimate. On a 1-attempt or
   timed quiz *this* is the irreversible step, not the submit. Always check
   `info` first and quote the numbers when you ask.
2. **Typing answers.**
3. **Submitting.** Never on your own initiative.

Never enter credentials anywhere.

## Steps

1. **Find it** — `node scripts/canvas-quiz.mjs list <courseId>`. The
   `/quizzes` API index is disabled on many courses; this walks **assignments**
   instead, which always works.

2. **Pre-flight** — `node scripts/canvas-quiz.mjs info <courseId> <quizId>` and
   `attempts <courseId> <quizId>`. Read `allowed_attempts` and `time_limit` out
   loud before doing anything. A timed quiz means the clock runs while you
   think — plan the answers *before* opening it.

3. **Open the attempt** — a **real click** on *Take the Quiz*. A `GET` on `/take`
   silently re-renders the landing page and starts nothing; it looks broken but
   isn't. Confirm `#submit_quiz_form` exists and the `.display_question` count
   matches `question_count`.

4. **Read and save, before answering.** Paste `tooling/canvas-quiz.js`, call
   `__QDUMP()`. `javascript_tool` truncates around 1 KB — chunk via
   `JSON.stringify(__QDUMP()).match(/[\s\S]{1,900}/g)`. Then
   `node scripts/canvas-quiz.mjs render <dump.json> output/<name>.md`.

5. **Fill** — `__QSET(n, choice)`: index or text for choice questions, an array
   for multiple-answers, a string for text, an object for blanks/matching.

6. **Verify** — `__QVERIFY()` re-reads the DOM, and `__QSTATE()` shows the
   `Quiz saved at ...` stamp. Screenshot: the sidebar checkmarks confirm the
   whole quiz at a glance. **A save stamp is what proves the server has it.**

7. **Stop.** Leave the attempt open, answered, and saved for Max to submit —
   unless he says otherwise in the moment.

## The four that actually cost something

- **Opening is the irreversible step**, not submitting, when attempts are limited.
- **`GET /take` starts nothing.** Click the button.
- **Multiple-answers checkboxes all have `value="1"`** — match by text or index.
  `__QSET` clears the group first, so an array is the final state.
- **A DOM-only answer is not saved.** Check the `Quiz saved at` stamp before
  walking away or reloading.

## Answering from a source document

Syllabus and policy quizzes should trace to the source. Put the trace in each
question's `rationale` field — `render` prints it as a `> Why:` line, which makes
the saved markdown reviewable instead of a bare answer key. Call out real
judgment calls explicitly rather than letting them pass as quotes.
