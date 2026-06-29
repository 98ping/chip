# examples/ — see Chip work, then make it yours

Chip's best trick is writing in *your* voice. But your real essays shouldn't live in a
public repo (see the note at the bottom), so this folder ships a complete, **fictional**
example instead. Use it to understand the pattern, then swap in your own writing.

Everything in here is invented. No real person writes exactly like this.

## What's here

- **`writing-samples/`** — two short, made-up sample essays: one opinion piece
  (`sample-opinion-essay.md`) and one academic snippet (`sample-research-snippet.md`).
  They deliberately share one invented "voice" with consistent quirks.
- **`skills/writing-voice/SKILL.md`** — a finished voice skill reverse-engineered
  *from those two samples*. This is exactly what your real one should look like.

## Make it yours (3 steps)

1. Put two or more pieces of your own writing into the top-level `writing-samples/`
   folder (plain text or markdown). The more range, the better the match.
2. Either:
   - copy `examples/skills/writing-voice/SKILL.md` to
     `.claude/skills/writing-voice/SKILL.md` and tell Claude
     *"rebuild this voice skill from my real samples,"* **or**
   - just tell Claude *"build my writing-voice skill from the samples in
     writing-samples/."*
3. Done. Your real samples and your real voice skill are git-ignored, so they stay on
   your machine and never get published.

## Why your real writing is git-ignored

If you publish your actual schoolwork, it becomes a public, searchable source — and a
plagiarism checker can later flag *your own* essay as matching it. Keeping your writing
local avoids that entirely. This example proves the feature works without putting your
name on anything.
