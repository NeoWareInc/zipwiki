#!/usr/bin/env bash
# Pack one small document with local LiteParse and ZipWiki-token OKF.
# OKF must go through the Fly API so the server's Claude key is used.
# Fails unless the manifest records liteparse and the concept page is hosted
# AI enrichment (not the deterministic fallback, and not a local LLM key).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

src="knowledge/test1/gettysburg-address.odt"
stage="knowledge/.stage/okf-tokens"
out="knowledge/.output/okf-tokens/gettysburg-address.zipwiki"

if [[ ! -f "$src" ]]; then
  echo "Missing fixture: $src" >&2
  exit 1
fi

# A local Claude key must not satisfy this run.
unset ANTHROPIC_API_KEY OPENAI_API_KEY GEMINI_API_KEY \
  GOOGLE_GENERATIVE_AI_API_KEY OPENROUTER_API_KEY \
  OPENAI_COMPATIBLE_API_KEY AI_GATEWAY_API_KEY

rm -rf "$stage"
mkdir -p "$(dirname "$out")"

echo "Packing $src"
echo "  parse: local LiteParse"
echo "  OKF:   ZipWiki API (Fly server Claude key)"
echo

pnpm zipwiki -- pack "$src" \
  -o "$out" \
  --parser liteparse \
  --parser-mode fixed \
  --parse-credential local \
  --remote-okf \
  --stage-dir "$stage" \
  -y -sf -T

node --input-type=module - "$stage" "$out" <<'EOF'
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const stage = process.argv[2];
const archive = process.argv[3];
const manifestPath = join(stage, "META-INF", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const engine = manifest?.ai?.parser?.engine;
if (engine !== "liteparse") {
  console.error(`Expected ai.parser.engine "liteparse", got ${JSON.stringify(engine)}`);
  process.exit(1);
}

const parsedDir = join(stage, "wiki", "parsed");
const parsed = readdirSync(parsedDir).filter((name) => name.endsWith(".md"));
if (parsed.length === 0) {
  console.error(`No parsed markdown in ${parsedDir}`);
  process.exit(1);
}
for (const name of parsed) {
  const bytes = statSync(join(parsedDir, name)).size;
  if (bytes < 20) {
    console.error(`Parsed file is empty: ${name}`);
    process.exit(1);
  }
}

const okfDir = join(stage, "wiki", "okf");
const concepts = readdirSync(okfDir).filter(
  (name) => name.endsWith(".md") && name !== "index.md" && name !== "log.md",
);
if (concepts.length === 0) {
  console.error(`No OKF concept page in ${okfDir}`);
  process.exit(1);
}

let failed = false;
for (const name of concepts) {
  const text = readFileSync(join(okfDir, name), "utf8");
  const generated = text.match(/generated:\s*\{[^}]*by:\s*("[^"]*"|'[^']*'|[^,}\s]+)/);
  const by = generated?.[1]?.replace(/^["']|["']$/g, "") ?? "";
  console.log(`\n--- ${name} ---`);
  console.log(text.trim());
  console.log("---");
  if (!by || by.includes("zipwiki-okf-fallback") || !by.startsWith("zipwiki-api/")) {
    console.error(
      `OKF ${name} did not use the ZipWiki API (${by || "missing generated.by"}). Hosted Claude on Fly did not run.`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);

const archiveBytes = statSync(archive).size;
console.log(
  `\nOK  parser=liteparse  concepts=${concepts.join(", ")}  archive=${archive} (${archiveBytes} bytes)`,
);
EOF
