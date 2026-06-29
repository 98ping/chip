---
name: writing-voice
description: EXAMPLE voice skill (fictional). A worked example of what a finished writing-voice skill looks like, reverse-engineered from the two fictional samples in examples/writing-samples/. Copy this to .claude/skills/writing-voice/SKILL.md and have Claude rebuild it from your own writing. Do not use this fictional voice for real drafts.
---

# Example Writing Voice  (fictional, this is a template)

> This skill analyzes the made-up author of examples/writing-samples/. It exists so you
> can see the shape of a finished voice skill before you build your own. Do not draft
> real work in this voice. To make your own: drop your essays in writing-samples/, copy
> this file to .claude/skills/writing-voice/SKILL.md, and tell Claude "rebuild this
> voice skill from my real samples."

---

## 0. Hard guardrails (always apply, no exceptions)

These override everything else in this sheet. Every draft must follow them, every time:

1. NO EM DASHES. Ever. Never use the "—" character (or "--" as a stand-in) to join or
   interrupt a sentence. Use a comma, a semicolon, a colon, parentheses, or just split
   it into two sentences. For number ranges, write "20 to 35%" or "20-35%" with a plain
   hyphen.
2. NO MARKDOWN in the output. Plain prose only, the way it would look typed straight
   into a document or an essay box. No bold, no italics, no backticks, no "#" headings,
   and no markdown bullet or numbered-list syntax used for styling. Get emphasis from
   word choice and sentence structure, not symbols.

Last step before you hand anything back: scan the whole draft for the "—" character and
for any "*", "_", "#", or backtick, and fix anything you find.

---

## 1. Snapshot

This writer is a friendly skeptic. They open by questioning something everyone takes
for granted, explain it with a plain everyday analogy, and land on a short, blunt
punchline. The register flexes, looser for opinion and tighter for the research
snippet, but the engine is the same: question the assumption, make it concrete with a
comparison, end on a line you remember.

## 2. Core voice principles

1. Open by questioning the default. Most pieces start with a rhetorical question that
   challenges a common belief.
   > "Why does everyone assume the newest phone is automatically the better buy?"
   > "What actually happens to a memory while you sleep?"

2. Debunk, then correct. State what people assume, then flip it.
   > "It's tempting to picture sleep as the brain switching off ... but the opposite is closer to the truth."
   > "'It's been twelve months' is not a reason. It's a marketing calendar."

3. Explain with an everyday analogy. Abstract idea, then a familiar comparison.
   > "a flagship phone today is like a high-end gaming PC from three years ago."
   > "Think of it like saving a file. ... Sleep is the save-to-disk step."

4. Name the key idea in plain words. When a technical term shows up, the writer states
   it directly and keeps moving, no formatting tricks.
   > "Researchers call this process memory consolidation."

5. Back it with one concrete piece of evidence. A number, or a single clean study.
   > "two groups learned the same set of word pairs, and the group that slept ... recalled substantially more."

6. End on a short punchline. Sections close on a clipped, quotable line.
   > "That's the tell."
   > "Learn it, then sleep on it, in that order."

## 3. Sentence and paragraph mechanics

- Conversational rhythm: medium explanatory sentences broken up by a short blunt one.
- Direct address with "you" throughout.
- Paragraphs run three to five sentences and end on the punchline, not the explanation.
- Rhetorical questions set up topics, then get answered right away.

## 4. Punctuation and formatting habits

- Discourse markers open a thought: "Look," "Here's the thing," "Honestly."
- Short sentences and full stops do the work a dash might otherwise do. No em dashes,
  per the guardrails above.
- Hyphens are fine inside compounds like "save-to-disk" or "all-nighter."
- ALL-CAPS on a single word is allowed for rare emphasis, since it is plain text.

## 5. Vocabulary and diction

- Plain, modern, casual but informed. No throat-clearing, no jargon without a plain
  gloss.
- Mild, real intensifiers: brutal, substantially, genuinely, exactly.
- Light idiom: the whole thing, can't keep up, that's the tell.

## 6. Anti-patterns, what this writer never does

- Stiff connectives: Furthermore, Moreover, In conclusion, It is important to note.
- Burying the point under hedges. They commit to a claim.
- A wall of analysis with no analogy or example attached.
- Ending a paragraph on a limp summary instead of a punchline.

## 7. Pre-submit checklist

- [ ] Zero em dashes anywhere in the draft? (hard guardrail)
- [ ] Zero markdown used for styling: no "*", "_", "#", or backticks, plain prose only? (hard guardrail)
- [ ] Does it open by questioning a default assumption?
- [ ] Is there a plain analogy for the hard idea?
- [ ] Is there at least one concrete number or clean study?
- [ ] Does the section end on a short, memorable line?
- [ ] Did I keep the discourse markers ("Look," "Honestly,") and drop the stiff ones?
- [ ] Read aloud: does it sound like a sharp friend explaining it, not a textbook?

## 8. Micro example (the move in action)

Generic draft:
> Procrastination is a common challenge. It is important to note that breaking tasks
> into smaller steps can be beneficial for productivity.

In this writer's voice:
> Why is starting always the hardest part? Procrastination isn't laziness. It's your
> brain dodging a task that feels huge. So shrink it. "Write the essay" is a wall.
> "Write one bad sentence" is a door. Studies on task-starting back this up. People who
> commit to a tiny first step finish far more often than people who plan the whole
> thing. Don't schedule the marathon. Just lace up one shoe.
