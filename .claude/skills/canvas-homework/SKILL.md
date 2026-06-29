---
name: canvas-homework
description: Check Canvas for outstanding assignments and either surface the assignment, or draft a response in Max's voice. Use whenever Max asks what assignments / homework / coursework he still has to do, asks to pull an assignment's instructions or files from Canvas, or asks to start/draft an assignment. Orchestrates the canvas MCP, the canvas.mjs file-download helper, the built-in docx and pdf readers, and the writing-voice skill.
---

# Canvas homework workflow ("Chip")

This is the harness. It connects four things: the **canvas** MCP server (lists and
reads assignments), the **`scripts/canvas.mjs`** helper (downloads files the MCP
can't), the **built-in `docx` and `pdf` skills / `Read` tool** (read the files), and
the **`writing-voice` skill** (draft in Max's voice). Follow the steps in order.

## Tools you will use

From the **canvas** MCP server (this is its complete toolset):
- `canvas_list_active_courses` — fast list of your current courses (dashboard API).
  Prefer this for "what am I taking right now."
- `list_courses` — all courses; use flags for completed/all. Use when you need a
  course that isn't on the active dashboard.
- `search_assignments` — search assignment titles/descriptions; filter by due-date
  range, course, and completion/submission status. Use this to find what's *not done*.
- `get_assignment` — full details for one assignment; ask for **markdown** output so
  the description and any embedded file links come through cleanly.

The canvas MCP **cannot download attachments.** That gap is filled by:
- `node scripts/canvas.mjs files <courseId>` — list downloadable files in a course.
- `node scripts/canvas.mjs download <fileId|url> [outPath]` — download one file into
  `output/` (resolves Canvas's signed download URL using the API token).

Reading files (all built in — **do not** install an MCP for these):
- `.docx` → the **`docx` skill** (extract full text; never edit the source file).
- `.pdf` → the **`Read` tool** (use the `pages` parameter) or the **`pdf` skill**.

---

## Step 1 — List outstanding assignments

1. Call `canvas_list_active_courses` to get your current courses (and their IDs —
   you'll need IDs later). Fall back to `list_courses` if you need a non-active course.
2. Call `search_assignments` filtered to **not submitted / not completed**, ideally
   within an upcoming due-date window (e.g. now → +30 days). If the filter options
   don't cleanly express "incomplete," pull the candidates and filter by submission
   status / due date yourself.
3. Show Max a clean list: **course → assignment title → due date → points**. Sort by
   soonest due. If he just asked "what do I have left," **stop here** and let him
   pick one. Don't auto-start drafting everything.

## Step 2 — Pull the chosen assignment

Call `get_assignment` (markdown) for the assignment Max picks. Read the description
in full. Note: the deliverable type (essay, discussion post, worksheet, short
answer), the length/format requirements, the due date, and any rubric text.

## Step 3 — Find a downloadable file (usually a DOCX)

Look for an attached file two ways:
1. **In the description** from `get_assignment` — scan for links to Canvas files
   (URLs containing `/files/<id>` or `instructure_file_link` anchors). Grab the file
   id or URL.
2. **In the course files** — run `node scripts/canvas.mjs files <courseId>` and look
   for a file whose name matches the assignment (e.g. `Essay 2 Prompt.docx`).

If you find one, download it:
```
node scripts/canvas.mjs download <fileId|url> output/<sensible-name.ext>
```
Then decide which branch you're in based on what the file actually is.

---

## Step 4 — Branch on what you found

### Branch A — a DOCX exists AND it contains the assignment

This is the "just show it to me" path.

1. Read the **entire** DOCX with the `docx` skill (extract text).
2. **Do NOT edit the file.** Leave it exactly as downloaded.
3. **Print the full assignment text to the console** (into the chat), verbatim and
   complete — not a summary. If it's long, print all of it anyway; that's the point.
4. After printing, offer (one line): *"Want me to draft a response in your voice?"* —
   if yes, continue into Branch B using this DOCX's contents as the prompt.

> "Contains the assignment" means the DOCX is the actual prompt/instructions or a
> worksheet to read. If the DOCX is empty, or is just a rubric/cover sheet and the
> real task lives in the Canvas description, treat it as Branch B instead.

### Branch B — no DOCX, the DOCX isn't the assignment, or Max asked for a draft

This is the "do it in my voice" path.

1. **Figure out the task.** From the `get_assignment` description, determine exactly
   what has to be produced: the deliverable type, the prompt/question, required
   length, format, citation style, and any rubric criteria. State it back in one or
   two sentences so Max can confirm you understood the assignment.
2. **Read the context files.** If the assignment references a reading or attaches a
   **PDF** (or any other format), download it via `canvas.mjs download` and read it
   with the `Read` tool (`pages`) or `pdf` skill. Pull out the facts, quotes, and
   specifics you'll need so the draft is grounded in the actual source material.
3. **Draft in Max's voice.** Load the **`writing-voice`** skill
   (`.claude/skills/writing-voice/SKILL.md`) and write the response following it —
   stance-first, myth-busting, concrete numbers/examples, his punctuation and idiom
   habits, register matched to the assignment (academic vs. business/opinion). Hit
   the required length and rubric points.
4. **Output it two ways:**
   - **Print the full draft to the console** (into the chat).
   - **Save** it to `output/<course>-<assignment-slug>.md`.
5. Tell Max where it saved, the word count, and which rubric requirements it covers.

---

## Step 5 — Hand-off note

End every Branch B draft with a short, honest reminder (one line, not a lecture):
*"This is a first draft in your voice — read it, make it yours, and check your
course's policy on AI assistance before submitting."* This is Max's own writing
style applied to his own assignments; the point is to beat the blank page and study,
not to submit unread.

---

## Guardrails & tips

- **Never edit a downloaded assignment file.** Read it; don't write back to it.
  Drafts go in `output/`, originals stay untouched.
- **Print, don't just summarize, in Branch A.** Max wants the whole thing surfaced.
- If the **canvas** MCP isn't connected, say so and fall back to
  `node scripts/canvas.mjs courses` / `files` to confirm credentials work, then point
  Max at `README.md` setup.
- If credentials are missing, `canvas.mjs` prints exactly what to set — relay that.
- Course IDs from `list_courses` are what `canvas.mjs files <courseId>` needs; keep
  track of them as you go.
