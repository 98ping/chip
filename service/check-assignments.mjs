#!/usr/bin/env node
// check-assignments.mjs — Chip's "tap on the shoulder."
//
// A headless poller (no Claude involved). On each run it asks Canvas what's on
// your plate, figures out which assignments you HAVEN'T submitted yet and are
// due soon, and — for anything it hasn't already told you about — sends you a
// Telegram message. The actual drafting still happens interactively in Chip;
// this just tells you there's work queued up for it.
//
// It talks to the Canvas REST API directly (same trick as scripts/canvas.mjs)
// because the canvas MCP needs Claude to drive it, and this runs on a schedule
// with nobody watching. Zero dependencies — just Node 18+ (global fetch).
//
// This file is the source of truth. A byte-identical copy is vendored into the
// maria cluster repo at maria/k8s/chip/check-assignments.mjs, where a CronJob
// runs it every few hours. Edit here, then re-sync (see maria: `make sync-chip`).
//
// Usage:
//   node service/check-assignments.mjs           run one check (send if new)
//   node service/check-assignments.mjs test       send a test message (verify creds)
//   node service/check-assignments.mjs list       print what's due now; send nothing
//   node service/check-assignments.mjs state      show the remembered-assignments file
//
// Configuration (env vars, or a .env file in the chip project root):
//   CANVAS_API_TOKEN     required  Canvas access token (same one Chip uses)
//   CANVAS_DOMAIN        required  e.g. canvas.youruniversity.edu (no https://)
//   TELEGRAM_BOT_TOKEN   required  from @BotFather, looks like 123456:AA...
//   TELEGRAM_CHAT_ID     required  your numeric chat id (see service/README.md)
//   CHECK_WINDOW_DAYS    optional  how far ahead to look (default 14)
//   CHECK_TZ             optional  IANA tz for due times, e.g. America/Chicago
//   STATE_FILE           optional  where to remember what it's seen
//                                  (default: <chip>/output/.checker-state.json)
//   CHECK_DRY_RUN        optional  "1" to compute + print but never send

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHIP_ROOT = resolve(HERE, ".."); // service/ -> chip/

// --- tiny .env loader (no dependency), mirrors scripts/canvas.mjs ----------
// Looks for a .env in the chip project root (and next to this script). In the
// cluster there is no .env — the CronJob injects everything as real env vars,
// and this simply finds nothing and moves on.
function loadDotEnv() {
  const candidates = [
    process.env.CHIP_ENV_FILE,
    join(CHIP_ROOT, ".env"),
    join(HERE, ".env"),
  ].filter(Boolean);
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break; // first file wins
  }
}
loadDotEnv();

// --- resolved config -------------------------------------------------------
const TOKEN = process.env.CANVAS_API_TOKEN;
const DOMAIN = (process.env.CANVAS_DOMAIN || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const WINDOW_DAYS = Number(process.env.CHECK_WINDOW_DAYS || 14) || 14;
const TZ = process.env.CHECK_TZ || process.env.TZ || undefined;
const STATE_FILE =
  process.env.STATE_FILE || join(CHIP_ROOT, "output", ".checker-state.json");
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.CHECK_DRY_RUN || "");

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PRUNE_AFTER_DAYS = 30; // forget assignments this long past their due date
const STATE_VERSION = 2;

const REMINDER_STAGES = [
  { key: "72h", hours: 72, label: "due within 3 days" },
  { key: "24h", hours: 24, label: "due within 24 hours" },
  { key: "3h", hours: 3, label: "due in the next few hours" },
  { key: "overdue", hours: 0, label: "now overdue" },
];

// --- credential checks -----------------------------------------------------
function requireCanvas() {
  if (!TOKEN || !DOMAIN) {
    fail(
      "Missing Canvas credentials.\n" +
        "Set CANVAS_API_TOKEN and CANVAS_DOMAIN as env vars, or add them to the\n" +
        "chip project's .env file. See service/README.md."
    );
  }
}
function requireTelegram() {
  if (!TG_TOKEN || !TG_CHAT) {
    fail(
      "Missing Telegram credentials.\n" +
        "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Get the token from @BotFather\n" +
        "and your chat id as described in service/README.md."
    );
  }
}
function fail(msg) {
  console.error("Error: " + msg);
  process.exit(1);
}

// --- Canvas API ------------------------------------------------------------
const API = () => `https://${DOMAIN}/api/v1`;
const authHeaders = () => ({ Authorization: `Bearer ${TOKEN}` });

