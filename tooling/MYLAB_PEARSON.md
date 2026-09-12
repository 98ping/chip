# MyLab / Pearson homework — runbook

How to work a Pearson MyLab (MyLab Statistics / MathXL) assignment with the
**Claude in Chrome** tools. Written from a live run of a 20-question stats set.
Every item cost real time to discover.

> Course/assignment IDs are placeholders. `tooling/` is **not** git-ignored, so
> don't paste real IDs in.

---

## 1. The tab group, and why it keeps breaking

Everything Claude can drive must live in the **MCP tab group**. Two failure modes,
both seen in one session:

- **Closing the last tab dissolves the group.** A tab dragged into the old group
  afterwards is in a group that no longer exists. Recreate with
  `tabs_context_mcp({createIfEmpty:true})` and have Max drag the tab in again.
  **Never let the group hit zero tabs.**
- **A background player tab gets throttled** and browser calls start failing with
  *"Claude in Chrome is not connected."* This is usually transient — retry, and
  keep the player tab in the foreground. A submit fired just before the drop
  **may still have landed**: re-read state before re-submitting, or you burn a try.

## 2. Launch — the popup, and the move that makes everything easy

Clicking an assignment on `mylabmastering.pearson.com` fires a **`window.open`
popup** that lands **outside** the MCP tab group. You cannot drive it there.

1. Ask Max to drag the popup tab into the group (or unblock popups if Chrome
   swallowed it — nothing appears and no error is raised).
2. The popup lands on `mylab.pearson.com/Student/IntegratedAssignmentOverview.aspx?homeworkId=...`.

### The key move: promote the player iframe to top-level

The overview embeds the player in `#ctl00_ctl00_InsideForm_MasterContent_PlayerHtml5`
(`/Service/PlayerLaunch.ashx`). Its `src` reads as same-origin but it **redirects
cross-origin**, so `contentDocument` is `null` and you are screenshot-only.

Navigate the tab to the iframe's own URL and the player becomes top-level:

```js
var f = document.getElementById('ctl00_ctl00_InsideForm_MasterContent_PlayerHtml5');
location.href = f.src;
```

You land on `tdx.acs.pearson.com/assignment/assignmentplayer.aspx` with the **full
DOM**: `get_page_text`, `read_page` and `javascript_tool` all work on the real
content. Do this **before** clicking *Get started*. It is the difference between a
fast run and a painful one.

Then paste `tooling/mylab-pearson.js` and call `__ML.hookPopups()` — later figure
popups are usually in-page, but the interceptor costs nothing and turns any real
`window.open` into an in-page iframe instead of an undrivable window.

**Reading `iframe.src` directly into a tool result is blocked** — the extension
refuses output containing cookie/query-string data (`[BLOCKED: Cookie/query string
data]`). Assign it (`location.href = f.src`) rather than returning it, and strip
query strings from anything you do return.

## 3. Read the graph from the alt text, not the SVG

**This is the single biggest time-saver.** Every MyLab figure carries a
screen-reader long description listing **every plotted coordinate exactly**:

> "The heights of the plotted points are as follows, where the age is listed first
> and the frequency is listed second: negative 5, 0; 5, 40; 15, 43; …"

It sits at the end of `document.body.innerText`, after the `Next` button.
`__ML.openFig()` clicks the figure icon, then `__ML.fig()` returns it. Two calls,
exact numbers, no calibration, no eyeballing.

Only fall back to SVG parsing if the description is missing. If you must:

- MyLab draws each chart as a **stack of overlaid `<svg>` layers at identical
  position and size** — one for gridlines, one for axes/ticks/labels, one for the
  data (`<path stroke="rgb(0,0,255)">` plus `<circle r="2">` markers). A single
  `querySelectorAll('svg')` on the chart returns ~9 layers, most of them empty
  `<defs>`. Group by bounding box, then take the layer holding a coloured path.
