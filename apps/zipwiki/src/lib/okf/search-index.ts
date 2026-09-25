/**
 * Read a leftover `wiki/search.json` from older packages.
 * New packages do not write this file; search scans OKF markdown instead.
 */

import {
  parseFrontmatterFields,
  splitFrontmatter,
} from "./frontmatter.js";

export const WIKI_SEARCH_INDEX_VERSION = 1 as const;

export type WikiSearchDoc = {
  path: string;
  kind: "okf";
  title?: string;
  description?: string;
  tags?: string;
  type?: string;
};

export type WikiSearchIndex = {
  version: typeof WIKI_SEARCH_INDEX_VERSION;
  documents: WikiSearchDoc[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function buildWikiSearchIndex(
  files: Array<{ name: string; data: string }>,
  okfRoot = "wiki/okf/",
): WikiSearchIndex {
  const documents: WikiSearchDoc[] = [];
  for (const f of files) {
    const base = f.name.replace(/^.*\//, "");
    if (!base.endsWith(".md") || base === "index.md" || base === "log.md") continue;
    const path = f.name.startsWith(okfRoot)
      ? f.name
      : `${okfRoot}${base}`;
    const { frontmatter } = splitFrontmatter(f.data);
    const fields = frontmatter
      ? parseFrontmatterFields(frontmatter)
      : ({} as ReturnType<typeof parseFrontmatterFields>);
    documents.push({
      path,
      kind: "okf",
      title: fields.title ? String(fields.title) : undefined,
      description: fields.description
        ? String(fields.description)
        : undefined,
      tags: Array.isArray(fields.tags)
        ? fields.tags.map(String).join(" ")
        : undefined,
      type: fields.type ? String(fields.type) : undefined,
    });
  }
  documents.sort((a, b) => a.path.localeCompare(b.path));
  return { version: WIKI_SEARCH_INDEX_VERSION, documents };
}

export function serializeWikiSearchIndex(index: WikiSearchIndex): string {
  return `${JSON.stringify(index)}\n`;
}

export function parseWikiSearchIndex(raw: string): WikiSearchIndex | null {
  try {
    const parsed = JSON.parse(raw) as WikiSearchIndex;
    if (parsed?.version !== 1 || !Array.isArray(parsed.documents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function scoreWikiSearchDoc(
  doc: WikiSearchDoc,
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;
  const scoreField = (text: string | undefined, weight: number): number => {
    if (!text) return 0;
    const hay = text.toLowerCase();
    let s = 0;
    for (const t of tokens) {
      if (hay.includes(t)) s += weight;
    }
    return s;
  };
  return (
    scoreField(doc.title, 4) +
    scoreField(doc.tags, 3) +
    scoreField(doc.description, 2) +
    scoreField(doc.type, 1.5) +
    scoreField(doc.path, 1)
  );
}

export function wikiSearchDocBlob(doc: WikiSearchDoc): string {
  return [doc.title, doc.description, doc.tags, doc.type, doc.path]
    .filter(Boolean)
    .join("\n");
}

export { tokenize as tokenizeSearchQuery };
