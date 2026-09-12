---
name: mylab-pearson
description: Work a Pearson MyLab / MyLab Statistics / MathXL homework set or quiz — launch it through the popup, read each question, compute, fill the answer boxes, and submit. Use whenever Max points at a MyLab, MyLab Stats, Mastering, MathXL or Pearson assignment, says a stats homework is "in MyLab", asks to do/finish/check a numbered set like "2.3" or a chapter review quiz, or when an assignment turns out to be hosted at mylabmastering.pearson.com / mylab.pearson.com / tdx.acs.pearson.com. Covers the popup launch, promoting the player out of its iframe, the custom math answer boxes, and reading graphs from their alt text. Not for MyOpenMath (myopenmath.com) — that is the `myopenmath` skill.
---

# MyLab / Pearson homework

Drives a Pearson MyLab (MathXL) assignment end to end with the **Claude in Chrome**
tools. The full runbook — every trap, with the fix — is
**`tooling/MYLAB_PEARSON.md`**. Read it before the first interaction; what follows
is the shape of the job.

The page helper is **`tooling/mylab-pearson.js`**.

## Which skill

- `myopenmath.com` → the **`myopenmath`** skill. Different machinery (MathQuill,
  hash routing, per-question submits).
- `mylabmastering.pearson.com` / `mylab.pearson.com` → **this skill**.

## Ask first

Reading and computing is ordinary help. **Opening an attempt, typing into boxes,
and clicking Check answer each need Max's go-ahead.** One ask covers a homework
set with unlimited attempts. A **timed or limited-attempt quiz is different: the
irreversible step is opening it**, so quote the attempt count, time limit and due
date and ask before you start. Never enter credentials.

## Steps

1. **Get the tab into the MCP group.** Clicking the assignment fires a popup that
   lands outside the group — ask Max to drag it in. **Never let the group reach
   zero tabs**, it dissolves (§1).

2. **Promote the player to top-level** before clicking *Get started*:
   `location.href = document.getElementById('ctl00_ctl00_InsideForm_MasterContent_PlayerHtml5').src`
   You land on `tdx.acs.pearson.com` with a real DOM instead of being
   screenshot-only. This is the move that makes the whole run fast (§2).

3. **Paste `tooling/mylab-pearson.js`**, then `__ML.hookPopups()`.

4. **Scope it**: question count, points, due date, and whether tries are limited.

5. **Per part**: `__ML.q()` to read → `__ML.openFig()` + `__ML.fig()` for any
   figure, or `__ML.table()` + `__ML.stats()` for a data table (§14) → compute →
   click the **left edge** of the box and type → verify with `__ML.fields()` →
   wait 1s (§16) → `__ML.hit(/^Check answer/)`. Batch the whole part (fill, wait,
   check, screenshot) into one `browser_batch` call rather than one tool call
   per step.

6. **Confirm** with `__ML.score()`, then `__ML.hit(/^Next/)`. If the question
   finished with partial credit, the default is to click **"See similar"** and
   redo it on a fresh instance — but MyLab keeps whichever attempt's score is
   most recent, **not the higher one** (§18), so skip the retry on a
   graph/histogram-matching part you can't verify with confidence, or on a
   question already scoring 0.8+.

7. **Write the study note** into `output/study-notes/<course>-<set>.md`, same
   format as the `myopenmath` skill's step 6: a `topics:` line, then Formulas,
   Strategies, Traps, Question index. Write it right after the last question,
   while the work is still in context.

## The five that actually cost something

- **Read graphs from the alt text, not the SVG.** `__ML.fig()` returns a
  screen-reader description listing every plotted coordinate exactly. Parsing the
  layered SVGs is a last resort.
- **Click the left ~22% of an answer box.** The right side is a math-palette
  button; hit it and your keystrokes vanish into a focused button while the box
  stays empty.
- **Clear a box with `cmd+a` then `Delete`.** Backspace corrupts it silently
  (`10` → typing `9` produced `90`).
- **Parts are revealed one at a time and later parts depend on earlier ones.**
  Keep the figure data and your previous answers to hand; re-query field
  coordinates and scroll before clicking, because new parts appear below the fold.
- **Tries are per part** (3 for free response, often 2 for multiple choice), and a
  wrong answer disables Check answer until you change something. "Unlimited per
  question" on the overview does not mean unlimited per part.

## Stats content traps

- Class **limits** are `(lower, lower+width−1)`, not `(lower, lower+width)` —
  midpoint 5 with width 10 means the class **0–9**.
- A frequency polygon's first and last points are **zero anchors**, not classes.
- On an ogive, "p% below" reads x at y = p/100; "p% above" reads x at y = 1−p/100.
- Ties are real — when two candidates tie, MyLab wanted the **later** one.
- **Read each box's rounding instruction literally.** "Round to two decimal
  places" wants `__ML.preciseRound()`; "Do not round" wants the exact
  `__ML.stats()` value — don't blanket-round every box in a question the same
  way (§15).
- **A rejected mean/median that survives triple-checked extraction may be a
  data-generation quirk**, not your error: the displayed table can hide decimal
  precision. A `+$0.01` retry has worked twice for a mean; for a median, don't
  guess blind — use "See similar" instead (§17, §18 in the runbook).
- **"Help me solve this" can regenerate the question's data** from a single
  stray click on the panel — even without clicking "Continue" inside it —
  silently invalidating already-correct parts. Avoid it; re-extract fresh and
  re-verify prior parts if it's triggered by accident (§19).
- **Histogram/graph multiple-choice options built from the current instance's
  own data are not reliably identifiable by eye** — peak position and tail
  shape guessing was wrong about as often as right across a long HW set, even
  after computing exact bin counts first. Budget at most 2 tries per such part
  and accept the loss rather than burning "See similar" attempts on it (§20).
- **Verify a data table's shape before trusting `__ML.table()`** — it assumes a
  duplicate footer row and single-column-per-variable layout that not every
  table has. Check `rows.length` against the question's stated sample size, and
  check header `colSpan` for side-by-side repeated column groups, before
  computing anything (§21).