- Calibrate from the **tick path** (`M x y L x y` segments), not the text labels.
- The page holds **70+ `<svg>` elements**; most are UI icons. Filter by size.

**The figure panel persists across questions**, so a stale chart can still be on
screen. Re-open it per question and confirm the description matches the current
question before trusting it.

## 4. Answer boxes are a custom math editor

`read_page` **does not show them** — the accessibility tree stops at the question
chrome. Query the DOM instead (`__ML.fields()`, class `.acs-inputField`).

| What you see | How to fill |
|---|---|
| `.acs-inputField` | **click the left edge + type** |
| `input[type=radio]` | click by coordinate; `read_page` misses these too |
| a "Select" dropdown | **custom widget, not `<select>`** — click, then click the option |

- **The box contains an embedded math-palette button on its right side.** Click the
  middle and you focus *the button*, the palette opens, and your keystrokes go
  nowhere — the box stays empty and Check answer stays greyed. **Click the left
  ~22% of the box** (`__ML.fields()[i].click` does this). Confirm with
  `document.activeElement.classList.contains('focusNode')`.
- `form_input` does not work: the visible field is a div, and the only real input
  is a 1px `input.focusNode` caret catcher.
- **To clear a box: click it, then `cmd+a` then `Delete`.** Backspace from a
  left-edge caret does **not** clear it — you get silent corruption (`10` → typing
  `9` gave `90`).
- **`.acs-inputField.textContent` is doubled** (rendered math + a screen-reader
  copy), so `5` reads as `"55"` and `10` as `"1010"`. `__ML.fields()` de-duplicates.
- **Fill multi-box rows right-to-left**, so the palette (which opens below and to
  the right) never covers a box you still need.
- The palette usually auto-closes (`"Palette has been closed"` appears in the page
  text), but **re-query button coordinates from the DOM before every click** rather
  than reusing a y-coordinate.

## 5. Driving the buttons

`__ML.hit(/^Check answer/)` clicks by DOM lookup and is more reliable than
coordinates — the buttons move as validation text appears and parts expand.

**The figure icon is a `<button>` with no text**, only an SVG child, so a text
search finds nothing. `__ML.openFig()` locates the "Click the icon" label and
clicks the `<button>` in its parent.

`Next` also works via `__ML.hit(/^Next/)`.

## 6. Parts, tries and scoring

- A question has **N parts revealed one at a time**; a new part only appears after
  the current one is submitted. You cannot read the whole question up front.
- **Later parts depend on earlier ones.** The class limits in part (b) follow from
  the midpoint in part (a); the misery-index parts reuse the same two series. Keep
  the figure data and your earlier answers in hand — re-deriving them per part is
  where mistakes come from.
- **Parts fall below the fold.** `__ML.fields()` reports coordinates outside the
  viewport happily and the click silently misses. Scroll, then re-query.
- **Tries are per part.** Free-response parts get 3, multiple choice often 2 —
  the overview's *"Unlimited per question"* does **not** mean unlimited per part.
- Partial credit accrues per part (`0.09 of 1 point`, `0.45 of 1 point`).
- A wrong answer shows *"That's incorrect"* with a hint, decrements the counter,
  and **disables Check answer until you change something**.

## 7. Stats gotchas seen in this set

- **Class limits vs midpoints.** Midpoint 5 with width 10 does *not* mean limits
  0 and 10 — MyLab wanted **0 and 9** (integer classes 0–9, 10–19, …) while still
  accepting 5 as the midpoint. If the midpoint is right but the limits are marked
  wrong, switch from `(lower, lower+width)` to `(lower, lower+width-1)`.
- **A frequency polygon's first and last points are anchors at zero.** Points at
  ages −5 and 105 with frequency 0 are not classes; the class count is the number
  of interior points.
- **Ogives read cumulative relative frequency**: "20% scored below what level" is
  the x where y = 0.20; "15% above" is the x where y = 0.85.
