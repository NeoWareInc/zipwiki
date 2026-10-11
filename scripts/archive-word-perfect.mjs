/**
 * Fetch xberg-io/test_documents WordPerfect fixtures (if needed) and pack
 * knowledge/word-perfect.zipwiki.
 *
 * - Sources: ~/Documents/xberg-test-documents/wordperfect/*.wp|*.wpd
 * - Origins from README-ORIGINS.md (GitHub blob URLs at pinned commit)
 * - Ground truth stays on disk under ground_truth/wordperfect/ (not packed)
 * - Defaults: --omit-original, llamaparse (quick), AI OKF, -sf -T
 *   LlamaParse lists `.wpd` as supported; `.wp` (WP 4.2/5.x) is not in their
 *   public format list and may fail or soft-fall back.
 *
 * Usage:
 *   node scripts/archive-word-perfect.mjs
 *   node scripts/archive-word-perfect.mjs --fetch-only
 *   node scripts/archive-word-perfect.mjs --force-fetch
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchWordPerfectSlice,
  XBERG_DEFAULT_ROOT,
} from "./lib/xberg-test-documents.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(repoRoot, "knowledge", "word-perfect.zipwiki");
const stageDir = join(repoRoot, "knowledge", ".stage", "word-perfect");

const argv = new Set(process.argv.slice(2));
const fetchOnly = argv.has("--fetch-only");
const forceFetch = argv.has("--force-fetch");

/** @returns {Map<string, string>} */
function parseOriginsMd(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m =
      /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*\[([^\]]*)\]\(([^)]+)\)\s*\|/.exec(
        line,
      );
    if (!m) continue;
    const name = m[1];
    const uri = m[4].trim();
    if (name && uri.startsWith("http")) map.set(name, uri);
  }
  return map;
}

function isPackFile(name) {
  if (name.startsWith("README")) return false;
  if (name === "PROVENANCE.md" || name === ".DS_Store") return false;
  if (name.endsWith(".origin.json") || name.endsWith(".url")) return false;
  return /\.(wp|wpd)$/i.test(name);
}

console.error("[archive] fetching xberg WordPerfect slice…");
const fetched = await fetchWordPerfectSlice({ force: forceFetch });
console.error(
  `[archive] pin ${fetched.sha.slice(0, 12)} · docs ${fetched.docs.length} · GT ${fetched.groundTruthCount} · downloaded ${fetched.downloaded} skipped ${fetched.skipped}`,
);
console.error(`[archive] docs ${fetched.docsDir}`);
console.error(`[archive] ground truth ${fetched.gtDir}`);

if (fetchOnly) {
  process.exit(0);
}

const docsDir = fetched.docsDir;
const originsMdPath = join(docsDir, "README-ORIGINS.md");
if (!existsSync(originsMdPath)) {
  console.error(`[archive] missing ${originsMdPath}`);
  process.exit(1);
}

const origins = parseOriginsMd(readFileSync(originsMdPath, "utf8"));
const samples = readdirSync(docsDir).filter(isPackFile);
const missingOrigin = samples.filter((name) => !origins.has(name));
if (missingOrigin.length > 0) {
  console.error(`[archive] no origin for: ${missingOrigin.join(", ")}`);
  process.exit(1);
}

const created = [];
for (const name of samples) {
  const sidecar = join(docsDir, `${name}.origin.json`);
  writeFileSync(
    sidecar,
    `${JSON.stringify({ uri: origins.get(name) }, null, 2)}\n`,
  );
  created.push(sidecar);
}

mkdirSync(dirname(output), { recursive: true });
mkdirSync(stageDir, { recursive: true });

const args = [
  "zipwiki",
  "--",
  "pack",
  docsDir,
  "-r",
  "-o",
  output,
  "--stage-dir",
  stageDir,
  "--omit-original",
  "--parser",
  "llamaparse",
  "--llama-tier",
  "quick",
  "--include",
  "*.wp",
  "--include",
  "*.wpd",
  "--exclude",
  "README*",
  "--exclude",
  "PROVENANCE.md",
  "--exclude",
  ".DS_Store",
  "--exclude",
  "*.origin.json",
  "--exclude",
  "*.url",
  "--exclude",
  "*.wpg",
  "-sf",
  "-T",
];

console.error(
  `[archive] word-perfect: ${created.length} origins · omit originals · llamaparse/quick · AI OKF`,
);
console.error(
  `[archive] LlamaParse documents .wpd; .wp (WP 4.2/5.x) is not listed — watch parse errors`,
);
console.error(`[archive] output knowledge/word-perfect.zipwiki`);
console.error(
  `[archive] ground truth left at ${join(XBERG_DEFAULT_ROOT, "ground_truth", "wordperfect")} for accuracy checks`,
);

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
      /* ignore */
    }
  }
}
process.exit(status);
