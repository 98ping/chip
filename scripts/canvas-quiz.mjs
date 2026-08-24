#!/usr/bin/env node
// canvas-quiz.mjs — Canvas *Classic Quizzes* helper.
//
// The canvas MCP can't see quizzes at all, and on many courses the
// /api/v1/courses/:id/quizzes index is disabled ("That page has been disabled
// for this course") — so quizzes have to be discovered through the ASSIGNMENTS
// index instead, where a classic quiz shows up as submission_types:["online_quiz"]
// with a `quiz_id`. This CLI does that, reads a quiz's metadata (attempts, time
// limit, question count — the numbers you must know BEFORE starting), and turns
// a browser-side question dump into a saved markdown + JSON record in output/.
//
// Note: a student token CANNOT read quiz *questions* (403). Questions only exist
// in the DOM of the /take page, once an attempt is open. That's what
// tooling/canvas-quiz.js is for. See tooling/CANVAS_QUIZZES.md.
//
// Usage:
//   node scripts/canvas-quiz.mjs list <courseId>              quizzes in a course (+ due/points/attempts)
//   node scripts/canvas-quiz.mjs info <courseId> <quizId>     the pre-flight numbers for one quiz
//   node scripts/canvas-quiz.mjs attempts <courseId> <quizId> your submissions/attempts so far
//   node scripts/canvas-quiz.mjs render <dump.json> [outPath] browser dump -> output/<slug>.md
//
// Credentials: CANVAS_API_TOKEN, CANVAS_DOMAIN (env vars or .env). Node 18+.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "output");

function loadDotEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const TOKEN = process.env.CANVAS_API_TOKEN;
const DOMAIN = (process.env.CANVAS_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");

function requireCreds() {
  if (!TOKEN || !DOMAIN) {
    console.error("Missing Canvas credentials.");
    console.error("Set CANVAS_API_TOKEN and CANVAS_DOMAIN, or fill in .env. See README.md.");
    process.exit(1);
  }
}

const API = () => `https://${DOMAIN}/api/v1`;

async function api(path) {
  const res = await fetch(`${API()}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = body && body.errors ? JSON.stringify(body.errors) : String(text).slice(0, 200);
    throw new Error(`${res.status} ${path} — ${msg}`);
  }
  return body;
}

const fmtDate = (d) => (d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

// --- list -----------------------------------------------------------------
// The quizzes index is often disabled; assignments is not. Classic quizzes are
// the ones with a quiz_id. external_tool ones are the MyOpenMath quizzes and
// belong to the `myopenmath` skill, not this one — flagged, not hidden.
async function cmdList(courseId) {
  requireCreds();
  if (!courseId) throw new Error("Usage: node scripts/canvas-quiz.mjs list <courseId>");

  const assignments = await api(`/courses/${courseId}/assignments?per_page=100`);
  const classic = [];
  const external = [];
  for (const a of assignments) {
    const types = a.submission_types || [];
    if (types.includes("online_quiz") && a.quiz_id) classic.push(a);
    else if (types.includes("external_tool") && /quiz/i.test(a.name)) external.push(a);
  }

  if (!classic.length && !external.length) {
    console.log("No quizzes found in this course.");
    return;
  }

  if (classic.length) {
    console.log(`Canvas Classic Quizzes in course ${courseId}:\n`);
    for (const a of classic.sort((x, y) => (x.due_at || "").localeCompare(y.due_at || ""))) {
      let extra = "";
      try {
        const q = await api(`/courses/${courseId}/quizzes/${a.quiz_id}`);
        const attempts = q.allowed_attempts === -1 ? "unlimited" : q.allowed_attempts;
        extra = `  [${q.question_count} q · ${attempts} attempt(s) · limit ${q.time_limit ? q.time_limit + " min" : "none"}]`;
      } catch { /* metadata may be restricted; the ids above are still usable */ }
      console.log(`  quiz ${a.quiz_id}  (assignment ${a.id})  ${a.name}`);
      console.log(`      due ${fmtDate(a.due_at)} · ${a.points_possible} pts${extra}`);
      console.log(`      ${a.html_url.replace(/assignments\/\d+$/, `quizzes/${a.quiz_id}`)}`);
    }
  }
  if (external.length) {
    console.log(`\nExternal-tool quizzes (MyOpenMath etc. — use the \`myopenmath\` skill):`);
    for (const a of external) console.log(`  assignment ${a.id}  ${a.name}  (due ${fmtDate(a.due_at)})`);
  }
}

// --- info -----------------------------------------------------------------
// The pre-flight. Read this BEFORE opening an attempt: attempts and time limit
// are the two facts that make starting a quiz reversible or not.
async function cmdInfo(courseId, quizId) {
  requireCreds();
  if (!courseId || !quizId) throw new Error("Usage: node scripts/canvas-quiz.mjs info <courseId> <quizId>");

  const q = await api(`/courses/${courseId}/quizzes/${quizId}`);
  const attempts = q.allowed_attempts === -1 ? "unlimited" : q.allowed_attempts;
  const lines = [
    `Title:            ${q.title}`,
    `Type:             ${q.quiz_type}`,
    `Questions:        ${q.question_count}   (${q.points_possible} pts)`,
    `Attempts allowed: ${attempts}`,
    `Time limit:       ${q.time_limit ? q.time_limit + " min" : "none"}`,
    `Layout:           ${q.one_question_at_a_time ? "one question at a time" + (q.cant_go_back ? " (can't go back)" : "") : "all on one page"}`,
    `Shuffled:         ${q.shuffle_answers ? "yes — question order differs per attempt" : "no"}`,
    `Shows answers:    ${q.show_correct_answers ? "yes, after submit" : "no"}`,
    `Scoring:          ${q.scoring_policy || "—"}`,
    `Due:              ${fmtDate(q.due_at)}`,
    `Available:        ${fmtDate(q.unlock_at)} → ${fmtDate(q.lock_at)}`,
    `Take URL:         ${q.html_url}/take`,
  ];
  console.log(lines.join("\n"));

  const warn = [];
  if (q.allowed_attempts === 1) warn.push("ONE attempt only — starting it is a one-way door.");
  if (q.time_limit) warn.push(`Timed: ${q.time_limit} min. The clock starts the moment the attempt opens.`);
  if (q.cant_go_back) warn.push("Can't go back — every question must be answered before advancing.");
  if (warn.length) console.log("\n!! " + warn.join("\n!! "));
}

// --- attempts -------------------------------------------------------------
async function cmdAttempts(courseId, quizId) {
  requireCreds();
  if (!courseId || !quizId) throw new Error("Usage: node scripts/canvas-quiz.mjs attempts <courseId> <quizId>");

  const body = await api(`/courses/${courseId}/quizzes/${quizId}/submissions`);
  const subs = body.quiz_submissions || [];
  if (!subs.length) {
    console.log("No attempts yet — this quiz has not been started.");
    return;
  }
  for (const s of subs) {
    console.log(`attempt ${s.attempt}  ${s.workflow_state}  score ${s.score ?? "—"}/${s.quiz_points_possible ?? "—"}`);
    console.log(`    started ${fmtDate(s.started_at)}   finished ${fmtDate(s.finished_at)}   left ${s.attempts_left}`);
  }
}

// --- render ---------------------------------------------------------------
// Takes the JSON that tooling/canvas-quiz.js's __QDUMP() produces and writes a
// readable record to output/. Saved BEFORE answering, so there is always a copy
// of the questions even if the attempt goes sideways.
async function cmdRender(dumpPath, outPath) {
  if (!dumpPath) throw new Error("Usage: node scripts/canvas-quiz.mjs render <dump.json> [outPath]");
  const dump = JSON.parse(readFileSync(dumpPath, "utf8"));

  const name = dump.title || basename(dumpPath, ".json");
  const out = outPath || join(OUTPUT_DIR, `${slug(name)}.md`);

  const L = [];
  L.push(`# ${name}`);
  L.push("");
  L.push(`- Course: ${dump.courseId ?? "—"} · Quiz: ${dump.quizId ?? "—"}`);
  L.push(`- Captured: ${dump.capturedAt || "—"}`);
  L.push(`- Questions: ${dump.questions.length}${dump.pointsPossible ? ` · ${dump.pointsPossible} pts` : ""}`);
  if (dump.attemptUrl) L.push(`- Attempt: ${dump.attemptUrl}`);
  L.push("");

  dump.questions.forEach((q, i) => {
    L.push(`## ${q.name || `Question ${i + 1}`}${q.points ? `  (${q.points})` : ""}`);
    L.push("");
    L.push(`*type: ${q.type}${q.id ? ` · id: ${q.id}` : ""}*`);
    L.push("");
    L.push(q.text || "_(no question text)_");
    L.push("");
    if (q.answers && q.answers.length) {
      for (const a of q.answers) {
        const mark = a.selected ? "x" : " ";
        L.push(`- [${mark}] ${a.text}${a.value ? `  \`(${a.value})\`` : ""}`);
      }
      L.push("");
    }
    if (q.blanks && q.blanks.length) {
      for (const b of q.blanks) {
        L.push(`- blank \`${b.blank}\`: ${b.options ? b.options.join(" | ") : "_(free text)_"}${b.value ? `  → **${b.value}**` : ""}`);
      }
      L.push("");
    }
    if (q.response !== undefined && q.response !== null && q.response !== "") {
      L.push(`**Answer:** ${q.response}`);
      L.push("");
    }
    if (q.rationale) {
      L.push(`> Why: ${q.rationale}`);
      L.push("");
    }
  });

  if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, L.join("\n"), "utf8");

  const jsonOut = out.replace(/\.md$/, "") + ".json";
  writeFileSync(jsonOut, JSON.stringify(dump, null, 2), "utf8");
  console.log(`Saved: ${out}`);
  console.log(`Saved: ${jsonOut}`);
}

// --- dispatch -------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);

const run = {
  list: () => cmdList(rest[0]),
  info: () => cmdInfo(rest[0], rest[1]),
  attempts: () => cmdAttempts(rest[0], rest[1]),
  render: () => cmdRender(rest[0], rest[1]),
};

(async () => {
  try {
    if (!cmd || !run[cmd]) {
      console.log("Chip — Canvas quiz helper\n");
      console.log("Commands:");
      console.log("  node scripts/canvas-quiz.mjs list <courseId>");
      console.log("  node scripts/canvas-quiz.mjs info <courseId> <quizId>");
      console.log("  node scripts/canvas-quiz.mjs attempts <courseId> <quizId>");
      console.log("  node scripts/canvas-quiz.mjs render <dump.json> [outPath]");
      process.exit(cmd ? 1 : 0);
    }
    await run[cmd]();
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