async function canvasGet(path) {
  const url = path.startsWith("http") ? path : `${API()}${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Canvas API ${res.status} ${res.statusText} — ${url}\n${body.slice(0, 300)}`
    );
  }
  return res;
}

// Follow Canvas's Link-header pagination and concatenate the pages.
function nextLink(res) {
  const link = res.headers.get("link");
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}
async function canvasGetAll(path) {
  let res = await canvasGet(path);
  let out = await res.json();
  if (!Array.isArray(out)) out = [];
  let url = nextLink(res);
  let guard = 0;
  while (url && guard++ < 50) {
    res = await canvasGet(url);
    const page = await res.json();
    if (Array.isArray(page)) out = out.concat(page);
    url = nextLink(res);
  }
  return out;
}

// The Planner API is purpose-built for "what's on my plate in this date range,"
// and each item carries its submission status, so we can tell done from not-done
// without a second round of calls.
async function fetchPlannerItems(startDate, endDate) {
  const qs =
    `start_date=${encodeURIComponent(startDate.toISOString())}` +
    `&end_date=${encodeURIComponent(endDate.toISOString())}` +
    `&per_page=50`;
  return canvasGetAll(`/planner/items?${qs}`);
}

// --- deciding what counts --------------------------------------------------
// "Something for Chip to start working on" = a gradable item you haven't turned
// in, haven't been excused from, and haven't manually crossed off, that has a
// real due date in our window.
const GRADABLE = new Set([
  "assignment",
  "quiz",
  "discussion_topic",
  "sub_assignment",
]);

function dueOf(item) {
  return item?.plannable?.due_at || item?.plannable_date || null;
}

function isActionable(item) {
  if (!GRADABLE.has(item.plannable_type)) return false;
  const ov = item.planner_override;
  if (ov && (ov.marked_complete || ov.dismissed)) return false;
  const s = item.submissions;
  if (s && typeof s === "object" && (s.submitted || s.excused)) return false;
  if (!dueOf(item)) return false;
  return true;
}

function keyOf(item) {
  return `${item.plannable_type}:${item.plannable_id}`;
}

function titleOf(item) {
  const p = item.plannable || {};
  return p.title || p.name || "(untitled assignment)";
}

function courseOf(item) {
  return (
    item.context_name ||
    (item.course_id ? `Course ${item.course_id}` : "Canvas")
  );
}

function urlOf(item) {
  const u = item.html_url;
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return `https://${DOMAIN}${u}`;
}

function formatDue(iso) {
  if (!iso) return "no due date";
  const d = new Date(iso);
  const opts = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: TZ }).format(d);
  } catch {
    // Invalid CHECK_TZ — fall back to the runtime's local zone.
    return new Intl.DateTimeFormat("en-US", opts).format(d);
  }
}

function relativeDue(iso, now) {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return null;
  const mins = Math.round((ms - now.getTime()) / 60000);
  const abs = Math.abs(mins);
  let amount;
  if (abs < 60) amount = `${abs} min`;
  else if (abs < 48 * 60) amount = `${Math.round(abs / 60)} hr`;
  else amount = `${Math.round(abs / 1440)} days`;
  return mins >= 0 ? `in ${amount}` : `${amount} overdue`;
}

// --- state (remember what we've already announced) -------------------------
function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null; // corrupt/empty -> treat as first run
  }
}

function saveState(state) {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function pruneSeen(seen) {
  const cutoff = Date.now() - PRUNE_AFTER_DAYS * DAY_MS;
  for (const [k, v] of Object.entries(seen)) {
    const due = v?.due ? Date.parse(v.due) : NaN;
    if (!Number.isNaN(due) && due < cutoff) delete seen[k];
  }
}

function record(seen, item) {
  const key = keyOf(item);
  const prior = seen[key] || {};
  const due = dueOf(item);
  const priorNotified = Array.isArray(prior.notified) ? prior.notified : [];
  const rescheduled = Boolean(prior.due && due && prior.due !== due);
  seen[key] = {
    title: titleOf(item),
    course: courseOf(item),
    due,
    firstSeen: prior.firstSeen || new Date().toISOString(),
    notified: rescheduled ? priorNotified.filter((k) => k === "new") : priorNotified,
  };
}

function markNotified(seen, item, keys) {
  const entry = seen[keyOf(item)];
  if (!entry) return;
  const merged = new Set(entry.notified || []);
  for (const k of keys) merged.add(k);
  entry.notified = [...merged];
}

function reachedStages(item, now) {
  const due = dueOf(item);
  const ms = due ? Date.parse(due) : NaN;
  if (Number.isNaN(ms)) return [];
  const hoursLeft = (ms - now.getTime()) / HOUR_MS;
  return REMINDER_STAGES.filter((s) => hoursLeft <= s.hours);
}

// --- Telegram --------------------------------------------------------------
async function sendTelegram(text) {
  if (DRY_RUN) {
    console.log("[dry-run] would send Telegram message:\n" + text);
    return;
  }
  requireTelegram();
  const res = await fetch(
    `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text,
        disable_web_page_preview: true,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage ${res.status}: ${body.slice(0, 300)}`);
  }
}

