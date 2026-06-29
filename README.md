# Chip 🐿️

Chip checks your Canvas, tells you what's actually due, pulls the assignment file, and when the assignment is "go write something," it drafts that in your own voice. This is the setup guide, start to finish. Follow it top to bottom and the whole thing is running in about ten minutes, and most of that is just waiting on an install bar to fill up.

You might think wiring up something that talks to Canvas and also writes like you sounds complicated. It isn't. There are really only three moving parts: a Canvas connection, a download helper, and a style sheet built from your own writing. A setup script does the heavy lifting. Get through this page once and you never touch it again.

## What you need first

Don't skip this part. Almost every setup that goes sideways goes sideways right here, because someone jumped to Step 1 without the tools the script leans on. Make sure you have all four:

- Node.js, version 18 or newer. This runs both the Canvas connector and the download helper. If you don't have it, grab it from https://nodejs.org.
- Git. The script uses it to download and build the Canvas connector. It comes with Git for Windows (https://git-scm.com).
- Windows PowerShell. You already have it, since it ships with Windows. Every command on this page is written for it.
- A Canvas account at your school, plus the ability to create an access token. Almost every student account can. A locked-down district account sometimes can't, and that's the one thing here you can't work around yourself.

Quick way to confirm the first two are good to go. Open PowerShell in the chip folder and run:

```powershell
node --version
git --version
```

If both print a version number, you're clear. If either one says it isn't recognized, install it before you go any further, because nothing past this point works without it.

## Step 1: Run the installer

From inside the chip folder, run this one line:

```powershell
powershell -ExecutionPolicy Bypass -File setup/install.ps1
```

That script does four things so you don't have to. It downloads and builds the Canvas connector, asks you for your credentials, saves them, and runs a quick test to prove the connection actually works. The ExecutionPolicy Bypass part is only there because Windows blocks unsigned scripts by default, and it applies to this one run, so it isn't loosening anything on your machine.

When it gets going, it asks you for two things. Have them ready, because that's Step 2.

## Step 2: Get your two Canvas credentials

The script needs a token and a domain. People assume the token is the hard part. It isn't. It's two minutes of clicking. The part that actually trips people up is the domain, so read both of these carefully.

Your Canvas API token is your password substitute, so treat it like one:

1. Log into Canvas in your browser.
2. Click your avatar (your profile picture, top left), then Settings.
3. Scroll down to Approved Integrations and click "+ New Access Token."
4. Give it a purpose like "Chip," leave the expiry blank or set it far out, and click Generate Token.
5. Copy it right then. Canvas shows you the full token exactly once. Close that box without copying and you just make a new one, which is no big deal, only annoying.

Your Canvas domain is the host in your Canvas web address, and nothing more. Look at your browser's address bar while you're in Canvas. If the URL is https://canvas.youruniversity.edu/courses, then your domain is:

```
canvas.youruniversity.edu
```

That's it. No "https://" in front, no slash on the end. A lot of schools use the format yourschool.instructure.com instead, and either one is fine. Just copy whatever sits between the "https://" and the first slash. Get this wrong and Canvas rejects you with a 401 even when your token is perfect, so it's worth a second look.

Paste both into the script when it asks. It saves them to a local .env file and sets them as environment variables, then runs a test that lists your courses. If you see your course names print out, your credentials are good and the connection is live.

## Step 3: Restart Claude Code (the step everyone forgets)

This is the one. If Chip "doesn't work" right after setup, it's almost always this and almost never your token. Here's why. Claude Code reads your new credentials and loads the Canvas connector when it starts up, so it has no idea any of that exists until you give it a fresh start.

So close Claude Code completely, then reopen it inside the chip folder. Opening it in the right folder matters just as much as restarting, because that folder is what switches on your writing voice and the Canvas workflow. Run it from your Desktop and you get a confused Claude with none of Chip's powers.

Restart, in the right folder. Do that and you're done setting up.

## Using it

Now you just talk to it like a person. Open Claude Code in the chip folder and try:

- "What assignments do I still have to do in Canvas?" Chip lists what's open, soonest due first.
- "Pull up the next one." Chip finds and downloads the file. If the assignment comes as a Word doc, it reads the whole thing out to you and leaves the file untouched, so it never edits your stuff.
- "Draft that one in my voice." When the task is to write something, Chip reads the prompt and any PDF readings, then writes a first draft that sounds like you and saves it to the output folder.

If you ever want to poke at Canvas directly without going through Claude, the helper is right there:

```powershell
node scripts/canvas.mjs courses
node scripts/canvas.mjs files <courseId>
node scripts/canvas.mjs download <fileId> output/prompt.docx
```

## Doing it by hand instead

If you'd rather not run the script, maybe because you want to see every step, here's the whole thing manually. It does exactly what the installer does:

```powershell
# 1. Download and build the Canvas connector
git clone --depth 1 https://github.com/mbcrosiersamuel/canvas-mcp.git vendor/canvas-mcp
cd vendor/canvas-mcp
npm install
npm run build
cd ../..

# 2. Save your credentials for the helper script
copy .env.example .env

# 3. Set the same two values as environment variables, then restart your terminal
setx CANVAS_API_TOKEN "your_token_here"
setx CANVAS_DOMAIN "canvas.youruniversity.edu"
```

Then do Step 3, which is restarting Claude Code in the chip folder. The manual path and the script land in the exact same place. The script just saves you the typing.

## Make it yours

Out of the box this repo ships an example voice. There are fictional sample essays in examples/writing-samples, and a finished voice skill in examples/skills/writing-voice. That's there so you can see exactly what a working setup looks like before you build your own.

Your real writing never goes in the repo. Anything you drop into writing-samples, and your actual voice skill at .claude/skills/writing-voice/SKILL.md, is git-ignored on purpose, so your essays stay on your machine and not on GitHub. There's a real reason for that beyond privacy. Publish your actual schoolwork and a plagiarism checker can later flag your own work as matching a public source. Not worth it.

So to make Chip sound like you, drop a few pieces you're proud of into writing-samples as text files, then tell Claude "build my writing-voice skill from my samples." You can also copy the example skill and have Claude rework it from yours. The more samples you give it, the sharper the match. It's the difference between a one-trick pony and something that actually knows your range.

## When something breaks

Most "Chip is broken" moments aren't broken at all. They're one of a handful of small things. Check these in order before you assume the worst:

- Claude says it can't see Canvas, or has no Canvas tools. Nine times out of ten you didn't restart, or you opened Claude Code somewhere other than the chip folder. Go back to Step 3. If you did restart, confirm the connector actually built by checking that vendor/canvas-mcp/server/index.js exists.
- "Missing Canvas credentials." Your token and domain aren't where they need to be. Re-run the installer, or set them by hand, and restart your terminal so it picks them up.
- Canvas throws a 401 or 403. That's an authentication problem, not a Chip problem. Either your token expired or your domain is off. Generate a fresh token, double-check the domain has no "https://" and no trailing slash, and try again.
- A download saves something useless. Pass the numeric file id instead of a URL, because that's the most reliable. Run node scripts/canvas.mjs files <courseId> to find the id, then download it.

Work down that list and you'll fix it. If you're truly stuck, run node scripts/canvas.mjs courses. If that prints your courses, your credentials are fine and the problem is on Claude's side, which a clean restart almost always clears.

## License

Chip is released under the MIT License. See LICENSE.md. The short version is that you can use it, fork it, build on it, and ship your own spin. Just keep the copyright line, and know it comes with no warranty. Wire it up, and if something breaks, that's on you, not me. That's the whole point of an example project: take it and run.

One heads up. The Canvas connector under vendor is a separate project with its own license, and it isn't redistributed here, since setup/install.ps1 downloads it straight from its own repo. This MIT license covers Chip's code, not theirs.
