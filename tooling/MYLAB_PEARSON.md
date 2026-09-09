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
