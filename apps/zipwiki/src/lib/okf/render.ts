import {
  buildDocumentFrontmatter,
  relativeFromOkfRoot,
  relativeParseFromOkf,
} from "./yaml.js";
import {
  parseFrontmatterFields,
  repairOkfFrontmatter,
  splitFrontmatter,
} from "./frontmatter.js";
import type {
  BuildOkfBundleInput,
  OkfEnrichment,
  OkfFile,
  OkfPrimaryRef,
  OkfSourceRef,
} from "./types.js";

export const OKF_VERSION = "0.2" as const;
/**
 * Legacy package-level concept filename. Prefer `{stem}.md` (parse-as-concept)
 * via {@link conceptFileNameFor}.
 */
export const OKF_DOCUMENT_NAME = "document.md" as const;
/** Bundle-root index (OKF §8); ZipWiki emits this with `okf_version`. */
export const OKF_INDEX_NAME = "index.md" as const;
/** Optional reserved name (OKF §9). Append-only change history, never a concept. */
export const OKF_LOG_NAME = "log.md" as const;
/** Cross-document pages live under `wiki/okf/topics/`. */
export const OKF_TOPICS_DIR = "topics" as const;
/** Cap shared topic pages so the catalog stays short. */
export const TOPIC_PAGE_CAP = 8 as const;

/** One entry in a generated OKF `index.md` Files section. */
export type OkfIndexEntry = {
  /** Relative href from the index (e.g. `apple-10k.md`). */
  href: string;
  title: string;
  description?: string;
};

