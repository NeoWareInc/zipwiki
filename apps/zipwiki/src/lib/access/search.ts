import {
  BUNDLE_PATHS,
  listZipEntries,
  readZipEntryVerified,
  useZipHandle,
} from "../archive/index.js";
import {
  parseFrontmatterFields,
  parseWikiSearchIndex,
  scoreWikiSearchDoc,
  splitFrontmatter,
  tokenizeSearchQuery,
  wikiSearchDocBlob,
} from "../okf/index.js";
import { resolvePackagePath, rethrowAccess } from "./resolve.js";
import {
  readHintsForSearchHit,
  type CatalogReadHints,
} from "./catalog.js";

export type SearchScope = "okf" | "parsed" | "okf,parsed";

export type SearchHit = {
  score: number;
  kind: "okf" | "parsed";
  path: string;
  title?: string;
  snippet: string;
  sources?: string[];
  /** CLI / MCP next-step hints (`read --okf …` / `read --parsed …`). */
  readHints?: CatalogReadHints;
};

export type SearchResult = {
  package: string;
  query: string;
  hits: SearchHit[];
};

function scoreField(text: string | undefined, tokens: string[], weight: number): number {
  if (!text || tokens.length === 0) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += weight;
  }
  return score;
}

function snippetAround(text: string, tokens: string[], maxChars: number): string {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) {
    return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  }
  const start = Math.max(0, idx - Math.floor(maxChars / 3));
  let slice = text.slice(start, start + maxChars).replace(/\s+/g, " ").trim();
  if (start > 0) slice = `…${slice}`;
  if (start + maxChars < text.length) slice = `${slice}…`;
  return slice;
}

function sourcesFromFrontmatter(md: string): string[] | undefined {
  const { frontmatter } = splitFrontmatter(md);
  if (!frontmatter) return undefined;
  const fields = parseFrontmatterFields(frontmatter);
  const sources = fields.sources;
  if (!Array.isArray(sources) || sources.length === 0) return undefined;
  return sources
    .map((s) => (typeof s === "object" && s && "resource" in s ? String(s.resource) : null))
    .filter((x): x is string => Boolean(x));
}

function readEntryText(zipPath: string, entryName: string): string {
  try {
    return readZipEntryVerified(zipPath, entryName).data.toString("utf8");
  } catch (err) {
    rethrowAccess(err);
  }
}

function parseIndexHrefs(indexMd: string, okfRoot: string): Array<{
  path: string;
  title?: string;
  description?: string;
}> {
  const rows: Array<{ path: string; title?: string; description?: string }> = [];
  const re = /^\*\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*-\s*(.+))?$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexMd)) !== null) {
    const href = m[2]!.trim().replace(/^\.\//, "");
    const path = href.startsWith(okfRoot)
      ? href
      : `${okfRoot}${href.replace(/^\/+/, "")}`;
    rows.push({
      path,
      title: m[1]?.trim(),
      description: m[3]?.trim(),
    });
  }
  return rows;
}

function hitFromOkfMarkdown(
  path: string,
  md: string,
  tokens: string[],
  snippetChars: number,
): SearchHit | null {
  const { frontmatter, body } = splitFrontmatter(md);
  const fields = frontmatter
    ? parseFrontmatterFields(frontmatter)
    : ({} as ReturnType<typeof parseFrontmatterFields>);
  const title = fields.title ? String(fields.title) : undefined;
  const description = fields.description
    ? String(fields.description)
    : undefined;
  const type = fields.type ? String(fields.type) : undefined;
  const tags = Array.isArray(fields.tags)
    ? fields.tags.map(String).join(" ")
    : undefined;

  let score = 0;
  score += scoreField(title, tokens, 4);
  score += scoreField(tags, tokens, 3);
  score += scoreField(description, tokens, 2);
  score += scoreField(type, tokens, 1.5);
  score += scoreField(body, tokens, 0.5);
  if (score <= 0) return null;

  const blob = [title, description, tags, type, body].filter(Boolean).join("\n");
  return {
    score,
    kind: "okf",
    path,
    title,
    snippet: snippetAround(blob, tokens, snippetChars),
    sources: sourcesFromFrontmatter(md),
  };
}

/**
 * Ranked discovery over OKF concept cards (preferred) and optional parsed markdown.
 * Never returns full file bodies — only snippets.
 */
export function searchPackage(args: {
  package?: string;
  query: string;
  in?: SearchScope;
  limit?: number;
  snippetChars?: number;
}): SearchResult {
  const path = resolvePackagePath(args.package);
  const query = args.query?.trim();
  if (!query) {
    return { package: path, query: "", hits: [] };
  }
  return useZipHandle(path, () => searchPackageLoaded(path, args, query));
}

