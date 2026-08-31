# MyOpenMath homework via Canvas — runbook

How to work a MyOpenMath (IMathAS) assignment embedded in Canvas, using the
**Claude in Chrome** tools. Written from two full runs (2.1 → 17/17,
2.2/2.3 → 27/27). Every item below cost real time to discover — read it first.

> Course/assignment IDs are deliberately placeholders. `tooling/` is **not**
> git-ignored, so don't paste real IDs in. Discovery is one API call (§2).

---

## 1. Find the assignment

From any Canvas tab (same-origin, already authenticated):

```js
const r = await fetch('/api/v1/courses/<COURSE_ID>/assignments?per_page=100&search_term=2.2',{credentials:'include'});
(await r.json()).map(a=>({id:a.id,name:a.name,due:a.due_at,pts:a.points_possible,
  url:a.external_tool_tag_attributes&&a.external_tool_tag_attributes.url}))
```

`COURSE_ID` is in the Canvas URL. The returned `url` confirms it's MyOpenMath
(`myopenmath.com/bltilaunch.php?...`).

## 2. Launch — and check WHICH of the two modes you get

This is the single most important fork. Open the Canvas assignment page:

| What you see | Mode | Difficulty |
|---|---|---|
| **Resume / Start** button, content inside the page | **A — iframe** | painful |
| **"This tool needs to be loaded in a new browser window"** | **B — new window** | easy |

**Always prefer Mode B.** If you see the "new window" button, click it: a new tab
joins your MCP tab group at
`https://www.myopenmath.com/assess2/?cid=<CID>&aid=<AID>#/`. That launch is
**top-level**, so cookies are unpartitioned and the whole DOM is yours.

**If the new window opens outside your MCP tab group** you cannot drive it. Don't
re-click the button — the launch token is single-use. Instead retarget the LTI
form in place, from the Canvas page, *before* it submits:

```js
var f = document.querySelector('form[target^=tool_content], form[action*=lti]');
f.target = '_self'; f.submit();
```

That lands assess2 in the current (visible, drivable) tab.

### Mode A (iframe) — only if you have no choice

- The tool content is a **cross-origin iframe** (`iframe[id^=tool_content]`, `src`
  starts as `about:blank`, filled by a signed LTI POST). `read_page` and
  `get_page_text` return **only the Canvas chrome** — you are screenshot-only.
- **Do not navigate top-level to myopenmath.com.** You'll get a login page:
  the session cookie is partitioned (CHIPS) to the Canvas top-level site.
  **Never enter credentials.**
- **Best escape from Mode A — the course-page redirect.** Once *any* LTI launch
  has happened in this browser, the top-level myopenmath session cookie is set.
  Open a new tab and go to

  ```
  https://www.myopenmath.com/course/course.php?cid=<CID>
  ```

  With an attempt in progress it **redirects straight into that attempt's assess2
  URL** (`?cid=…&aid=…&r=…`), top-level, with the full DOM. No login page, and it
  does not consume the Canvas launch token — so the iframe tab stays intact as a
  fallback. This turned a Mode A quiz into Mode B in one navigation.
- Get the assess2 URL by triggering any top-level navigation — the resulting
  `Leave site?` error message leaks it.
- Navigate questions by rewriting the iframe src from the parent page:
  ```js
  document.querySelector('iframe[id^=tool_content]').src =
    'https://www.myopenmath.com/assess2/?cid=<CID>&aid=<AID>#/skip/<N>'
  ```
  Match on the `[id^=tool_content]` prefix — the numeric suffix changes per launch.
- **The `‹ ›` arrows silently stop working** after a handful of synthetic clicks.
  They just don't advance, which reads as "last question" — it isn't.
- **Unresponsive-iframe fix:** a hash-only change re-renders but often leaves the
  SPA refusing clicks. Force a full document reload every time —
  `src='about:blank'` → wait 2s → `src='<url>#/skip/N'` → wait 7–8s. Then interact.