// One assignment, formatted as a message block.
function renderItem(item, now) {
  const bits = [formatDue(dueOf(item))];
  const rel = now ? relativeDue(dueOf(item), now) : null;
  if (rel) bits.push(rel);
  const pts = item?.plannable?.points_possible;
  if (typeof pts === "number") bits.push(`${pts} pts`);
  const url = urlOf(item);
  let block = `• [${courseOf(item)}] ${titleOf(item)}\n  due ${bits.join(" · ")}`;
  if (url) block += `\n  ${url}`;
  return block;
}

const MAX_LISTED = 15; // keep the message a sane length

function renderList(items, now) {
  const shown = items
    .slice(0, MAX_LISTED)
    .map((it) => renderItem(it, now))
    .join("\n\n");
  const extra =
    items.length > MAX_LISTED ? `\n\n…and ${items.length - MAX_LISTED} more.` : "";
  return shown + extra;
}

function renderNewMessage(items, now) {
  const noun = items.length === 1 ? "assignment" : "assignments";
  return (
    `\u{1F43F}️ Chip — ${items.length} new ${noun} to start:\n\n` +
    renderList(items, now) +
    `\n\nOpen Chip and say "what do I have left?"`
  );
}

function renderReminderMessage(stage, items, now) {
  const noun = items.length === 1 ? "assignment" : "assignments";
  return (
    `\u{23F0} Chip — ${items.length} ${noun} ${stage.label}:\n\n` +
    renderList(items, now) +
    `\n\nOpen Chip and say "what do I have left?"`
  );
}

