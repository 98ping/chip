# Canvas Classic Quizzes — runbook

How to read, save, and work a **Canvas-native quiz** (Classic Quizzes) with the
**Claude in Chrome** tools. Written from a full run on an 8-question syllabus
quiz. This is the sibling of `MY_OPEN_MATH.md` — same shape, completely different
machinery. Nothing here involves an LTI iframe or MathQuill.

> **Which runbook?** Check the assignment's `submission_types`:
> `["online_quiz"]` + a `quiz_id` → **this file**.
> `["external_tool"]` pointing at myopenmath.com → **`MY_OPEN_MATH.md`**.

> Course/quiz IDs below are placeholders. `tooling/` is **not** git-ignored — keep
> real IDs out of it. Discovery is one command (§1).

---

## 1. Find the quiz

```bash
node scripts/canvas-quiz.mjs list <courseId>
```

**Why a script and not the obvious API:** `/api/v1/courses/:id/quizzes` returns
`{"message":"That page has been disabled for this course"}` on many courses —
instructors can turn the quizzes index off, and it was off here. The **assignments**
index is not disableable, and a classic quiz appears in it as
`submission_types:["online_quiz"]` carrying a `quiz_id`. That's the reliable path,
and it's what `list` walks. It also flags external-tool quizzes so you don't
start a MyOpenMath set with the wrong runbook.

The canvas MCP cannot see quizzes at all — don't reach for it here.

## 2. Pre-flight — read this BEFORE opening the attempt

```bash
node scripts/canvas-quiz.mjs info <courseId> <quizId>
node scripts/canvas-quiz.mjs attempts <courseId> <quizId>   # have you started already?
```

This is the most important step in the file, because **starting a Canvas quiz can
be irreversible**. Two fields decide how careful to be:

| Field | Why it matters |
|---|---|
| `allowed_attempts` | **1 = one-way door.** There is no "get a similar question" escape hatch like MyOpenMath has. |
| `time_limit` | Non-null = **the clock starts the instant the attempt opens** and keeps running while you read, compute, and think. |

`info` prints a `!!` warning line for both. `one_question_at_a_time` +
`cant_go_back` also matter: they turn a single-page scrape into a forced
answer-then-advance walk.

**Ask Max before opening an attempt whenever attempts are limited or the quiz is
timed.** An untimed 1-attempt quiz is safe to hold open indefinitely once started;
a *timed* one is not — for those, plan the answers first, then open and fill fast.

## 3. Questions are 403 until the attempt is live

As a student, `/api/v1/courses/:c/quizzes/:q/questions` returns
`403 user not authorized`, and so does `/statistics`. There is **no** read-only
preview. The questions only ever exist in the DOM of the `/take` page, inside an
open attempt. That is the whole reason this workflow is browser-driven.

## 4. Opening the attempt

**A `GET` on `/take` does not start anything.** It silently re-renders the quiz
landing page — same title, same "Take the Quiz" button, `#submit_quiz_form`
absent, zero `.display_question` nodes. It looks like a failure but nothing broke.

Canvas needs a **real click** on **Take the Quiz** (an `<a>` whose handler POSTs
with the authenticity token). Click it with `computer{left_click}`, wait ~2.5s,
then confirm the attempt is really open:

```js
const qs=[...document.querySelectorAll('#submit_quiz_form .display_question')];
({ url: location.href, n: qs.length, classes: qs.map(q=>q.id+' :: '+q.className) })
```

You want a URL with no query string, `n` = the question count from `info`, and
class names ending in a real question type. Resuming an in-progress attempt uses
the same button, relabelled **Resume Quiz**.

## 5. Read and save — before answering, always

Paste `tooling/canvas-quiz.js` through `javascript_tool` once per page load
(globals do not survive a reload), then:

```js
__QDUMP()     // full JSON: every question, every option, what's selected
__QSTATE()    // one line per question + answered count + save stamp + timer
```

**`javascript_tool` truncates its output at roughly 1 KB.** A full `__QDUMP()` on
even a small quiz blows past that. Chunk it:

```js
window.__CH = JSON.stringify(__QDUMP()).match(/[\s\S]{1,900}/g); __CH.length
```
then read `__CH[0]`, `__CH[1]`, … and reassemble. Write the JSON to disk and
render it **before typing a single answer**, so a saved copy of the questions
exists even if the attempt goes sideways:

```bash
node scripts/canvas-quiz.mjs render <dump.json> output/<course>-<quiz>.md
```

`render` writes both the `.md` and a normalized `.json` into `output/`.

## 6. Filling answers

```js
__QSET(n, choice)   // n is 1-based, in on-screen order
```

| Question type | `choice` |
|---|---|
| multiple choice / true-false | index (`3`) or exact text (`"True"`) |
| multiple answers | array — `[1,2,3]` or `["homework","discussions"]` |
| short answer / numerical / essay | the string |
| dropdowns / fill-in-multiple-blanks | `{ blankName: value }` |
| matching | `{ "left item text": "right option text" }` |

Things that bit, or would have:

- **Multiple-answers checkboxes all share `value="1"`.** Canvas encodes *which*
  box by the input's `name` (`question_<qid>_answer_<aid>`), not its value.
  Match by **text or index** — matching by value silently hits the first box.
  `__QSET` clears every checkbox in the group before applying an array, so the
  array you pass is the final state, not an addition to it.
- **`display_question` also ends in `_question`.** Deriving the type from the
  class list without excluding the wrapper makes *every* question report as
  `display` — cosmetic in a dump, but it breaks any type-based branching. Fixed
  in `canvas-quiz.js`; watch for it if you re-implement inline.
- Canvas autosaves on `change`. `__QSET` fires native bubbling `input` + `change`,
  which jQuery's delegated handlers pick up. **Confirm it reached the server** —
  `__QSTATE()`'s last lines carry the header's `Quiz saved at H:MMpm` stamp.
  Answers only in the DOM are lost on reload.
- Unlike MyOpenMath, there are **no per-question submits and no MathQuill**. Every
  box is a plain HTML control, so `form_input` and direct `.value =` both work.

## 7. Verify before submitting

```js
__QVERIFY()   // re-reads the DOM: what is ACTUALLY selected, not what you sent
```

Then screenshot. The right-hand **Questions** sidebar shows a checkmark per
answered question — the fastest whole-quiz confirmation there is. Cross-check
the count against `info`'s `question_count`; a question that scrolled off or
never rendered shows up here as a missing check.

## 8. Submitting

**Do not click `#submit_quiz_button` without Max's explicit, in-the-moment
go-ahead** — and note that permission to *fill* is not permission to *submit*.
With `allowed_attempts: 1` the submit is final and ungradeable twice.

Leaving an untimed attempt open, fully answered and server-saved, is a good
resting state: Max can review every answer on screen and click Submit himself.

After a submit, `attempts` shows the score, and `show_correct_answers` decides
whether `/history` reveals the right answers.

## 9. Answering from a source document

For a syllabus/policy quiz, every answer should trace to a line in the source.
Record the trace: `render` prints a `> Why:` line from each question's
`rationale` field, so the saved markdown is checkable rather than a bare answer
key. Flag genuine judgment calls explicitly instead of burying them — on the run
this was written from, exactly one question ("what is required each week?") was
an inference rather than a quote, and it was worth saying so.

## 10. Permissions

Reading the quiz, saving it, and working out answers is ordinary help.
**Opening an attempt**, **typing answers**, and **submitting** are three separate
asks. Opening is the one that's easy to underestimate: on a 1-attempt or timed
quiz it is the irreversible step, not the submit. Never enter credentials.
