# Chip 🐿️

Chip checks your Canvas, tells you what's actually due, pulls the assignment file, and when the job is "go write something," drafts it in your own voice. Setup takes about ten minutes, and most of that is watching an install bar fill up.

Three moving parts: a Canvas connection, a download helper, and a style sheet built from your own writing. The setup script wires up all three, and you do it once.

## What you need

- Node.js 18 or newer. Get it from https://nodejs.org, or on a Mac run `brew install node`.
- Git. On Windows it comes with Git for Windows (https://git-scm.com). On a Mac it ships with the Xcode Command Line Tools, or run `brew install git`.
- A terminal. PowerShell on Windows, Terminal on macOS. Both are already installed.
- A Canvas account that can create an access token. Most student accounts can. Some locked-down district accounts can't, and that is the one thing here you can't work around yourself.

Confirm the first two from inside the chip folder:

```
node --version
git --version
```

Two version numbers and you're clear. If either one isn't recognized, install it before going further, because nothing past this point works without it.

## Setup

Three steps, the same on both platforms except for the one command in Step 1.

### 1. Run the installer

From inside the chip folder:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File setup/install.ps1
```

```bash
# macOS (Terminal)
bash setup/install.sh
```

The script does four things so you don't have to: downloads and builds the Canvas connector, asks for your credentials, saves them, and runs a test that lists your courses. On Windows, `ExecutionPolicy Bypass` only covers this one run, so it isn't loosening anything on your machine. When it asks you for two things, that's Step 2.

### 2. Get your two Canvas credentials

People assume the token is the hard part. It isn't; that's two minutes of clicking. The domain is what actually trips people up, so read both.

The token is a password substitute, so treat it like one:

1. Log into Canvas, click your avatar, then Settings.
2. Under Approved Integrations, click "+ New Access Token."
3. Name it "Chip," leave the expiry blank, and click Generate Token.
4. Copy it right then. Canvas shows you the full token exactly once.

The domain is just the host in your Canvas web address, nothing more. If your address bar reads `https://canvas.youruniversity.edu/courses`, your domain is:

```
canvas.youruniversity.edu
```

No `https://` in front, no slash on the end. Plenty of schools use `yourschool.instructure.com` instead, and either one is fine. Get this wrong and Canvas hands you a 401 even when your token is perfect, so it's worth a second look.

Paste both in when the script asks. It saves them to a local `.env` and runs a test. If your course names print, the connection is live.

### 3. Restart Claude Code in the chip folder

This is the step everyone forgets, and it's almost always the reason Chip "doesn't work" right after setup, not your token. Claude Code only loads your credentials and the Canvas connector at startup, so close it completely and reopen it inside the chip folder. The folder matters as much as the restart, because that folder is what switches on your writing voice and the Canvas workflow. Open it from your Desktop and you get a plain Claude with none of Chip's powers.

Mac twist: the connector reads your credentials from the shell, so open a fresh Terminal (or run `source ~/.zshrc`) and start Claude Code from there. Launch the app from the Dock and it won't see them.

That's it. You're set up.

## Using it

Talk to it like a person, from the chip folder:

- "What assignments do I still have in Canvas?" Chip lists what's open, soonest due first.
- "Pull up the next one." Chip downloads the file. If it's a Word doc, Chip reads the whole thing out and leaves your original untouched.
- "Draft that one in my voice." Chip reads the prompt and any PDF readings, writes a first draft that sounds like you, and saves it to output.

To hit Canvas directly, the helper runs the same on either platform:

```
node scripts/canvas.mjs courses
node scripts/canvas.mjs files <courseId>
node scripts/canvas.mjs download <fileId> output/prompt.docx
```

## Make it yours

The repo ships an example voice: fictional samples in `examples/writing-samples` and a finished skill in `examples/skills/writing-voice`, so you can see what a working setup looks like before you build your own.

Your real writing never goes in the repo. Anything in `writing-samples/` and your actual skill at `.claude/skills/writing-voice/SKILL.md` is git-ignored on purpose. That's not only privacy: publish your real schoolwork and a plagiarism checker can later flag your own essay as matching a public source. Not worth it.

To make Chip sound like you, drop a few pieces you're proud of into `writing-samples/` as text files and tell Claude "build my writing-voice skill from my samples." The more samples you give it, the sharper the match.

## When something breaks

Most "Chip is broken" moments are one of these:

- Claude can't see Canvas. You didn't restart, or you opened Claude outside the chip folder. Redo Step 3. If you did restart, confirm the connector built by checking that `vendor/canvas-mcp/server/index.js` exists.
- On a Mac, the connector can't see your credentials. You launched from the Dock, or from a terminal that hadn't loaded the new exports. Open a fresh Terminal, run `source ~/.zshrc`, and start Claude from there.
- "Missing Canvas credentials." Re-run the installer, or set the token and domain by hand, and restart your terminal so it picks them up.
- Canvas throws a 401 or 403. Your token expired or your domain is off. Generate a fresh token, and check the domain has no `https://` and no trailing slash.

Still stuck? Run `node scripts/canvas.mjs courses`. If that prints your courses, your credentials are fine and the problem is on Claude's side, which a clean restart almost always clears.

## Manual setup

If you'd rather not run the script, this does exactly what it does. Windows, in PowerShell:

```powershell
git clone --depth 1 https://github.com/mbcrosiersamuel/canvas-mcp.git vendor/canvas-mcp
cd vendor/canvas-mcp; npm install; npm run build; cd ../..
copy .env.example .env
setx CANVAS_API_TOKEN "your_token_here"
setx CANVAS_DOMAIN "canvas.youruniversity.edu"
```

macOS, in Terminal:

```bash
git clone --depth 1 https://github.com/mbcrosiersamuel/canvas-mcp.git vendor/canvas-mcp
cd vendor/canvas-mcp; npm install; npm run build; cd ../..
cp .env.example .env        # then fill in your token and domain
echo 'export CANVAS_API_TOKEN="your_token_here"' >> ~/.zshrc
echo 'export CANVAS_DOMAIN="canvas.youruniversity.edu"' >> ~/.zshrc
source ~/.zshrc
```

Then restart Claude Code in the chip folder, same as Step 3.

## License

MIT, see LICENSE.md: use it, fork it, ship your own spin, just keep the copyright line and expect no warranty. The Canvas connector under `vendor/` is a separate project with its own license; the installers pull it straight from its own repo, so this license covers Chip's code, not theirs.