function searchPackageLoaded(
  path: string,
  args: {
    in?: SearchScope;
    limit?: number;
    snippetChars?: number;
  },
  query: string,
): SearchResult {
  const tokens = tokenizeSearchQuery(query);
  const scope = args.in ?? "okf,parsed";
  const wantOkf = scope.includes("okf");
  const wantParsed = scope.includes("parsed");
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
  const snippetChars = Math.min(Math.max(args.snippetChars ?? 240, 40), 2000);

  const entries = listZipEntries(path);
  const hits: SearchHit[] = [];
  const entryNames = new Set(entries.map((e) => e.name));

  if (wantOkf) {
    const catalogEntry = entries.find((e) => e.name === BUNDLE_PATHS.searchIndex);
    let usedCatalog = false;
    if (catalogEntry) {
      const raw = readEntryText(path, catalogEntry.name);
      const catalog = parseWikiSearchIndex(raw);
      if (catalog && catalog.documents.length > 0) {
        usedCatalog = true;
        const ranked = catalog.documents
          .map((doc) => ({
            doc,
            score: scoreWikiSearchDoc(doc, tokens),
          }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);
        const take = ranked.slice(0, Math.max(limit * 3, limit));
        for (const { doc } of take) {
          if (entryNames.has(doc.path)) {
            const md = readEntryText(path, doc.path);
            const hit = hitFromOkfMarkdown(doc.path, md, tokens, snippetChars);
            if (hit) {
              hits.push(hit);
              continue;
            }
          }
          hits.push({
            score: scoreWikiSearchDoc(doc, tokens),
            kind: "okf",
            path: doc.path,
            title: doc.title,
            snippet: snippetAround(wikiSearchDocBlob(doc), tokens, snippetChars),
          });
        }
      }
    }

    if (!usedCatalog) {
      const indexPath = BUNDLE_PATHS.okfIndex;
      const indexRows =
        entryNames.has(indexPath)
          ? parseIndexHrefs(readEntryText(path, indexPath), BUNDLE_PATHS.okfRoot)
          : [];
      const indexHits = indexRows
        .map((row) => ({
          row,
          score:
            scoreField(row.title, tokens, 4) +
            scoreField(row.description, tokens, 2) +
            scoreField(row.path, tokens, 1),
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);

      const strongIndex = indexHits.filter((h) => h.score >= 4);
      const preferIndex =
        strongIndex.length >= Math.min(limit, 3) ||
        (indexHits.length > 0 && indexHits.length <= limit);

      const candidates = preferIndex
        ? indexHits.slice(0, Math.max(limit * 3, limit)).map((h) => h.row.path)
        : entries
            .filter(
              (e) =>
                e.name.startsWith(BUNDLE_PATHS.okfRoot) &&
                e.name.endsWith(".md") &&
                !e.name.endsWith("index.md") &&
                !e.name.endsWith("/"),
            )
            .map((e) => e.name);

      for (const name of candidates) {
        if (!entryNames.has(name)) continue;
        const md = readEntryText(path, name);
        const hit = hitFromOkfMarkdown(name, md, tokens, snippetChars);
        if (hit) hits.push(hit);
      }
    }
  }

  const strongOkf = hits.filter((h) => h.kind === "okf" && h.score >= 4).length;
  const skipParsed = strongOkf >= limit;

  if (wantParsed && !skipParsed) {
    const parsedFiles = entries
      .filter(
        (e) =>
          e.name.startsWith(BUNDLE_PATHS.parsed) &&
          e.name.endsWith(".md") &&
          !e.name.endsWith("/"),
      )
      .slice(0, 80);
    for (const e of parsedFiles) {
      const text = readEntryText(path, e.name).slice(0, 64_000);
      const score = scoreField(text, tokens, 1);
      if (score <= 0) continue;
      const stem = e.name.split("/").pop()?.replace(/\.md$/i, "") ?? e.name;
      hits.push({
        score: score * 0.6,
        kind: "parsed",
        path: e.name,
        title: stem,
        snippet: snippetAround(text, tokens, snippetChars),
        sources: [stem],
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const seen = new Set<string>();
  const unique: SearchHit[] = [];
  for (const h of hits) {
    if (seen.has(h.path)) continue;
    seen.add(h.path);
    unique.push({ ...h, readHints: readHintsForSearchHit(h) });
    if (unique.length >= limit) break;
  }

  return { package: path, query, hits: unique };
}
