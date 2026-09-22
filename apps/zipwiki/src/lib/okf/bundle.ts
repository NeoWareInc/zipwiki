/**
 * OKF catalog maintenance: topic pages, the append-only log, and the index.
 * Run this whenever concepts are written so add/delete cannot leave a stale catalog.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatterFields, splitFrontmatter } from "./frontmatter.js";
import {
  indexEntryFromConceptMarkdown,
  OKF_INDEX_NAME,
  OKF_LOG_NAME,
  OKF_TOPICS_DIR,
  renderOkfIndex,
  TOPIC_PAGE_CAP,
  type OkfIndexEntry,
} from "./render.js";
import { buildWikiSearchIndex, serializeWikiSearchIndex } from "./search-index.js";
import { buildDocumentFrontmatter } from "./yaml.js";

export type OkfMarkdownFile = {
  /** Path relative to `wiki/okf/`, e.g. `lease.md` or `topics/warehouse.md`. */
  href: string;
  markdown: string;
};

export function isReservedOkfHref(href: string): boolean {
  const name = href.replace(/\\/g, "/").split("/").pop() ?? href;
  return name === OKF_INDEX_NAME || name === OKF_LOG_NAME;
}

export function isTopicHref(href: string): boolean {
  return href.replace(/\\/g, "/").startsWith(`${OKF_TOPICS_DIR}/`);
}

/** Per-file concept cards. Topic pages and reserved names are excluded. */
export function conceptFiles(files: OkfMarkdownFile[]): OkfMarkdownFile[] {
  return files.filter(
    (f) => f.href.endsWith(".md") && !isReservedOkfHref(f.href) && !isTopicHref(f.href),
  );
}

function tagsOf(markdown: string): string[] {
  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) return [];
  const fields = parseFrontmatterFields(frontmatter);
  return Array.isArray(fields.tags) ? fields.tags.map(String) : [];
}

function sourcesOf(markdown: string): Array<{ resource: string; description?: string }> {
  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) return [];
  const fields = parseFrontmatterFields(frontmatter);
  if (!fields.sources?.length) return [];
  return fields.sources
    .map((s) => {
      const resource = s.resource?.trim();
      if (!resource) return null;
      return {
        resource,
        ...(s.description ? { description: s.description } : {}),
      };
    })
    .filter((s): s is { resource: string; description?: string } => Boolean(s));
}

function titleOf(href: string, markdown: string): string {
  return indexEntryFromConceptMarkdown(href, markdown).title;
}

/**
 * Shared tags that appear on at least two concept cards become topic pages.
 * Capped so the first read of the index stays short.
 */
export function buildTopicFiles(
  concepts: OkfMarkdownFile[],
  generatedAt: string,
): OkfMarkdownFile[] {
  const byTag = new Map<string, OkfMarkdownFile[]>();
  for (const concept of concepts) {
    for (const tag of tagsOf(concept.markdown)) {
      const list = byTag.get(tag) ?? [];
      list.push(concept);
      byTag.set(tag, list);
    }
  }
  const shared = [...byTag.entries()]
    .filter(([, cards]) => cards.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, TOPIC_PAGE_CAP);

  const pages: OkfMarkdownFile[] = [];
  for (const [tag, cards] of shared) {
    const markdown = renderTopicMarkdown(tag, cards, generatedAt);
    if (!sourcesOf(markdown).length) continue;
    pages.push({ href: `${OKF_TOPICS_DIR}/${tag}.md`, markdown });
  }
  return pages;
}

function renderTopicMarkdown(
  tag: string,
  cards: OkfMarkdownFile[],
  generatedAt: string,
): string {
  const title = tag.replace(/-/g, " ");
  const sources: Array<{ resource: string; description?: string }> = [];
  const seen = new Set<string>();
  for (const card of cards) {
    for (const source of sourcesOf(card.markdown)) {
      if (seen.has(source.resource)) continue;
      seen.add(source.resource);
      sources.push(source);
    }
  }
  const front = buildDocumentFrontmatter({
    type: "Topic",
    title,
    description: `Concepts tagged ${tag}.`,
    tags: [tag],
    generatedBy: "process:zipwiki-okf-topics",
    generatedAt,
    sources,
  });
  const lines = cards.map((card) => {
    const label = titleOf(card.href, card.markdown);
    return `- [${label}](../${card.href})`;
  });
  return `${front}\n\n# Concepts\n\n${lines.join("\n")}\n`;
}

