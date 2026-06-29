#!/usr/bin/env node
// canvas.mjs — fills the gap the canvas MCP leaves open.
//
// The canvas MCP (mbcrosiersamuel/canvas-mcp) can list courses, search assignments,
// and read an assignment's details — but it cannot DOWNLOAD attached files. This
// little CLI talks to the Canvas REST API directly, using the same credentials, to
// discover and download files (the DOCX/PDF an assignment hangs off of).
//
// Usage:
//   node scripts/canvas.mjs courses                          list active courses + IDs
//   node scripts/canvas.mjs files <courseId>                 list downloadable files in a course
//   node scripts/canvas.mjs download <fileId|url> [outPath]  download a file into output/
//
// Credentials (either env vars, or a .env file in the project root):
//   CANVAS_API_TOKEN  — Canvas → Account → Settings → New Access Token
//   CANVAS_DOMAIN     — e.g. canvas.youruniversity.edu  (no https://)
//
// Requires Node 18+ (uses global fetch). You have Node 22. No dependencies.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "output");

// --- tiny .env loader (no dependency) so the helper works right after you fill .env
function loadDotEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const TOKEN = process.env.CANVAS_API_TOKEN;
const DOMAIN = (process.env.CANVAS_DOMAIN || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

function requireCreds() {
  if (!TOKEN || !DOMAIN) {
    console.error("Missing Canvas credentials.");
    console.error("Set CANVAS_API_TOKEN and CANVAS_DOMAIN as environment variables,");
    console.error("or copy .env.example to .env and fill them in. See README.md.");
    process.exit(1);
  }
}

const API = () => `https://${DOMAIN}/api/v1`;
const authHeaders = () => ({ Authorization: `Bearer ${TOKEN}` });

async function apiGet(path) {
  const url = path.startsWith("http") ? path : `${API()}${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Canvas API ${res.status} ${res.statusText} — ${url}\n${body.slice(0, 400)}`);
  }
  return res.json();
}

// --- commands -------------------------------------------------------------

async function cmdCourses() {
  requireCreds();
  const courses = await apiGet("/courses?enrollment_state=active&per_page=100");
  if (!Array.isArray(courses) || courses.length === 0) {
    console.log("No active courses found.");
    return;
  }
  console.log("Active courses:");
  for (const c of courses) {
    console.log(`  ${String(c.id).padEnd(8)} ${c.name ?? "(unnamed)"}`);
  }
  console.log(`\nUse a course ID with:  node scripts/canvas.mjs files <courseId>`);
}

async function cmdFiles(courseId) {
  requireCreds();
  if (!courseId) {
    console.error("Usage: node scripts/canvas.mjs files <courseId>");
    process.exit(1);
  }
  const files = await apiGet(`/courses/${courseId}/files?per_page=100`);
  if (!Array.isArray(files) || files.length === 0) {
    console.log(`No files found in course ${courseId} (or files are disabled for it).`);
    return;
  }
  console.log(`Files in course ${courseId}:`);
  for (const f of files) {
    const name = f.display_name ?? f.filename ?? "(unnamed)";
    const type = f.content_type ?? "?";
    console.log(`  id=${String(f.id).padEnd(10)} ${name}   [${type}]`);
  }
  console.log(`\nDownload one with:  node scripts/canvas.mjs download <fileId> output/<name>`);
}

// Resolve a file id to its real (signed) download URL + filename via the API.
async function resolveFileId(fileId) {
  const meta = await apiGet(`/files/${fileId}`);
  return { url: meta.url, filename: meta.display_name ?? meta.filename ?? `file-${fileId}` };
}

function extractFileId(arg) {
  if (/^\d+$/.test(arg)) return arg;                 // bare id
  const m = arg.match(/\/files\/(\d+)/);             // .../files/12345/download...
  return m ? m[1] : null;
}

async function cmdDownload(target, outPath) {
  requireCreds();
  if (!target) {
    console.error("Usage: node scripts/canvas.mjs download <fileId|url> [outPath]");
    process.exit(1);
  }

  let downloadUrl;
  let filename;

  const fileId = extractFileId(target);
  if (fileId) {
    // Most reliable path: ask the API for the signed URL.
    const r = await resolveFileId(fileId);
    downloadUrl = r.url;
    filename = r.filename;
  } else if (target.startsWith("http")) {
    // A direct URL (e.g. a session/verifier download link). Fetch with auth.
    downloadUrl = target;
  } else {
    console.error(`Don't know how to handle "${target}". Pass a numeric file id, a Canvas /files/<id> URL, or a direct download URL.`);
    process.exit(1);
  }

  const res = await fetch(downloadUrl, { headers: authHeaders(), redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} — ${downloadUrl}`);
  }

  // Figure out a filename if we still don't have one.
  if (!filename) {
    const cd = res.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
    filename = m ? decodeURIComponent(m[1]) : (downloadUrl.split("/").pop()?.split("?")[0] || "download.bin");
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const dest = outPath ? resolve(ROOT, outPath) : join(OUTPUT_DIR, filename);
  const destDir = dirname(dest);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`Saved: ${dest}  (${buf.length.toLocaleString()} bytes)`);
}

// --- dispatch -------------------------------------------------------------

const [cmd, ...rest] = process.argv.slice(2);

const run = {
  courses: () => cmdCourses(),
  files: () => cmdFiles(rest[0]),
  download: () => cmdDownload(rest[0], rest[1]),
};

(async () => {
  try {
    if (!cmd || !run[cmd]) {
      console.log("Chip — Canvas file helper\n");
      console.log("Commands:");
      console.log("  node scripts/canvas.mjs courses");
      console.log("  node scripts/canvas.mjs files <courseId>");
      console.log("  node scripts/canvas.mjs download <fileId|url> [outPath]");
      process.exit(cmd ? 1 : 0);
    }
    await run[cmd]();
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
