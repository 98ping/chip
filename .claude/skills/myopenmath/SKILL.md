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

## The `-sbs` flag — show the work

When Max ends a message with **`-sbs`**, the run changes in one way: before you fill
each question's boxes, write the solution out to him the way you would work it on
paper. Everything else about the run is unchanged, and the flag stays in force for the
whole assignment, not just the first question.

One block per question, posted as you reach that question rather than saved up for the
end. The point is that he can follow along and check you, so the block has to be
readable on its own without the assignment open next to it.

What a block contains:

**The question, restated with its actual numbers.** `Q9. f(x) = (15x - 60)/(x^2 - 3x - 4)`

**Every algebra step on its own line, in order, with nothing skipped.** Show the
factoring, the cancelling, the substitution, the arithmetic. This is the part he is
reading, so do not compress three manipulations into one line and do not narrate a step
in prose that you could just write out.

```
15x - 60          15(x - 4)
------------  =  --------------
x^2 - 3x - 4     (x - 4)(x + 1)

(x - 4) cancels    ->  hole at x = 4
remaining:  15/(x + 1)
hole y-value:  15/(4 + 1) = 3      ->  (4, 3)
```

**A one-line reason wherever a step follows from a rule rather than from arithmetic.**
"degrees 1 < 2, so HA is y = 0" or "even multiplicity, so it bounces". Keep it to the
clause; the rule itself belongs in the study note, not here.

**The final answer per part, labelled to match the boxes on screen**, so he can see
which value is going where.

Rules for these blocks:

- Plain text math, laid out in a code fence so the fractions and alignment survive.
  This is working, not prose, so the `writing-voice` guardrails do not apply.
- Show the work you actually used. If you read a value off a graph's SVG, say that and
  give the numbers you sampled, rather than inventing an algebraic derivation you did
  not perform.
- A wrong first attempt gets its own short block: what you entered, what the page said,
  and what you changed. Those are the most useful ones to him.
- Skip the block for a question that is genuinely a single lookup with no working, but
  say so in one line rather than staying silent on it.

At the end of an `-sbs` run the study note (section 6) is still written as normal. The
two serve different purposes: the blocks are for following the run live, the note is
for revising later.
