---
name: myopenmath
description: Work a MyOpenMath / IMathAS math homework set that is launched from Canvas — read the questions, compute the answers, fill the boxes, and submit. Use whenever Max points at a MyOpenMath assignment, says a math homework is "in my Canvas", asks to do/finish/check a numbered homework like "2.1" or "2.2/2.3", or when a Canvas assignment turns out to be an external tool hosted at myopenmath.com. Covers the two LTI launch modes, the MathQuill answer boxes, and reading answers straight out of the graph SVGs.
---

# MyOpenMath homework

Drives a MyOpenMath (IMathAS) assignment end to end with the **Claude in Chrome**
tools. The full runbook — every trap, with the fix — lives in
**`tooling/MY_OPEN_MATH.md`**. Read it before the first interaction; the summary
below is the shape of the job, not a substitute.

The graph reader is **`tooling/myopenmath-graph.js`**.

## Ask first

Reading the page and computing answers is ordinary help. **Typing into the answer
boxes and clicking Submit Question each need Max's explicit go-ahead.** Ask once,
then that covers the run. Never enter credentials anywhere.

## Steps

1. **Locate** — from any Canvas tab, hit the assignments API with a `search_term`
   to get the assignment id and confirm the tool URL is `myopenmath.com`
   (`tooling/MY_OPEN_MATH.md` §1).

2. **Launch and identify the mode.** This decides everything downstream:
   - **"Load … in a new browser window"** → click it. A new top-level tab joins
     your tab group. `read_page`, `get_page_text` and `javascript_tool` all work
     on the real DOM. **Much easier — prefer it.**
   - **Resume/Start inside the page** → cross-origin iframe. Screenshot-only,
     the nav arrows wedge, and you need the `about:blank` reload trick. See §2.

3. **Scope the set** with `#/print` — all questions on one page, real math and
   graphs. Note which are graph-based. Then reload and Resume.

4. **Per question** (`location.hash = '#/skip/N'`):
   - `read_page` for refs, screenshot for layout.
   - **Zoom any radical, exponent or fraction in the question text.** `√x + 3` vs
     `√(x+3)`, `x²` vs `x³`, `s(x)=4/3` vs `s(x)=4` — each has bitten.
   - Graph question → load `myopenmath-graph.js` once, then `__C(n)`, `__at(x)`,
     `__solve(y)`, `__cls(n,gi)`. **Parse the SVG; do not eyeball the plot.**
   - Fill: `form_input` for `type="text"` inputs and `<select>`s; **click + type
     for MathQuill boxes** (bare `textbox` in `read_page`). `form_input` fails
     silently on MathQuill.
   - **Verify the rendered value** (zoom the box) before submitting — retries are
     limited (`↺ N` in the header).
   - Click **Submit Question**. *Save progress* does not count.

5. **Confirm** on `#/summary` — reload it, the header caches.

## The five that actually cost points

- **A line running to the edge of the plot keeps going.** Don't bound domain or
  range at the window edge without an endpoint dot.
- **Open vs closed brackets vary by question.** Right endpoint but marked wrong →
  flip the bracket before re-checking the arithmetic.
- **`^` and `/` trap the MathQuill caret.** Press `Right` before typing what
  belongs outside the exponent or denominator.
- **`Tab` escapes the frame.** Move between boxes by clicking, bottom-to-top.
- **Close the math palette before submitting.** It covers the submit button, and a
  blind click presses its `( )` key instead — *"syntax error. Empty function input
  or parentheses."* Re-locate the button after every layout change.
- **Multi-part `aria-label`s can be shuffled** vs on-screen order. Map boxes by
  `getBoundingClientRect().top`.

## Step 6 — Write the study note

Every completed set gets one note in **`output/study-notes/`**, named
`<course>-<set>.md` (`math170-2.1.md`). Write it right after the `#/summary`
confirmation, while the questions are still in context. Reconstructing this later
means re-opening the assignment, so do not defer it.

These notes are reference material, not prose in Max's voice. Markdown headings,
tables and LaTeX are all fine here, and the `writing-voice` guardrails do not apply.
The subfolder also keeps them out of `scripts/lint-draft.mjs`'s default sweep, which
only reads files sitting directly in `output/`.

Four sections, in this order:

**Formulas.** Every formula the set actually required, written out. Name it, state
it, and add the one-line condition on when it applies. Skip anything you did not
use, and do not pad with related formulas from the textbook.

**Strategies.** How to recognize which tool a question wants, phrased as a trigger.
"Asked for the domain of a radical → set the radicand ≥ 0 and solve." This is the
section that makes the note worth keeping, so make each line a recognition rule,
not a restatement of the formula above it.

**Traps.** What was actually wrong on a first attempt, or nearly was. Bracket
direction, a misread exponent, a domain bounded at the window edge, an arithmetic
slip the retry counter caught. Include the wrong answer and the right one. If the
run was clean, say so and move on.

**Question index.** A table: question number, what it asked, which formula and
strategy it used. Keep it to one line per question so the whole set is scannable.

Then classify the set at the top with a `topics:` line naming the two or three
concepts it drilled (`quadratics, vertex form, completing the square`). Reuse the
exact wording of topics already used in the folder rather than inventing a synonym,
because these tags are what makes a later study guide compile cleanly across sets.

Tell Max the path and the topic tags when you are done. When he later asks for a
study guide, read every note in the folder, group by topic tag rather than by set
number, and merge duplicate formulas instead of listing one per set.