/** Escape text used inside Markdown link labels. */
function escapeMdLinkLabel(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * Render a bundle-root `index.md` (OKF §8 / §12).
 * Carries `okf_version: "0.2"` and a `# Files` listing of concept pages.
 */
function renderIndexBullets(entries: OkfIndexEntry[]): string[] {
  const sorted = [...entries].sort((a, b) =>
    a.href.localeCompare(b.href, "en"),
  );
  if (sorted.length === 0) return ["* *(none)*"];
  return sorted.map((e) => {
    const label = escapeMdLinkLabel(e.title.trim() || e.href);
    const href = e.href.replace(/\\/g, "/");
    const desc = e.description?.trim();
    return desc
      ? `* [${label}](${href}) - ${desc}`
      : `* [${label}](${href})`;
  });
}

export function renderOkfIndex(
  entries: OkfIndexEntry[],
  topics: OkfIndexEntry[] = [],
): string {
  const lines: string[] = [
    "---",
    `okf_version: "${OKF_VERSION}"`,
    "---",
    "",
    "# Files",
    "",
    ...renderIndexBullets(entries),
    "",
  ];
  if (topics.length > 0) {
    lines.push("# Topics", "", ...renderIndexBullets(topics), "");
  }
  return lines.join("\n");
}

/**
 * Read title / description from an OKF concept markdown string for index rows.
 */
export function indexEntryFromConceptMarkdown(
  href: string,
  markdown: string,
): OkfIndexEntry {
  const split = splitFrontmatter(markdown);
  const fields = split.frontmatter
    ? parseFrontmatterFields(split.frontmatter)
    : {};
  const stem = href.replace(/\.md$/i, "");
  return {
    href,
    title: fields.title?.trim() || stem,
    ...(fields.description?.trim()
      ? { description: fields.description.trim() }
      : {}),
  };
}

/** Concept filename for a primary (e.g. `report.pdf` → `report.md`). */
export function conceptFileNameFor(primaryPath: string): string {
  const base = primaryPath.replace(/\\/g, "/").split("/").pop() ?? primaryPath;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem}.md`;
}

/** Map ZipWiki category / hints to default OKF concept type. */
export function defaultConceptType(
  documentType?: string,
  primaryPath?: string,
): string {
  const lower = (primaryPath ?? "").toLowerCase();
  if (/\.(xlsx|xls|csv)$/i.test(lower)) return "Spreadsheet";
  if (/\.(eml|msg)$/i.test(lower)) return "Communication";

  switch (documentType) {
    case "Financial_Report":
      return "Invoice";
    case "Receipt_Scan":
      return "Vendor Receipt";
    case "Legal_Contract":
      return "Contract";
    case "Technical_Doc":
      return "Technical Document";
    case "Generic":
      return "Document";
    default:
      return documentType?.trim() || "Document";
  }
}

/**
 * Strip a leading OKF/YAML frontmatter block if present so we can re-attach
 * code-owned frontmatter without nesting.
 */
export function stripLeadingFrontmatter(markdown: string): string {
  return splitFrontmatter(markdown).body.replace(/^\uFEFF/, "");
}

/** Normalize tag tokens: trim, lowercase, hyphenate, dedupe, cap at 12. */
export function normalizeOkfTags(
  tags: Iterable<string | undefined | null>,
  fallback: string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...tags, ...fallback]) {
    if (raw == null) continue;
    const n = String(raw)
      .trim()
      .toLowerCase()
      .replace(/[_/]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9.-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 12) break;
  }
  return out.length > 0 ? out : ["document"];
}

/** Deterministic tags when AI is off or enrichment omits them. */
export function fallbackTags(input: {
  type: string;
  documentType?: string;
  primaryPath?: string;
}): string[] {
  const seeds: string[] = [input.type];
  if (input.documentType) seeds.push(input.documentType);
  const lower = (input.primaryPath ?? "").toLowerCase();
  if (/\.(pdf)$/i.test(lower)) seeds.push("pdf");
  if (/\.(docx?|odt|rtf)$/i.test(lower)) seeds.push("word", "office");
  if (/\.(xlsx|xls|csv)$/i.test(lower)) seeds.push("spreadsheet");
  if (/\.(eml|msg)$/i.test(lower)) seeds.push("email");
  if (/\.(png|jpe?g|webp|tiff?|gif)$/i.test(lower)) seeds.push("image", "scan");
  if (/10[-_]?k|sec|edgar/i.test(lower)) seeds.push("sec-filing");
  if (/deed|contract|nda|agreement/i.test(lower)) seeds.push("legal");
  if (/invoice|receipt/i.test(lower)) seeds.push("finance");
  return normalizeOkfTags(seeds);
}

function cleanBullet(line: string, maxLen = 220): string | null {
  let s = line
    .replace(/^\uFEFF/, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^#+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s === "---" || s.startsWith("|") || s.startsWith("```")) return null;
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1).trimEnd()}…`;
  return s;
}

/**
 * Thin concept body for progressive disclosure (OKF §4.2-style headings).
 * Parse markdown stays under `parsed/` — this is only a skim map.
 */
export function renderConceptBody(enrichment: OkfEnrichment): string {
  const facts = (enrichment.keyFacts ?? [])
    .map((f) => cleanBullet(f))
    .filter((f): f is string => Boolean(f))
    .slice(0, 8);
  const contents = (enrichment.contents ?? [])
    .map((c) => cleanBullet(c))
    .filter((c): c is string => Boolean(c))
    .slice(0, 12);

  const parts: string[] = [];
  if (facts.length > 0) {
    parts.push("# Key facts", "", ...facts.map((f) => `- ${f}`), "");
  }
  if (contents.length > 0) {
    parts.push("# Contents", "", ...contents.map((c) => `- ${c}`), "");
  }
  return parts.length > 0 ? parts.join("\n") : "";
}

/**
 * @deprecated Prefer {@link renderConceptBody}. Kept for legacy tests.
 */
export function materializeBody(enrichment: OkfEnrichment): string {
  const rendered = renderConceptBody(enrichment);
  if (rendered) return rendered;
  const para =
    enrichment.bodyMarkdown?.trim() ||
    enrichment.description?.trim() ||
    enrichment.title.trim();
  const plain = para
    .replace(/^#+\s+/gm, "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("|") && l !== "---")
    .join(" ");
  return `${plain.slice(0, 800).trim()}\n`;
}

export function fallbackEnrichment(input: BuildOkfBundleInput): OkfEnrichment {
  const primary = input.primaries[0];
  const title =
    input.title?.trim() ||
    primary?.path.split("/").pop() ||
    "Document";
  const description =
    input.digest?.trim() ||
    (input.primaries.length === 1
      ? `Summary of ${primary?.path ?? "content"}.`
      : `Bundle of ${input.primaries.length} documents.`);
  const type = defaultConceptType(
    input.documentType ?? primary?.documentType,
    primary?.path,
  );
  return {
    title,
    description: description.slice(0, 240),
    type,
    tags: fallbackTags({
      type,
      documentType: input.documentType ?? primary?.documentType,
      primaryPath: primary?.path,
    }),
  };
}

function sourcesFor(
  primaries: OkfPrimaryRef[],
  overrides?: OkfSourceRef[],
): OkfSourceRef[] {
  if (overrides && overrides.length > 0) return overrides;
  const sources: OkfSourceRef[] = [];
  for (const p of primaries) {
    sources.push({
      resource: relativeFromOkfRoot(p.path),
      description: p.contentSha256
        ? `Primary content in this package (sha256:${p.contentSha256.slice(0, 16)}…)`
        : `Primary content in this package (${p.path})`,
    });
    sources.push({
      resource: relativeParseFromOkf(p.path),
      description: `Parsed markdown in this package (${p.path})`,
    });
  }
  return sources;
}

/**
 * Render OKF concept file(s) — frontmatter + optional thin body (`# Key facts` /
 * `# Contents`) — plus a bundle-root `index.md`. Full parse stays under
 * `parsed/`. `log.md` is omitted.
 */