- **Ties happen.** Two years tied for the smallest unemployment/inflation gap
  (2.4 at years 8 and 9); MyLab wanted the **later** one. Costs a try — check both.

## 8. Permissions

Reading the page and computing answers is ordinary help. **Opening an attempt,
typing into boxes, and clicking Check answer each need Max's go-ahead.** For a
homework set with unlimited attempts, one ask covers the run. For a **timed or
limited-attempt quiz, opening the attempt is the irreversible step** — quote the
attempt count, the time limit and the due date before asking. Never enter
credentials; if a Pearson sign-in page appears, hand it back to Max.

---

## 9. Clicking: the four things that silently swallow a click

Learned across a full 20-question set. All of these fail *quietly* — no error, the
field just stays empty or the radio stays unselected.

- **The bottom toolbar (`AI Study Tool / Help me solve this / Get more help`)
  overlays roughly `y > 710`** in the 1568x755 screenshot frame. `__ML.fields()`
  will happily hand you coordinates under it. Scroll the target up first.
- **Grading a part re-renders the question and scrolls back to the top**, with the
  earlier parts collapsed. Every coordinate captured before a submit is stale.
  **Re-query (or re-screenshot) after every Check answer**, never reuse.
- **Filling a box changes its width, which re-flows the whole grid.** In a
  multi-column table the columns shifted ~10px after the first row was filled, and
  four of five clicks in the next row missed. Fill a row, **re-query, verify which
  values actually landed**, then fill the next. Boxes in a right-aligned column
  (the left side of a back-to-back plot) grow *leftward*.
- **A stray text selection eats the next click.** Clicking a radio that sits beside
  a link can select the link text instead. Click a neutral area of the page first,
  then the radio.

**Always verify before submitting**: `__ML.fields()` for values,
`__ML.radios()`/checkboxes for `on`, and check that Check answer went from
disabled to enabled. If it is still disabled, nothing was entered — and clicking
it costs nothing, so a failed fill never burns a try.

## 10. Question shapes beyond fill-in-the-blank

- **Options are laid out in a 2x2 grid**, not a single column, so the reading order
  A,B,C,D is *not* top-to-bottom. Map letters to coordinates from a screenshot.
- **Radio and checkbox lists accumulate** across already-graded parts in the same
  question. Take the **last N** entries, not the first.
- **"Select all that apply"** renders as checkboxes, not radios — query
  `input[type=checkbox]`.
- **A dropdown is a custom widget**: `element.click()` from JS only focuses it. It
  needs a **real mouse click** to open, then a second click on the option.
