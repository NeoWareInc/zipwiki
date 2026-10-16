/**
 * Loads the OKF rules in this directory. `package.md` covers every package.
 * Each file in `types/` is one data type.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter } from "../frontmatter.js";

export type OkfCatalogRules = {
  minimumCards: number;
  pageCap: number;
  omitTags: string[];
  omitSingleFilenameFamily: boolean;
};

export type OkfFallbackTagRule = {
  pattern: RegExp;
  tags: string[];
};

export type OkfTypeRule = {
  id: string;
  okfType: string;
  /** `*.ext` matches a filename under auto. Empty means flag-only. */
  match?: string;
  sample: "edges" | "prefix";
  typeRule: string;
  keyFacts: string;
  citeSample: boolean;
  /** Instruction paragraph, or the generic type-mapping block. */
  body: string;
};

export type OkfRules = {
  prompt: string;
  /** Rule lines, including the `{{type}}`, `{{keyFacts}}`, and `{{invent}}` markers. */
  ruleLines: string[];
  inventLine: string;
  catalog: OkfCatalogRules;
  fallbackTags: OkfFallbackTagRule[];
  types: OkfTypeRule[];
};

const PREFERRED_ORDER = ["book", "legislation", "invoice", "earnings", "generic"];

let cached: OkfRules | undefined;

export function okfRulesDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function loadOkfRules(): OkfRules {
  if (!cached) cached = readOkfRules(okfRulesDir());
  return cached;
}

export function topicPageCap(): number {
  return loadOkfRules().catalog.pageCap;
}

export function okfTypeById(id: string): OkfTypeRule | undefined {
  return loadOkfRules().types.find((type) => type.id === id);
}

/** `--okf-profile` names. `generic` stays the default and is not a flag. */
export function okfProfileFlagIds(): string[] {
  return loadOkfRules()
    .types.map((type) => type.id)
    .filter((id) => id !== "generic");
}

export function typeMatchesFile(type: OkfTypeRule, fileName: string): boolean {
  const raw = type.match?.trim().toLowerCase();
  if (!raw) return false;
  const name = fileName.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  return raw.split(",").some((pattern) => globMatch(pattern.trim(), name));
}

/** `*` is a wildcard. Used by `match` in a type file. */
function globMatch(pattern: string, name: string): boolean {
  if (!pattern) return false;
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").split("*").join(".*");
  return new RegExp(`^${source}$`).test(name);
}

function readOkfRules(dir: string): OkfRules {
  const packagePath = join(dir, "package.md");
  const raw = readFileSync(packagePath, "utf8");
  const sections = markdownSections(raw);
  const prompt = requiredSection(sections, "prompt", packagePath);
  const ruleLines = sectionLines(requiredSection(sections, "rules", packagePath));
  const inventLines = sectionLines(requiredSection(sections, "invent", packagePath));
  const inventLine = inventLines.find((line) => line.startsWith("- "));
  if (!inventLine) {
    throw new Error(`${packagePath} ## Invent needs one "- " rule`);
  }
  const catalog = parseCatalog(
    jsonBlock(requiredSection(sections, "catalog", packagePath), packagePath),
  );
  const fallbackTags = parseFallback(
    jsonBlock(requiredSection(sections, "fallback tags", packagePath), packagePath),
    packagePath,
  );
  const types = readTypes(join(dir, "types"));
  if (!types.some((type) => type.id === "generic")) {
    throw new Error(`${join(dir, "types")} is missing generic.md`);
  }
  return { prompt, ruleLines, inventLine, catalog, fallbackTags, types };
}

function readTypes(dir: string): OkfTypeRule[] {
  const names = readdirSync(dir).filter((name) => name.endsWith(".md"));
  const types = names.map((name) => readType(join(dir, name)));
  types.sort((a, b) => {
    const ia = PREFERRED_ORDER.indexOf(a.id);
    const ib = PREFERRED_ORDER.indexOf(b.id);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.id.localeCompare(b.id);
  });
  return types;
}

function readType(path: string): OkfTypeRule {
  const { frontmatter, body } = splitFrontmatter(readFileSync(path, "utf8"));
  if (!frontmatter) throw new Error(`${path} needs frontmatter`);
  const fields = flatFields(frontmatter);
  const id = fields.id?.trim();
  const okfType = fields.okftype?.trim();
  const typeRule = fields.typerule?.trim();
  const keyFacts = fields.keyfacts?.trim();
  if (!id || !okfType || !typeRule || !keyFacts) {
    throw new Error(`${path} needs id, okfType, typeRule, and keyFacts`);
  }
  const sample = fields.sample?.trim().toLowerCase() === "edges" ? "edges" : "prefix";
  return {
    id,
    okfType,
    ...(fields.match?.trim() ? { match: fields.match.trim() } : {}),
    sample,
    typeRule,
    keyFacts,
    citeSample: fields.citesample?.trim().toLowerCase() === "true",
    body: body.trim(),
  };
}

function flatFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    fields[kv[1]!.toLowerCase()] = unquote(kv[2]!);
  }
  return fields;
}

function unquote(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function markdownSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = markdown.replace(/^\uFEFF/, "").split(/^## /m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const title = (nl < 0 ? part : part.slice(0, nl)).trim().toLowerCase();
    const content = (nl < 0 ? "" : part.slice(nl + 1)).trim();
    sections.set(title, content);
  }
  return sections;
}

function requiredSection(
  sections: Map<string, string>,
  title: string,
  path: string,
): string {
  const body = sections.get(title);
  if (!body) throw new Error(`${path} is missing ## ${title}`);
  return body;
}

function sectionLines(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith("```"));
}

function jsonBlock(section: string, path: string): unknown {
  const fenced = /```json\s*([\s\S]*?)```/.exec(section);
  if (!fenced) throw new Error(`${path} is missing a json block`);
  return JSON.parse(fenced[1]!) as unknown;
}

function parseCatalog(value: unknown): OkfCatalogRules {
  const row = record(value);
  const minimumCards = numberField(row, "minimumCards");
  const pageCap = numberField(row, "pageCap");
  const omitTags = stringList(row.omitTags);
  const omitSingleFilenameFamily = row.omitSingleFilenameFamily === true;
  if (minimumCards < 1 || pageCap < 1 || omitTags.length === 0) {
    throw new Error("OKF catalog needs minimumCards, pageCap, and omitTags");
  }
  return { minimumCards, pageCap, omitTags, omitSingleFilenameFamily };
}

function parseFallback(value: unknown, path: string): OkfFallbackTagRule[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} fallback tags must be a list`);
  }
  return value.map((item) => {
    const row = record(item);
    const pattern = typeof row.pattern === "string" ? row.pattern : "";
    const tags = stringList(row.tags);
    if (!pattern || tags.length === 0) {
      throw new Error(`${path} fallback tag needs pattern and tags`);
    }
    return { pattern: new RegExp(pattern, "i"), tags };
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OKF rules JSON must be an object");
  }
  return value as Record<string, unknown>;
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}
