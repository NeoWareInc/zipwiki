/**
 * Pack one entry from projects.json.
 *
 * The catalog index (index.txt) is read for Gutenberg ids and is excluded
 * from the .zipwiki. Origin sidecars are written beside each EPUB for the
 * pack, then removed.
 *
 * Usage: node scripts/archive-project.mjs charles-dickens
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectsPath = join(repoRoot, "projects.json");

function expandHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function loadProject(id) {
  const doc = JSON.parse(readFileSync(projectsPath, "utf8"));
  const project = (doc.projects ?? []).find((item) => item.id === id);
  if (!project) {
    const ids = (doc.projects ?? []).map((item) => item.id).join(", ");
    throw new Error(`Unknown project "${id}". Known: ${ids || "(none)"}`);
  }
  return project;
}

function parseCatalog(text) {
  const books = [];
  let file = "";
  for (const line of text.split(/\r?\n/)) {
    const fileMatch = /^\s*File:\s*(.+)$/.exec(line);
    if (fileMatch) {
      file = basename(fileMatch[1].trim());
      continue;
    }
    const idMatch = /^\s*Gutenberg ID:\s*(\d+)/.exec(line);
    if (idMatch && file) {
      books.push({ file, id: idMatch[1] });
      file = "";
    }
  }
  return books;
}

function originUri(template, id) {
  return template.replaceAll("{id}", id);
}

const id = process.argv[2];
if (!id) {
  console.error("Usage: node scripts/archive-project.mjs <project-id>");
  process.exit(1);
}

const project = loadProject(id);
const source = resolve(expandHome(project.source));
const output = resolve(repoRoot, project.output);
const stageDir = resolve(repoRoot, project.stageDir);
const indexName = project.origins?.indexFile ?? "index.txt";
const indexPath = join(source, indexName);
if (!existsSync(indexPath)) {
  throw new Error(`Origin catalog not found: ${indexPath}`);
}

const books = parseCatalog(readFileSync(indexPath, "utf8"));
const template = project.origins?.urlTemplate;
if (!template || !template.includes("{id}")) {
  throw new Error(`${id} origins.urlTemplate must include {id}`);
}

const created = [];
const missing = [];
for (const book of books) {
  const epubPath = join(source, book.file);
  if (!existsSync(epubPath)) {
    missing.push(book.file);
    continue;
  }
  const sidecar = `${epubPath}.origin.json`;
  if (existsSync(sidecar)) continue;
  writeFileSync(
    sidecar,
    `${JSON.stringify({ uri: originUri(template, book.id) }, null, 2)}\n`,
  );
  created.push(sidecar);
}

if (missing.length > 0) {
  console.error(
    `[archive] ${missing.length} catalog files are not in ${source}:`,
  );
  for (const name of missing) console.error(`  ${name}`);
  process.exitCode = 1;
}

mkdirSync(dirname(output), { recursive: true });
mkdirSync(stageDir, { recursive: true });

const args = [
  "zipwiki",
  "--",
  "pack",
  source,
  "-r",
  "-o",
  output,
  "--stage-dir",
  stageDir,
];
if (project.omitOriginal) args.push("--omit-original");
for (const pattern of project.include ?? []) args.push("--include", pattern);
for (const pattern of project.exclude ?? []) args.push("--exclude", pattern);
args.push("-sf", "-T");

console.error(
  `[archive] ${id}: ${created.length} origins from ${indexName} (excluded from the package)`,
);
console.error(`[archive] output ${project.output}`);

let status = 1;
try {
  const child = spawnSync("pnpm", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  status = child.status ?? 1;
} finally {
  for (const sidecar of created) {
    try {
      unlinkSync(sidecar);
    } catch {
      /* already gone */
    }
  }
}
process.exit(status);