export function renderBundleIndex(
  concepts: OkfMarkdownFile[],
  topics: OkfMarkdownFile[],
): string {
  const toEntry = (file: OkfMarkdownFile): OkfIndexEntry =>
    indexEntryFromConceptMarkdown(file.href, file.markdown);
  return renderOkfIndex(concepts.map(toEntry), topics.map(toEntry));
}

export function logHeader(): string {
  return "# Log\n\n";
}

export function formatLogLine(input: {
  at?: string;
  action: "pack" | "add" | "update" | "del" | "enrich";
  primary: string;
  detail: string;
}): string {
  const at = input.at ?? new Date().toISOString();
  return `- ${at} ${input.action} ${input.primary} — ${input.detail}`;
}

/** Append lines. A missing file starts with the heading. Existing history is kept. */
export function appendLogMarkdown(
  existing: string | undefined,
  lines: string[],
): string {
  const body = lines.filter(Boolean);
  if (body.length === 0) {
    return existing?.trim() ? existing.replace(/\s*$/, "\n") : logHeader();
  }
  const base = existing?.trim() ? existing.replace(/\s*$/, "\n") : logHeader();
  const withHeader = base.includes("# Log") ? base : `${logHeader()}${base}`;
  return `${withHeader}${body.join("\n")}\n`;
}

/**
 * Resolve an OKF `sources[].resource` (relative to `wiki/okf/`) to a zip entry.
 * Absolute and URI resources are outside the package and are not checked.
 */