- **Some parts sit behind a `Continue` button** after the feedback — `__ML.hit(/^Continue/)`.
- **Graph-choice questions come in two flavours.** Either the four graphs are
  inline (read each option's alt text out of `__ML.q()`), or they are
  **"Click here to view plot a/b/c/d" links** that load into a carousel panel —
  click each link, then read `__ML.fig()`, which reports `1 of 4`, `2 of 4`, ….
  The letters in the links are **shuffled**, so match the link text, not position.

## 11. Answer formats that were accepted

- **Stem-and-leaf leaves: space-separated digits** — `0 2 3 3 4 5 6 9`.
- **Back-to-back stem-and-leaf: the left side is entered in *descending* order**
  (`8 8 7 6 4 3 0`), so the leaves increase toward the stem. This was accepted
  first try.
- **Split stems**: only the halves that contain data get a row. A stem whose
  leaves are all ≥5 gets a single row, not an empty low row.
- `1` is accepted where the exact value is 1.000; `0.5` where it is 0.500.

## 12. Two things that cost a wrong answer if you forget them

- **Clicking a "Click here to view plot X" link also selects that option's
  radio.** Reading all four options in order therefore leaves the *last one read*
  selected. Always re-query `__ML.radios()` after the survey and click the
  intended radio again before `Check answer`. Verify `on:true` sits on the right
  index.
- **`__ML.fig()` duplicates every table cell** (the DOM carries a visual copy and
  a screen-reader copy). A parse that returns exactly `2n` values with each value
  repeated adjacently is that duplication, not real data — de-pair before
  counting, and confirm the count matches the `n` stated in the question stem
  ("a random sample of 60 cameras").

## 13. Rounding when a later part says "using the results from part (b)"

That phrase is narrative, not a rounding rule. The grader stores the value
computed from the **exact** counts. On 2.2.RA-1, "5 or more potholes" was
9/35 = 25.714… → **25.7**, while summing the three rounded relative frequencies
(0.086 × 3) would have given 25.8. Compute from the raw counts every time.

## 14. The leaner workflow for a big data-table question (mean/median/etc.)

For a question built around a data table (tornado data, camera prices, whatever),
don't read cells one at a time. Batch it:

1. **Extract the whole table in one `javascript_tool` call** with `__ML.table()` —
   it returns `{header, rows}`, skipping the header row and the duplicate footer
   row MyLab renders at the bottom of every table. It already handles the display
   quirks that break naive parsing:
   - **Comma-formatted numbers** (`"597,000"`) — stripped before `Number()`.
   - **Word/symbol duplicates** (`"negative 9"` vs `"−9"` in the same cell,
     screen-reader text plus the visual glyph) — takes the **last** non-empty
     line of `innerText`, not the first.
   - **Unicode minus** (`−`) — replaced with an ASCII hyphen before parsing.
2. **Compute everything for the part in one JS call**: `__ML.stats(column)` gives
   `{n, sum, mean, median, sorted}` in one shot. It does **not** round the
   median — see §15, some boxes explicitly forbid rounding.
3. **Fill and check every box for the part in one `browser_batch`**: click, type,
   wait 1s (§16), `__ML.hit(/^Check answer/)`, screenshot. One round trip instead
   of four or five.
4. Only fall back to per-cell reading if `__ML.table()` returns something that
   looks wrong (row count doesn't match the "n" stated in the question, or a
   column is all `NaN` — usually means the wrong `<table>` index, pass an
   explicit index to `__ML.table(idx)`).

This is the single biggest speed win on a long data-table question: one page
read, one compute, one fill-and-submit batch, instead of a tool call per cell.

## 15. Read every box's rounding instruction literally — some say "do not round"

Each answer box carries its own parenthetical, and they are not all the same:

- `"(Round to two/three decimal places as needed.)"` → use `__ML.preciseRound(x, d)`,
  **not** `toFixed()`. Plain `toFixed` can round the wrong way on values like
  `5.1925` (floating-point representation makes it print `5.192`, not `5.193`).
  `preciseRound` fixes this by rounding at `toPrecision(15)` first.
- `"(Type an integer or a decimal. Do not round.)"` → submit the **exact**
  unrounded value from `__ML.stats()` — e.g. an exact median of `0.515`, not
  `0.52`. Applying `preciseRound` here anyway is the mistake that cost a point on
  3.1.41-T (Part 2 of a rebuilt instance): the mean box asked for two decimals
  and got them, but the *median* box next to it said "do not round" and a
  blanket "round every stats() output" habit submitted `0.52` instead of the
  true `0.515`.

Read each box's own instruction before filling it. Don't assume the whole
question rounds the same way just because the previous part did.

## 16. Wait one second before "Check answer" on a box you just typed into

Clicking Check answer **immediately** after typing into a `.acs-inputField` can
fail silently — `__ML.hit(/^Check answer/)` returns `'none'` even though the box
clearly has a value. The math-palette popup that appears while a field is
focused briefly obstructs or detaches the button. Fix: insert a
`computer{action:"wait", duration:1}` between the last keystroke and the
`hit()` call. Cheap, and removes an entire class of "nothing happened" retries.

## 17. Some data-table cells hide decimal precision the display truncates

On 3.1.41-T (tornado PropLoss), a table's displayed values were all clean
integers (`0, 1, 2, 3, …, 500000, 1000000`), and `__ML.stats()` on that exact
displayed data gave a median of `0` — mathematically airtight given the sorted
array (dozens of leading zeros comfortably covering both middle ranks). MyLab
rejected `0`, rejected a `+$0.01` retry too, and the revealed correct answer
after tries ran out was **`0.0225`** — a value the displayed integer table
cannot produce at all. The **mean** on the same table needed a matching `+$0.01`
correction over what the exact displayed integers computed, on two separate
randomized instances (`1951.80`→accepted `1951.81`; `15001.40`→accepted
`15001.41`), and both of those small mean corrections *were* accepted.

Takeaway: for this data type, the table you can see is not always the table
Pearson's answer key was generated from — small values can carry hidden decimal
precision that the display rounds or truncates away. If a mean or median is
rejected despite triple-checked extraction from `__ML.table()`:

- For a **mean**, a `+$0.01` retry is worth one try — it has landed twice.
- For a **median**, don't try to guess the hidden decimal (0.0225 is not
  reachable by any obvious 1-cent nudge). Burn at most one confirming try, then
  treat it as a data-generation quirk rather than your own arithmetic error, and
  apply the "See similar" retry (§18) rather than continuing to guess blind on
  the same instance.