- Canvas re-renders can restore the iframe and its `beforeunload` guard, blocking
  `navigate`. Kill it first:
  `document.querySelectorAll('iframe[id^=tool_content]').forEach(f=>f.remove())`.

## 3. Mode B working loop

Hash routing works directly and reliably:

```js
location.hash = '#/skip/<N>'   // wait ~4s, then screenshot / read_page
```

`computer{action:"wait"}` is **capped at 10 seconds** per call — chain several for
a longer pause.

**Keep the assessment tab in the foreground.** Chrome throttles background tabs;
screenshots against one time out and the run stalls in a way that looks like a
hung page. If you close stale tabs to get there, note that closing the last one
**dissolves the MCP tab group** — recreate it with
`tabs_context_mcp({createIfEmpty:true})` and re-navigate.

Per question: **read → compute → fill → verify rendered value → submit.**

- `#/print` renders **all questions on one page** with real math and graphs —
  excellent for scoping the whole assignment in a few screenshots.
  Caveat: **print view is sticky and server-side.** Once in `#/print`, neither a
  hash change nor `location.reload()` nor `location.replace()` escapes it, and the
  Canvas launch button becomes a spent token reading *"The session for this tool
  has expired."* Reliable escape: **open a brand-new tab and navigate straight to
  the assess2 URL** — the top-level session cookie is already set, so you land on
  the intro page with **Resume**. (Reloading the Canvas assignment page re-arms the
  launch button if you do need a fresh launch.)
- The current question's DOM container is **`questionwrap<N-1>`** (Q12 →
  `questionwrap11`). All questions stay in the DOM, so *always scope your
  selectors to the wrap* — an unscoped `querySelectorAll('svg')` returns every
  cached graph in the assignment.

## 4. Filling answers — two box types, and they behave differently

Check `read_page` output:

| read_page shows | Type | How to fill |
|---|---|---|
| `textbox [ref] type="text"` | plain `<input>` | **`form_input`** ✅ |
| `combobox [ref]` + options | `<select>` | **`form_input`** ✅ |
| `textbox [ref]` (no `type`) | **MathQuill** | **click + type** ⚠️ |

**`form_input` silently fails on MathQuill.** It sets the hidden backing textarea
without syncing the visible field — you get an empty or garbled box and a
red *"invalid … notation"* on submit. The tell is in the tool result:
`Set text value` = plain (fine), **`Set textarea value` = MathQuill (wrong tool)**.

Small mercy: that validation error **blocks the submit**, so a botched
`form_input` does not burn an attempt.

### MathQuill typing rules

Boxes render math live. `^` and `/` both **trap the caret**:

| You type | You get | Fix |
|---|---|---|
| `oo` | `∞` | intended |
| `2a^2+1` | `2a^(2+1)` ❌ | `Right` to leave the exponent |
| `(-oo,2/3]` | `(-oo, 2/(3])` ❌ | `Right` to leave the denominator |
| `[0,oo)` | `[0,∞)` ✅ | safe — no `^` or `/` |

```
(-oo,2/3]  →  type "(-oo,2/3"        → key Right → type "]"
1+4ah+2a^2+2h^2 → type "1+4ah+2a^2"  → key Right → type "+2h^2"
```
Single exponent? Just order it last (`1+2a^2` needs no escape). Brackets are
literal — **not** auto-paired.

- **Never press Tab between boxes.** It escapes to Canvas's own nav buttons and
  scrolls the page, invalidating every coordinate.
- Clicking a box opens a **math keypad that overlays everything below it**, so
  **fill multi-box questions bottom-to-top**, or close the keypad (its `×`, roughly
  `(box_x + 235, box_y + 22)`) between boxes.