export function resolveOkfResource(
  okfRoot: string,
  resource: string,
): string | null {
  const raw = resource.replace(/\\/g, "/").trim();
  if (!raw || raw.includes("://") || raw.startsWith("/")) return null;
  const parts = okfRoot.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
  for (const seg of raw.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const resolved = parts.join("/");
  return resolved || null;
}

/** Zip entry paths cited by remaining OKF files that are not in the archive. */
export function danglingSourcePaths(
  okfRoot: string,
  files: OkfMarkdownFile[],
  entryNames: Set<string>,
  /** Primaries intentionally omitted from the package (`sourceIncluded: false`). */
  allowedMissing: Set<string> = new Set(),
): string[] {
  const missing: string[] = [];
  for (const file of files) {
    if (isReservedOkfHref(file.href)) continue;
    for (const source of sourcesOf(file.markdown)) {
      const resolved = resolveOkfResource(okfRoot, source.resource);
      if (!resolved || entryNames.has(resolved) || allowedMissing.has(resolved)) continue;
      missing.push(`${file.href} → ${resolved}`);
    }
  }
  return missing;
}

/** Rewrite topics, index, and a fresh pack log from the concept files on disk. */
export function finalizeOkfDirectory(okfDir: string, generatedAt = new Date().toISOString()): number {
  if (!existsSync(okfDir)) return 0;
  const concepts: OkfMarkdownFile[] = [];
  for (const name of readdirSync(okfDir).sort()) {
    if (!name.endsWith(".md")) continue;
    if (name === OKF_INDEX_NAME || name === OKF_LOG_NAME) continue;
    const path = join(okfDir, name);
    if (!statSync(path).isFile()) continue;
    concepts.push({ href: name, markdown: readFileSync(path, "utf-8") });
  }

  const topicsDir = join(okfDir, OKF_TOPICS_DIR);
  if (existsSync(topicsDir)) rmSync(topicsDir, { recursive: true, force: true });
  const topics = buildTopicFiles(concepts, generatedAt);
  if (topics.length > 0) mkdirSync(topicsDir, { recursive: true });
  for (const topic of topics) {
    writeFileSync(join(okfDir, topic.href), topic.markdown, "utf-8");
  }

  writeFileSync(
    join(okfDir, OKF_INDEX_NAME),
    renderBundleIndex(concepts, topics),
    "utf-8",
  );

  const logLines = concepts.map((concept) => {
    const { frontmatter } = splitFrontmatter(concept.markdown);
    const fields = frontmatter ? parseFrontmatterFields(frontmatter) : {};
    const by = fields.generated?.by?.trim() || "unknown";
    const mode = by.includes("fallback") ? "fallback" : "enriched";
    return formatLogLine({
      at: generatedAt,
      action: "pack",
      primary: concept.href.replace(/\.md$/i, ""),
      detail: `${concept.href} ${mode}`,
    });
  });
  const logPath = join(okfDir, OKF_LOG_NAME);
  const existingLog = existsSync(logPath) ? readFileSync(logPath, "utf-8") : undefined;
  writeFileSync(logPath, appendLogMarkdown(existingLog, logLines), "utf-8");
  return concepts.length;
}

export type OkfArchiveChange = {
  put: Array<{ name: string; data: string }>;
  delete: string[];
  /** `concept → missing zip entry` for in-package sources that are gone. */
  dangling: string[];
};

function searchIndexPath(okfRoot: string): string {
  return `${okfRoot.replace(/\\/g, "/").replace(/okf\/?$/, "")}search.json`.replace(
    /\/{2,}/g,
    "/",
  );
}

/**
 * Rebuild topic pages, `index.md`, and `wiki/search.json` from the concept
 * cards still in the archive, and append `log.md`. A topic with no sources
 * left is omitted. Call this before the archive is sealed.
 */
export function syncOkfArchive(input: {
  okfRoot: string;
  files: Array<{ name: string; data: string }>;
  entryNames: Iterable<string>;
  logLines?: string[];
  generatedAt?: string;
  /** Primaries stored outside the package. Citing them is not a missing member. */
  allowedMissing?: Iterable<string>;
}): OkfArchiveChange {
  const root = input.okfRoot.replace(/\\/g, "/").replace(/\/?$/, "/");
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const topicsPrefix = `${root}${OKF_TOPICS_DIR}/`;
  const concepts: OkfMarkdownFile[] = [];
  const existingTopics: string[] = [];
  let existingLog: string | undefined;
  for (const file of input.files) {
    const name = file.name.replace(/\\/g, "/");
    if (!name.startsWith(root) || !name.endsWith(".md")) continue;
    const href = name.slice(root.length);
    if (href === OKF_LOG_NAME) {
      existingLog = file.data;
      continue;
    }
    if (href === OKF_INDEX_NAME) continue;
    if (isTopicHref(href)) {
      existingTopics.push(name);
      continue;
    }
    if (href.includes("/")) continue;
    concepts.push({ href, markdown: file.data });
  }

  const topics = concepts.length > 0 ? buildTopicFiles(concepts, generatedAt) : [];
  const topicNames = new Set(topics.map((t) => `${root}${t.href}`));
  const put: Array<{ name: string; data: string }> = [];
  const del = new Set<string>();
  for (const name of existingTopics) {
    if (!topicNames.has(name)) del.add(name);
  }

  if (concepts.length > 0) {
    put.push({
      name: `${root}${OKF_INDEX_NAME}`,
      data: renderBundleIndex(concepts, topics),
    });
    for (const topic of topics) {
      put.push({ name: `${root}${topic.href}`, data: topic.markdown });
    }
    const search = buildWikiSearchIndex(
      [...concepts, ...topics].map((file) => ({
        name: `${root}${file.href}`,
        data: file.markdown,
      })),
      root,
    );
    put.push({
      name: searchIndexPath(root),
      data: serializeWikiSearchIndex(search),
    });
  } else {
    del.add(`${root}${OKF_INDEX_NAME}`);
    del.add(searchIndexPath(root));
  }

  const lines = input.logLines ?? [];
  if (lines.length > 0 || existingLog) {
    put.push({
      name: `${root}${OKF_LOG_NAME}`,
      data: appendLogMarkdown(existingLog, lines),
    });
  }

  const present = new Set(input.entryNames);
  for (const name of del) present.delete(name);
  for (const file of put) present.add(file.name);
  const dangling = danglingSourcePaths(
    root.replace(/\/$/, ""),
    [...concepts, ...topics],
    present,
    new Set(input.allowedMissing ?? []),
  );
  return { put, delete: [...del], dangling };
}