## 18. "See similar" — the standing retry policy for partial credit

Once a question has been fully attempted (every part answered or tries
exhausted on at least one part), a **"See similar"** option becomes available.
It generates a **completely fresh randomized instance** of the same question
number, with tries reset on every part.

**Default policy: whenever a question finishes with partial credit (not a
clean full score), click "See similar" and attempt the fresh instance for full
credit**, without waiting to be asked each time. This applies going forward for
the whole assignment, not just the question where it first came up. Two
caveats:

- **MyLab keeps whatever the most recent attempt scored — not the higher of the
  two.** Confirmed both ways in one session: a 0.92/1 question retried down to
  0.83/1 (the fresh instance had its own bad luck on a figure-matching part) and
  the *lower* score is what stuck in the gradebook and the running total. Do not
  assume "See similar" is risk-free. It is a genuine gamble on any part whose
  correctness you cannot verify with certainty before submitting (graphs and
  histograms especially, per the next point) — for a question that's already at
  0.8+ out of 1, weigh whether the expected gain is worth the realistic chance of
  a net loss, rather than applying the policy mechanically to every non-1.0 score.
  This risk is specific to parts you can't verify exactly before submitting —
  once §20's `__ML.histAlt()` technique made histogram parts exact rather than
  guessed, a later retry of this same question scored a clean 1.0/1.
- Don't loop indefinitely on one stubborn question. If a second fresh instance
  *also* hits a data-generation quirk like §17, stop after that second attempt,
  note it in the study note, and move on — the point value of one sub-part does
  not justify burning the whole session on it.

## 19. "Help me solve this" can regenerate the question's data — avoid it

Clicking **"Help me solve this"** can silently **regenerate the entire
question's randomized dataset**, resetting every previously-correct part's
answer along with it. Discovered twice: once using it deliberately on a
partially-answered question (parts 1-3 were already correct; after clicking it
the table had new numbers and parts 1-3 had to be redone from scratch), and
once from a single **stray click that only opened the confirmation dialog**
(never clicked "Continue" inside it) — closing the dialog with the X still lost
the just-submitted Part 1 answer and dropped the running score. Merely opening
the panel is enough to trigger the reset on some question templates; don't
treat "I didn't click Continue" as safe. Prefer working the question directly
from `__ML.q()` / `__ML.table()` / `__ML.fig()`; treat this button (and its
neighbors — "AI Study Tool", "Get more help" — anything in that bottom-bar
cluster) as things to click deliberately or not at all, never as a
`browser_batch` click coordinate reused from a different part's layout. If it's
used or triggered by accident, re-extract the table fresh and re-verify every
previously "correct" part before trusting it's still recorded.