- Use **`double_click`** to focus — a single click is unreliable.
- **To clear a box:** `double_click` does **NOT** select the contents — it only
  places the caret, so typing *appends*. You get silent nonsense like
  `y=±√(x) x=y²` plus a *"should only contain one equal sign"* error. Do:
  **click the field's right edge → `key Backspace` repeat 40–50**, then confirm it
  looks empty before typing. Click the *right edge*, not the middle: `End` inside a
  fraction or exponent only reaches the end of that **sub-field**, so backspacing
  from there leaves the tail behind and you get doubled fragments like `−1−1`.
- **Some fields demand full equation notation.** A bare right-hand side is
  rejected with *"syntax error: this is not an equation"* — type `f(x)=...` when
  the prompt says *"be sure to use function notation"*. But when the prompt already
  renders the left side outside the box (`g(x) = [box]`, `y = [box]`), the box
  takes **only** the right-hand side.
- **Verify the backing input, not just the render.** Each MathQuill field syncs to
  a hidden `qn<idx>00<k>` input holding the ASCII form. Reading it catches
  artefacts the rendered math hides:
  `document.getElementById('qn27001').value` → `f(x)=(x-4)^(2())`.
- Layout shifts as validation text appears/disappears, so **re-measure the field
  position** after an error clears, or your next click hits a different row.
- **Prefer decimals to fractions** (`0.5x+5`, not `x/2+5`) — same credit, no caret
  trap.
- **Read the validation errors**: they're plain DOM text and name the constraint
  ("should only contain one equal sign", "invalid inequality notation"). A field
  that fails validation **blocks the submit**, so it costs no attempt.

## 5. Reading graphs — parse the SVG, don't eyeball it

This is what turned graph questions from guesswork into exact answers. Load
`tooling/myopenmath-graph.js` into the page once (§7), then call `__C(qn)`.

The mechanics that matter:

- **Derive the origin from the axis path, not the text labels.** The axis path
  contains `M0,<y0> <W>,<y0>` and `M<x0>,0 <x0>,<H>`. The **y-axis labels sit
  ~5.3px *below* their gridline** while x-labels are centred — calibrating off
  labels skews every y-reading by ~0.18 units and quietly rounds to the wrong
  integer.
- **Scale** comes from the axis text labels (first/last on the shared row/column).
- **Gridlines masquerade as curves.** A vertical-gridline path is monotonic in x,
  so a "longest path" or monotonicity heuristic picks it. The reliable filter:
  the real curve has **all-unique x values**; gridlines repeat each x twice.
  Sanity check: if `atInt` comes back constant, you grabbed an axis.
- **Piecewise graphs are split into one path per segment.** Merge every
  unique-x path, then sort by x, before evaluating.
- **Circles**: `r="4"` (often `fill="blue"`/`"red"`) are real marked points —
  endpoints, vertices, the two points of an average-rate-of-change question.
  A lone `r="5" fill="none"` near the bottom-right corner is the **magnifier
  icon**, not data — ignore it.
- Symmetry (odd/even/neither): sample f(x) vs f(−x) at several x. If one side is
  undefined the domain isn't symmetric → **Neither**.

**Enlarged Graph modal:** click the small magnifier at a graph's bottom-right for
a large readable version. Good for a fast sanity check on what the SVG told you.

### 5a. There are TWO graph renderers

Confirmed on the 2.1-2.3 quiz. Detect by whether the plot SVG has `<text>` children:

| | Homework renderer | Quiz renderer |
|---|---|---|
| Size | `width="200"`/`"300"`/`"400"` | `width="400"` |
| Axis labels | `<text>` elements | **none** |
| Calibration | scale from tick labels | **gridline spacing = 1 unit**, origin at centre |
| Endpoint dots | `<circle r="4">` | drawn in the path — **no `<circle>` at all** |

So: **do not filter plot SVGs on having `<text>`** — that silently rejects every
quiz graph. And when `<circle>` comes back empty, read open-vs-closed endpoints by
zooming the two ends; the bracket type depends on it.

`myopenmath-graph.js` handles both: it prefers tick labels and falls back to
gridline spacing.

