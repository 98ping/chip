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