## 20. Histogram multiple choice: read `__ML.histAlt()`, don't eyeball the thumbnail

**Every histogram answer-choice thumbnail carries a hidden, exact `aria-label`**
on a `div` ancestor of the chart, one per option, in the same DOM order as the
visual A/B/C/D layout (confirmed by testing all four positions against
independently-computed bin counts). The label spells out the full bar-by-bar
data:

> "A relative frequency histogram has a horizontal axis labeled Return
> (percent) from negative 50 to 150 in increments of 10 … The approximate
> heights of the bars are as follows, where the horizontal axis label is
> listed first and the approximate height is listed second: negative 40,
> 0.011; negative 30, 0.078; …"

Use it instead of visual matching:

1. Extract the raw data (`__ML.table()` + `__ML.stats()`, or from the opened
   figure), and compute your own relative-frequency bin counts for the class
   width/start the question specifies.
2. `__ML.histAlt()` returns every histogram `aria-label` currently in the DOM,
   in order. For a two-part question (e.g. one histogram choice per sector),
   the first 4 belong to part 1's options, the next 4 to part 2's — slice
   accordingly.
3. `__ML.histBars(alt)` parses one label into `[[x, relFreq], ...]` pairs.
   Compare against your computed bins — the correct option matches exactly
   (Pearson's distractors are typically the *same* shape shifted along the
   x-axis by a fixed offset, not a different shape, so check the starting
   x-value and the full sequence, not just "does it look similar").
4. This is exact, not approximate — treat a match as confirmed, not a
   best-guess. It replaced a policy of budgeting 2 tries and accepting
   the loss on this part; a live retry (3.2.29-T, "See similar") that used
   this method scored the full 8/8 parts (1.0/1) where visual guessing had
   previously produced 0.83 and, before that, 0.92.

Fall back to visual comparison (peak position, tail length as fractions of the
axis span) only if no `aria-label` is present on that option — this has not
been observed yet in this course but may vary by question template.

## 21. Data tables aren't all shaped the same — verify before trusting `__ML.table()`

Three different table shapes showed up in this HW set, and `__ML.table()`
(built for the tornado-style header+data+duplicate-footer layout) silently
mis-parses the ones that don't match:

- **No duplicate footer row**: a plain `n` rows + 1 header table (e.g. a
  pulse-rate list of named students) has `__ML.table()` drop the *real* last
  data row, because the function assumes row `rows.length-1` is a repeated
  header and excludes it. Caught only by noticing the extracted count (8) was
  one short of the stated sample size (9). **Always check `rows.length` against
  the "n" stated in the question stem before trusting the extraction.**
- **Side-by-side repeated column groups via `colSpan`**: a table headed
  "Bond mutual funds | Stock mutual funds" (or State/F-Scale/PropLoss/Length ×
  multiple groups) uses `colSpan` on the header cells to mark which raw
  columns belong to which group — `__ML.table()`'s per-row array doesn't
  reflect that grouping. Read `header.colSpan` per cell first, then index the
  correct sub-range of `cells[]` for each group when flattening to a single
  array per variable.
- **Two-column "State | Length" pairs repeated across the row** (e.g. the
  tornado state/length table): each row holds two independent
  state-length observations, not one row per observation. Push both
  `cells[0]`/`cells[1]` and `cells[3]`/`cells[4]` per row, and filter by the
  state name in `cells[0]`/`cells[3]` when you need a single state's subset
  (e.g. just Texas or just Wyoming) rather than the whole column.

The safe habit: after any `__ML.table()`-style extraction, print `header` with
`colSpan`, print the row count, and cross-check the total observation count
against whatever "n" or "sample size" the question states, before computing
anything from the data.