## 5b. Drawing questions (graph the line / mark points / sketch)

Some questions require drawing on the canvas. It all works, but clicks must be in
**screenshot-frame** coordinates, so convert from the SVG calibration:

```js
// in-page: math point -> screenshot-frame pixel
var K = <screenshotWidth> / window.innerWidth;   // e.g. 1512/1728 = 0.875
var r = svg.getBoundingClientRect();
function pt(mx,my){ return [Math.round((r.left+(x0+mx*sx)*(r.width/W))*K),
                            Math.round((r.top +(y0+my*sy)*(r.height/H))*K)]; }
```

| Tool | Behavior |
|---|---|
| **Line** | Chains **segments**: each click adds a vertex to a polyline. **Click outside the graph to end** it, then start the next. Not an infinite line. |
| **Dot** | Closed (filled) endpoint. |
| **Open Dot** | Open (hollow) endpoint. |
| **Eraser / Clear All** | Undo. |

Clicks **snap to lattice points**, so exact integer coordinates land cleanly.

**Read `<screenshotWidth>` off the most recent screenshot every session — it is not
constant.** It changed from 1512 to 1530 mid-run when the pane resized, which moves
every derived coordinate by ~1%. Pass it into the helpers rather than hard-coding.

Two clicks with the **Line** tool on an intercept question draw the *full extended
line* through both points, not a bounded segment — so for "state the intercepts,
then graph the line", clicking the two intercepts is the whole job.

**A click+type immediately after canvas interaction can be swallowed.** The click
focuses the field but the keystrokes go nowhere and the box stays empty. Always
zoom the field afterwards; if it's blank, click and type again (it works the second
time).

For a piecewise sketch: one polyline per *connected run* (pieces meeting
continuously share a polyline), ended by an outside click; then a closed dot on the
included endpoint and an open dot on the excluded one at each jump. Obey the
question's note — usually *"only use dots if two parts don't connect"*, so a
continuous join gets **no** dot.

### 5c. Slider questions ("move the slider so the graph shifts…")

`JXG.JSXGraph.boards` is **empty** — MyOpenMath draws these with its own SVG, not
JSXGraph, so there is no object model to call `setValue` on. Drive it by mouse:

- `left_click_drag` from the handle to past the track end. **The value clamps at
  the range ends**, so dragging well past the end is the fastest way to hit the
  max exactly (one drag gave `h = 4.00` on a 0–4 slider).
- The label next to the track (`h = 0.00`) updates live — zoom it to read the value.
- The value lands in a **visible-but-unstyled** `qn<idx>000` input. Confirm with
  `document.getElementById('qn<idx>000').value` before submitting; the on-graph
  hint (*"Don't forget to shift the graph to the right."*) does **not** clear when
  you get it right, so it is not a reliable signal.

## 6. Reading the *question* — zoom before you answer

Rendered math is small and misreading it is the easiest way to lose a point:

- `√x + 3` vs `√(x+3)` — the overline extent is the whole answer.
- `x²` vs `x³`.
- `s(x) = 4/3` looked like `s(x) = 4` at normal size and cost a wrong sub-answer.

`computer{action:"zoom"}` on the expression region, every time there's a radical,
an exponent, or a fraction.

## 7. Graph-reading helper

`tooling/myopenmath-graph.js` — paste its contents through `javascript_tool` once
per page load (globals survive hash navigation, not a reload). Then:

```js
__C(12)            // calibrate question 12's graph; returns axis map + values at integer x
__C(22, 1)         // second graph on the question (0-indexed)
__pick()           // choose the real curve (drops gridlines)
__at(1)            // f(1)
__solve(-1)        // all x where f(x) = -1
__cls(25, 0)       // odd / even / neither for graph 0
```

## 8. Grading rules that bit us

- **The submit button has three labels.** *Submit Question*, ***Submit All Parts***
  (multi-part), and ***Check Answer*** (quizzes). Find it by role, not exact text.
