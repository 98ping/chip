#!/usr/bin/env node

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, extname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUTPUT_DIR = join(ROOT, "output");
const LINTABLE_EXT = new Set([".md", ".txt", ".markdown"]);

const RULES = [
  {
    id: "em-dash",
    re: /—|–|―|--/g,
    hint: "use a comma, a semicolon, a colon, parentheses, or two sentences",
  },
  { id: "asterisk", re: /\*/g, hint: "no markdown bold, italics, or bullets" },
  { id: "underscore", re: /_/g, hint: "no markdown emphasis" },
  { id: "hash", re: /#/g, hint: "no markdown headings" },
  { id: "backtick", re: /`/g, hint: "no code formatting" },
];

function isLintable(path) {
  try {
    return statSync(path).isFile() && LINTABLE_EXT.has(extname(path).toLowerCase());
  } catch {
    return false;
  }
}

function filesIn(dir) {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter(isLintable)
    .sort();
}

function collectTargets(args) {
  if (args.length === 0) {
    const found = existsSync(OUTPUT_DIR) ? filesIn(OUTPUT_DIR) : [];
    return Object.assign(found, { missing: false });
  }
  const out = [];
  let missing = false;
  for (const arg of args) {
    const path = resolve(process.cwd(), arg);
    if (!existsSync(path)) {
      console.error(`Not found: ${arg}`);
      missing = true;
      continue;
    }
    if (statSync(path).isDirectory()) out.push(...filesIn(path));
    else out.push(path);
  }
  return Object.assign(out, { missing });
}

function displayPath(path) {
  const rel = relative(process.cwd(), path);
  return !rel || rel.startsWith("..") ? path : rel;
}

function excerpt(line, col) {
  const start = Math.max(0, col - 1 - 28);
  const slice = line.slice(start, start + 62);
  const lead = start > 0 ? "…" : "";
  const tail = start + 62 < line.length ? "…" : "";
  return lead + slice.trim() + tail;
}

function lintFile(path) {
  const findings = [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(line)) !== null) {
        findings.push({
          line: index + 1,
          col: match.index + 1,
          rule: rule.id,
          hint: rule.hint,
          excerpt: excerpt(line, match.index + 1),
        });
        if (match.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  });
  findings.sort((a, b) => a.line - b.line || a.col - b.col);
  return findings;
}

const args = process.argv.slice(2);

if (args[0] === "--help" || args[0] === "-h") {
  console.log("Chip — draft guardrail linter\n");
  console.log("Checks drafts for em dashes and markdown characters.\n");
  console.log("  node scripts/lint-draft.mjs                  lint every draft in output/");
  console.log("  node scripts/lint-draft.mjs <file|dir> ...   lint specific paths");
  process.exit(0);
}

const targets = collectTargets(args);

if (targets.length === 0) {
  const where = args.length === 0 ? "output/" : "the paths given";
  console.log(`Nothing to lint in ${where} (looking for .md, .txt, .markdown).`);
  process.exit(targets.missing ? 1 : 0);
}

let total = 0;
let dirty = 0;

for (const path of targets) {
  const findings = lintFile(path);
  if (findings.length === 0) continue;
  dirty++;
  total += findings.length;
  console.log(displayPath(path));
  for (const f of findings) {
    const where = `${f.line}:${f.col}`.padEnd(9);
    console.log(`  ${where}${f.rule.padEnd(11)}${f.hint}`);
    console.log(`  ${" ".repeat(9)}> ${f.excerpt}`);
  }
  console.log("");
}

if (total === 0) {
  console.log(`Clean: no guardrail violations in ${targets.length} file(s).`);
  process.exit(targets.missing ? 1 : 0);
}

const noun = total === 1 ? "violation" : "violations";
console.error(
  `${total} ${noun} in ${dirty} of ${targets.length} file(s). Fix these before printing the draft.`
);
process.exit(1);
