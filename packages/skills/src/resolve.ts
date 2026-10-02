import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skillBodiesText, skillDocFromMarkdown } from "./parse.js";
import {
  DEFAULT_SKILL_TEXT_CAP,
  PACKAGE_SKILLS_DIR,
  type SkillDoc,
  type SkillKind,
} from "./types.js";

const BUILTIN_FILES: Record<SkillKind, string> = {
  enrichment: "okf-enrichment.md",
  query: "query-knowledge-archive.md",
};

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function builtinSkillsDir(): string {
  return join(packageRoot(), "skills");
}

function readSkillFile(
  absPath: string,
  preferKind?: SkillKind,
): SkillDoc | null {
  try {
    const markdown = readFileSync(absPath, "utf8");
    return skillDocFromMarkdown(markdown, absPath, preferKind);
  } catch {
    return null;
  }
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => join(dir, name))
    .sort();
}

/** Built-in ZipWiki skills for enrichment or query (always available). */
export function loadBuiltInSkills(kind: SkillKind): SkillDoc[] {
  const file = join(builtinSkillsDir(), BUILTIN_FILES[kind]);
  const doc = readSkillFile(file, kind);
  return doc ? [doc] : [];
}

/**
 * Load skills from a file or directory. Used as a **replacement** for built-ins
 * when `--skills` is set. Filters to `kind` via frontmatter or filename.
 */
export function loadSkillsFromPath(
  skillsPath: string,
  kind: SkillKind,
): SkillDoc[] {
  const abs = resolve(skillsPath);
  if (!existsSync(abs)) {
    throw new Error(`Skills path not found: ${abs}`);
  }
  const st = statSync(abs);
  if (st.isFile()) {
    const doc = readSkillFile(abs, kind);
    if (!doc) {
      throw new Error(
        `No ${kind} skill found in ${abs} (set frontmatter kind: ${kind})`,
      );
    }
    return [doc];
  }
  if (!st.isDirectory()) {
    throw new Error(`Skills path is not a file or directory: ${abs}`);
  }
  const docs = listMarkdownFiles(abs)
    .map((p) => readSkillFile(p))
    .filter((d): d is SkillDoc => d != null && d.kind === kind);
  if (docs.length === 0) {
    throw new Error(
      `No ${kind} skill markdown found in ${abs} (kind: ${kind} in frontmatter)`,
    );
  }
  return docs;
}

export type PackageSkillSource = {
  path: string;
  markdown: string;
};

/** Parse skill docs from package entry payloads (`wiki/skills/*.md`). */
export function loadPackageSkillsFromEntries(
  entries: PackageSkillSource[],
  aiRoot = "wiki",
): SkillDoc[] {
  const prefix = `${aiRoot.replace(/\/+$/, "")}/${PACKAGE_SKILLS_DIR}/`;
  const docs: SkillDoc[] = [];
  for (const entry of entries) {
    const name = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name.startsWith(prefix) || !name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const doc = skillDocFromMarkdown(entry.markdown, name);
    if (doc) docs.push(doc);
  }
  return docs.sort((a, b) => a.path.localeCompare(b.path));
}

export type ResolveSkillsInput = {
  kind: SkillKind;
  /** When set, **replaces** built-in skills for this kind. */
  skillsPath?: string | null;
  /** Additive skills from inside the archive. */
  packageSkills?: SkillDoc[];
  textCap?: number;
};

export type ResolvedSkills = {
  base: SkillDoc[];
  package: SkillDoc[];
  all: SkillDoc[];
  replaced: boolean;
  text: string;
};

/**
 * Resolve skills for enrichment or query.
 * Base = built-in, or `--skills` replacement. Package skills always append.
 */
export function resolveSkills(input: ResolveSkillsInput): ResolvedSkills {
  const replaced = Boolean(input.skillsPath?.trim());
  const base = replaced
    ? loadSkillsFromPath(input.skillsPath!.trim(), input.kind)
    : loadBuiltInSkills(input.kind);
  const packageSkills = input.packageSkills ?? [];
  const all = [...base, ...packageSkills];
  return {
    base,
    package: packageSkills,
    all,
    replaced,
    text: skillBodiesText(all, input.textCap ?? DEFAULT_SKILL_TEXT_CAP),
  };
}

export function packageSkillsZipPrefix(aiRoot = "wiki"): string {
  return `${aiRoot.replace(/\/+$/, "")}/${PACKAGE_SKILLS_DIR}/`;
}

/** True when a ZIP entry path is under wiki/skills/ (not an OKF concept). */
export function isPackageSkillPath(entryPath: string, aiRoot = "wiki"): boolean {
  const name = entryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return name.startsWith(packageSkillsZipPrefix(aiRoot));
}