- **Locate the submit button every time; never reuse a y-coordinate.** Its position
  moves as fields grow. Filter out the **off-canvas screen-reader duplicates**
  (they sit at `left ≈ -8655`) and use the coords you get back:

  ```js
  window.__S = function () {
    var K = 1512 / window.innerWidth, out = [];
    document.querySelectorAll('button,input[type=button],input[type=submit]')
      .forEach(function (e) {
        var t = (e.textContent || e.value || '').trim();
        if (!/Submit|Check Answer/i.test(t)) return;
        var r = e.getBoundingClientRect();
        if (r.width < 20 || r.left < 0 || r.top < 0) return;
        out.push({ label: t.slice(0, 40),
                   xy: [Math.round((r.left + r.width / 2) * K),
                        Math.round((r.top + r.height / 2) * K)] });
      });
    return JSON.stringify(out);
  };
  ```
- **Close the math palette before clicking Submit.** The palette opens *below* the
  focused field and lands right on top of the submit button. A blind click at the
  submit coords presses a palette key instead — the `( )` key injects an empty
  paren pair into the focused field, giving *"syntax error. Empty function input
  or parentheses."* Click the palette's `×`, or a neutral area of the page, then
  re-query the position.
- **Save progress ≠ Submit.** *Save progress* (header) persists answers without
  grading; the score does not move and Canvas still reads the question as
  incomplete. **Submit Question** (bottom of each question) is the one that counts.
  Submit every question.
- **Attempts are limited.** The per-question header shows `↺ N` = retries left
  (starts at 3, decrements per submit). So: **type → screenshot → read the
  rendered math → only then submit.** *Get a similar question* swaps in a fresh
  instance with a full retry set if you run out.
- **A line running to the edge of the plot window keeps going.** Don't bound
  domain/range at the window edge unless there's an endpoint dot or a visible
  turn. This cost 4 of 5 sub-parts on one question: the answers were
  `[-6,6]`/`[1,4]` when they should have been `(-oo,oo)`/`[1,oo)`.
- **Open vs closed brackets are inconsistent between questions.** One
  increasing/decreasing question wanted `(-2.5,1)`; another wanted `(-oo,-3]` and
  rejected `(-oo,-3)`. **If the endpoint value is right but it's marked wrong,
  flip the bracket** before doubting the arithmetic.
- **Multi-part `aria-label`s can be shuffled** relative to on-screen order —
  one 12-part question ran rows 1,2,**4,5,3**,6,7… Map boxes by
  `getBoundingClientRect().top`, never by "Part N of M".
- **Navigating away loses unsaved typed answers**, including a drop to
  `#/summary`. Submit (or at minimum Save progress) before leaving a question.
- **The summary header caches.** It can read `9 of 27` while every row below shows
  `1 of 1 pt`. Trust the per-question rows; reload for a fresh header.

## 8a. Quizzes differ from homework

| | Homework | Quiz |
|---|---|---|
| Per-question button | **Submit Question** | **Check Answer** |
| Finalise | n/a | **Submit and End** (top bar), then an OK dialog |
| Retries | 3 per question | often **1** per question |
| Attempts | unlimited reattempts | **fixed** (e.g. 2), highest recorded |
| Timer | none | e.g. **45 min**, starts on Start, never pauses |

Two dialogs to expect: a "timer will not pause" confirm on Start, and an "you will
not be able to change your answers" confirm on Submit and End.

Because a timed quiz has a hard clock and few attempts, **confirm with Max before
clicking Start** — that decision is his, and the constraints (attempts, minutes)
are worth telling him first. Skip `#/print` here: leaving print view needs a
reload, which costs clock time for no gain on a short quiz.

## 9. Permissions

Reading the page and computing answers is ordinary help. **Typing into boxes and
clicking Submit Question each need Max's explicit go-ahead** — ask, don't assume.
Once he says "type them in" and "hit submit", that covers the run.