// --- commands --------------------------------------------------------------
async function cmdRun() {
  requireCanvas();

  const now = new Date();
  const start = new Date(now.getTime() - 1 * DAY_MS); // small grace for just-overdue
  const end = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);

  const items = await fetchPlannerItems(start, end);
  const actionable = items.filter(isActionable);

  const prior = loadState();

  // First run: adopt whatever's currently open as the baseline and send a
  // single friendly confirmation, rather than firing one text per assignment.
  if (!prior || !prior.seen) {
    const seen = {};
    for (const it of actionable) {
      record(seen, it);
      markNotified(seen, it, reachedStages(it, now).map((s) => s.key));
    }
    if (!DRY_RUN) saveState({ version: STATE_VERSION, seen });

    let msg;
    if (actionable.length === 0) {
      msg =
        `\u{1F43F}️ Chip is now watching your Canvas. Nothing unsubmitted is ` +
        `due in the next ${WINDOW_DAYS} days — I'll text you when something shows up.`;
    } else {
      const noun = actionable.length === 1 ? "assignment" : "assignments";
      const preview = actionable
        .slice(0, 3)
        .map((it) => `• [${courseOf(it)}] ${titleOf(it)}`)
        .join("\n");
      const more =
        actionable.length > 3 ? `\n…and ${actionable.length - 3} more.` : "";
      msg =
        `\u{1F43F}️ Chip is now watching your Canvas. You currently have ` +
        `${actionable.length} open ${noun} in the next ${WINDOW_DAYS} days:\n\n` +
        preview +
        more +
        `\n\nFrom here on I'll only text you about NEW ones.`;
    }
    await sendTelegram(msg);
    console.log(
      `First run: baselined ${actionable.length} open assignment(s), sent confirmation.`
    );
    return;
  }

  const seen = prior.seen;
  const freshKeys = new Set(
    actionable.filter((it) => !(keyOf(it) in seen)).map(keyOf)
  );
  for (const it of actionable) record(seen, it);

  const persist = () => {
    if (!DRY_RUN) saveState({ version: STATE_VERSION, seen });
  };

  // Sort soonest-due first so the message reads in priority order.
  const byDue = (a, b) => new Date(dueOf(a)) - new Date(dueOf(b));

  const fresh = actionable.filter((it) => freshKeys.has(keyOf(it)));
  if (fresh.length > 0) {
    fresh.sort(byDue);
    // Send FIRST, then persist — so if the send fails we retry next run instead
    // of silently swallowing the alert.
    await sendTelegram(renderNewMessage(fresh, now));
    for (const it of fresh) {
      markNotified(seen, it, [
        "new",
        ...reachedStages(it, now).map((s) => s.key),
      ]);
    }
    persist();
  }

  const buckets = new Map();
  const owedBy = new Map();
  for (const it of actionable) {
    if (freshKeys.has(keyOf(it))) continue;
    const done = new Set(seen[keyOf(it)]?.notified || []);
    const owed = reachedStages(it, now).filter((s) => !done.has(s.key));
    if (owed.length === 0) continue;
    const stage = owed[owed.length - 1];
    if (!buckets.has(stage.key)) buckets.set(stage.key, []);
    buckets.get(stage.key).push(it);
    owedBy.set(keyOf(it), owed.map((s) => s.key));
  }

  let reminded = 0;
  for (const stage of [...REMINDER_STAGES].reverse()) {
    const bucket = buckets.get(stage.key);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort(byDue);
    await sendTelegram(renderReminderMessage(stage, bucket, now));
    for (const it of bucket) markNotified(seen, it, owedBy.get(keyOf(it)));
    reminded += bucket.length;
    persist();
  }

  pruneSeen(seen);
  persist();

  if (fresh.length === 0 && reminded === 0) {
    console.log(
      `No new assignments (${actionable.length} open, all previously seen).`
    );
    return;
  }
  console.log(
    `Notified about ${fresh.length} new and ${reminded} due-soon assignment(s).`
  );
}

async function cmdTest() {
  requireTelegram();
  await sendTelegram(
    "\u{1F43F}️ Chip checker is wired up correctly. " +
      "This is a test message — you can ignore it."
  );
  console.log("Sent a test message to Telegram. Check your phone.");
}

async function cmdList() {
  requireCanvas();
  const now = new Date();
  const start = new Date(now.getTime() - 1 * DAY_MS);
  const end = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);
  const items = (await fetchPlannerItems(start, end)).filter(isActionable);
  items.sort((a, b) => new Date(dueOf(a)) - new Date(dueOf(b)));
  if (items.length === 0) {
    console.log(`No unsubmitted assignments due in the next ${WINDOW_DAYS} days.`);
    return;
  }
  console.log(
    `Unsubmitted assignments due in the next ${WINDOW_DAYS} days:\n`
  );
  for (const it of items) console.log(renderItem(it, now) + "\n");
}

function cmdState() {
  const state = loadState();
  console.log(`State file: ${STATE_FILE}`);
  if (!state || !state.seen) {
    console.log("(no state yet — the next run will be the first run)");
    return;
  }
  const entries = Object.entries(state.seen);
  console.log(`Remembering ${entries.length} assignment(s):\n`);
  for (const [k, v] of entries) {
    const sent = (v.notified || []).join(", ") || "nothing yet";
    console.log(`  ${k}  [${v.course}] ${v.title}  (due ${v.due || "?"}, sent: ${sent})`);
  }
}

// --- dispatch --------------------------------------------------------------
const [cmd = "run"] = process.argv.slice(2);
const run = {
  run: cmdRun,
  test: cmdTest,
  list: cmdList,
  state: () => Promise.resolve(cmdState()),
};

(async () => {
  const isHelp = cmd === "--help" || cmd === "-h";
  if (isHelp || !run[cmd]) {
    console.log("Chip assignment checker\n");
    console.log("Commands:");
    console.log("  node service/check-assignments.mjs           run one check");
    console.log("  node service/check-assignments.mjs test      send a test message");
    console.log("  node service/check-assignments.mjs list      print what's due now");
    console.log("  node service/check-assignments.mjs state     show remembered state");
    process.exit(isHelp ? 0 : 1); // help is success; an unknown command is an error
  }
  try {
    await run[cmd]();
  } catch (err) {
    console.error("Error:", err?.message || err);
    process.exit(1);
  }
})();
