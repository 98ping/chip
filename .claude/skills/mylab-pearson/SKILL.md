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
   figure → compute → click the **left edge** of the box and type → verify with
   `__ML.fields()` → `__ML.hit(/^Check answer/)`.

6. **Confirm** with `__ML.score()`, then `__ML.hit(/^Next/)`.

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
