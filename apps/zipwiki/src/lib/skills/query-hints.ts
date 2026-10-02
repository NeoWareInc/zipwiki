/**
 * Generate and collect package skill files under wiki/skills/.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_SKILLS_DIR } from "@zipwiki/skills";

const QUERY_HINTS_NAME = "query-hints.md";

export type QueryHintsInput = {
  /** Package-level digest / summary. */
  digest?: string;
  /** Short titles or primary paths for tip bullets. */
  documents?: Array<{ path: string; title?: string; type?: string }>;
};

/** Markdown for `wiki/skills/query-hints.md` (archive-specific query tips). */
export function renderQueryHintsMarkdown(input: QueryHintsInput): string {
  const docs = input.documents ?? [];
  const bullets =
    docs.length > 0
      ? docs
          .slice(0, 24)
          .map((d) => {
            const label = d.title?.trim() || d.path;
            const type = d.type?.trim() ? ` (${d.type})` : "";
            return `- ${label}${type} — search for key terms from this document; then read its OKF card before the full parse.`;
          })
          .join("\n")
      : "- Prefer `search` over listing every concept.\n- Read OKF cards before full parses.\n- Use `origin` when you need the authentic original bytes.";

  const digestLine = input.digest?.trim()
    ? `\nPackage digest: ${input.digest.trim().slice(0, 240)}\n`
    : "\n";

  return [
    "---",
    "name: query-hints",
    "description: Archive-specific tips for querying this Knowledge Archive",
    "kind: query",
    'version: "1"',
    "---",
    "",
    "# Query hints for this package",
    digestLine,
    "Use the ZipWiki open sequence: open → search → read_okf → read_parsed → origin.",
    "",
    "## Documents in this archive",
    "",
    bullets,
    "",
  ].join("\n");
}

/** Write `query-hints.md` into `{stageDir}/{aiRoot}/skills/` without overwriting other skills. */
export function writeQueryHintsToStage(
  stageDir: string,
  input: QueryHintsInput,
  aiRoot = "wiki",
): string {
  const skillsDir = join(stageDir, aiRoot, PACKAGE_SKILLS_DIR);
  mkdirSync(skillsDir, { recursive: true });
  const out = join(skillsDir, QUERY_HINTS_NAME);
  writeFileSync(out, renderQueryHintsMarkdown(input), "utf-8");
  return out;
}

/** Collect `*.md` under `{stageDir}/{aiRoot}/skills/` for packing. */
export function collectStageSkillFiles(
  stageDir: string,
  aiRoot = "wiki",
): Array<{ name: string; data: string }> {
  const skillsDir = join(stageDir, aiRoot, PACKAGE_SKILLS_DIR);
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .sort()
    .map((name) => ({
      name,
      data: readFileSync(join(skillsDir, name), "utf-8"),
    }));
}

export { QUERY_HINTS_NAME };
