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

async function apiGetRes(path) {
  const url = path.startsWith("http") ? path : `${API()}${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Canvas API ${res.status} ${res.statusText} — ${url}\n${body.slice(0, 400)}`);
  }
  return res;
}

async function apiGet(path) {
  return (await apiGetRes(path)).json();
}

function nextLink(res) {
  const link = res.headers.get("link");
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

async function apiGetAll(path) {
  let res = await apiGetRes(path);
  let out = await res.json();
  if (!Array.isArray(out)) out = [];
  let url = nextLink(res);
  let guard = 0;
  while (url && guard++ < 50) {
    res = await apiGetRes(url);
    const page = await res.json();
    if (Array.isArray(page)) out = out.concat(page);
    url = nextLink(res);
  }
  return out;
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

function fileLabel(f) {
  return f.display_name ?? f.filename ?? "(unnamed)";
}

async function cmdFiles(courseId, filter) {
  requireCreds();
  if (!courseId) {
    console.error("Usage: node scripts/canvas.mjs files <courseId> [nameFilter]");
    process.exit(1);
  }
  const all = await apiGetAll(`/courses/${courseId}/files?per_page=100`);
  if (all.length === 0) {
    console.log(`No files found in course ${courseId} (or files are disabled for it).`);
    return;
  }
  const needle = (filter || "").toLowerCase();
  const files = needle
    ? all.filter((f) => fileLabel(f).toLowerCase().includes(needle))
    : all;
  if (files.length === 0) {
    console.log(`No files in course ${courseId} matching "${filter}" (searched ${all.length}).`);
    return;
  }
  const scope = needle ? ` matching "${filter}"` : "";
  console.log(`Files in course ${courseId}${scope} (${files.length} of ${all.length}):`);
  for (const f of files) {
    const type = f.content_type ?? "?";
    console.log(`  id=${String(f.id).padEnd(10)} ${fileLabel(f)}   [${type}]`);
  }
  console.log(`\nDownload one with:  node scripts/canvas.mjs download <fileId> output/<name>`);
}

async function cmdAssignmentFiles(courseId, assignmentId) {
  requireCreds();
  if (!courseId || !assignmentId) {
    console.error("Usage: node scripts/canvas.mjs assignment-files <courseId> <assignmentId>");
    process.exit(1);
  }

  const assignment = await apiGet(`/courses/${courseId}/assignments/${assignmentId}`);

  const found = new Map();
  const add = (id, source) => {
    if (id === undefined || id === null || id === "") return;
    const key = String(id);
    if (!found.has(key)) found.set(key, new Set());
    found.get(key).add(source);
  };

  for (const m of String(assignment.description ?? "").matchAll(/\/files\/(\d+)/g)) {
    add(m[1], "description");
  }

  for (const att of assignment.attachments ?? []) add(att.id, "attachment");

  let modules = [];
  try {
    modules = await apiGetAll(`/courses/${courseId}/modules?include[]=items&per_page=100`);
  } catch {
    modules = [];
  }
  for (const mod of modules) {
    const items = mod.items ?? [];
    const owns = items.some(
      (it) => it.type === "Assignment" && String(it.content_id) === String(assignmentId)
    );
    if (!owns) continue;
    for (const it of items) {
      if (it.type === "File") add(it.content_id, `module "${mod.name ?? mod.id}"`);
    }
  }

  console.log(`Assignment ${assignmentId}: ${assignment.name ?? "(untitled)"}`);

  if (found.size === 0) {
    console.log(`\nNo linked files found in the description, attachments, or its module.`);
    console.log(`Try the course file list:  node scripts/canvas.mjs files ${courseId} <nameFilter>`);
    return;
  }

  console.log(`\nLinked files (${found.size}):`);
  for (const [id, sources] of found) {
    let label = `(no access to file ${id})`;
    let type = "?";
    try {
      const meta = await apiGet(`/files/${id}`);
      label = meta.display_name ?? meta.filename ?? label;
      type = meta.content_type ?? "?";
    } catch {}
    console.log(`  id=${id.padEnd(10)} ${label}   [${type}]   via ${[...sources].join(", ")}`);
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
  files: () => cmdFiles(rest[0], rest[1]),
  "assignment-files": () => cmdAssignmentFiles(rest[0], rest[1]),
  download: () => cmdDownload(rest[0], rest[1]),
};

(async () => {
  try {
    if (!cmd || !run[cmd]) {
      console.log("Chip — Canvas file helper\n");
      console.log("Commands:");
      console.log("  node scripts/canvas.mjs courses");
      console.log("  node scripts/canvas.mjs files <courseId> [nameFilter]");
      console.log("  node scripts/canvas.mjs assignment-files <courseId> <assignmentId>");
      console.log("  node scripts/canvas.mjs download <fileId|url> [outPath]");
      process.exit(cmd ? 1 : 0);
    }
    await run[cmd]();
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