export function renderOkfFiles(input: {
  enrichment: OkfEnrichment;
  primaries: OkfPrimaryRef[];
  generatedBy: string;
  generatedAt: string;
  /** Override code-owned sources. */
  sources?: OkfSourceRef[];
  /** Output filename under okf/ (default: `document.md` for packages). */
  conceptFileName?: string;
  /** When false, skip emitting `index.md` (default true). */
  includeIndex?: boolean;
  /** @deprecated Ignored — body comes from enrichment.keyFacts / contents. */
  conceptBody?: string;
  /** @deprecated Ignored. */
  logAction?: string;
}): OkfFile[] {
  const { enrichment, primaries, generatedBy, generatedAt } = input;
  const sources = sourcesFor(primaries, input.sources);

  const fileName = input.conceptFileName ?? OKF_DOCUMENT_NAME;
  const tags = normalizeOkfTags(
    enrichment.tags ?? [],
    fallbackTags({
      type: enrichment.type,
      documentType: primaries[0]?.documentType,
      primaryPath: primaries[0]?.path,
    }),
  );
  const body = renderConceptBody({ ...enrichment, tags });

  let documentMd = [
    buildDocumentFrontmatter({
      type: enrichment.type,
      title: enrichment.title,
      description: enrichment.description,
      tags,
      generatedBy,
      generatedAt,
      sources,
    }),
    body ? `\n${body}` : "",
  ].join("\n");

  // Ensure a trailing newline after frontmatter when body is empty.
  if (!body && !documentMd.endsWith("\n")) {
    documentMd += "\n";
  }

  const repaired = repairOkfFrontmatter(documentMd, {
    type: enrichment.type,
  });
  documentMd = repaired.markdown;

  const files: OkfFile[] = [{ name: fileName, data: documentMd }];
  if (input.includeIndex !== false && fileName !== OKF_INDEX_NAME) {
    files.push({
      name: OKF_INDEX_NAME,
      data: renderOkfIndex([
        indexEntryFromConceptMarkdown(fileName, documentMd),
      ]),
    });
  }
  return files;
}

/** Extract `type:` from concept frontmatter for lightweight conformance checks. */
export function extractFrontmatterType(markdown: string): string | null {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) {
    return null;
  }
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) return null;
  const block = markdown.slice(4, end);
  const m = /^type:\s*(.+)$/m.exec(block);
  if (!m) return null;
  let v = m[1]!.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v || null;
}
