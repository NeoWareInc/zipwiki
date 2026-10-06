import { payloadCrcMatches } from "./integrity.js";
import {
  BUNDLE_PATHS,
  readZipEntryPayload,
  type ZipListEntry,
} from "./zip.js";

/** Same cap as hosted OKF samples. Larger bodies are marked truncated. */
export const QUERY_BODY_CHARS = 12_000;
const HIT_LIMIT = 10;
const READ_TOP_K = 3;
const PARSED_FILE_CAP = 80;
const PARSED_SCAN_CHARS = 64_000;
const SEARCH_INDEX = "wiki/search.json";

export type QueryHit = {
  score: number;
  kind: "okf" | "parsed";
  path: string;
  title?: string;
  snippet: string;
  /** Parsed text used because no concept card matched. */
  evidence?: boolean;
  /** Full extracted-text files this concept cites. */
  documents?: string[];
};

export type QueryExcerpt = {
  path: string;
  title?: string;
  kind: "okf" | "parsed" | "gap";
  text: string;
  truncated: boolean;
  /** Full extracted-text files this concept cites. */
  documents?: string[];
};

export type QueryPassage = {
  path: string;
  text: string;
  truncated: boolean;
};

export type QueryGap = {
  path: string;
  reason: string;
  originUri?: string;
};

export type QuerySkipped = {
  path: string;
  reason: string;
};

export type PackageQuery = {
  query: string;
  hits: QueryHit[];
  excerpts: QueryExcerpt[];
  passages: QueryPassage[];
  gaps: QueryGap[];
  skipped: QuerySkipped[];
};

export const NO_EXTRACT_REASON =
  "No extracted text was stored for this file at pack time.";

const TEXT_EXTENSIONS = [".txt", ".text", ".md", ".markdown"];
const PASSAGE_CHARS = 4_000;
/** Larger window when we seed a section/clause hit into Ask excerpts. */
const DEEP_PASSAGE_CHARS = 8_000;

export type QueryReadKind = "text" | "binary" | "reject";

/** Keep in step with `queryReadKind` in the zipwiki access library. */
export function queryReadKind(path: string): QueryReadKind {
  const name = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (
    !name ||
    name.length > 512 ||
    name.includes("..") ||
    name.includes("\0") ||
    name.includes("://") ||
    name.endsWith("/")
  ) {
    return "reject";
  }
  if (name.startsWith("wiki/okf/") && name.endsWith(".md")) return "text";
  if (name.startsWith(`${BUNDLE_PATHS.parsed}`) && name.endsWith(".md")) return "text";
  if (name.startsWith("wiki/") || name.startsWith("META-INF/")) return "reject";
  const lower = name.toLowerCase();
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text";
  const dot = lower.lastIndexOf(".");
  if (dot > 0) return "binary";
  return "reject";
}

type ScoredFile = {
  path: string;
  kind: "okf" | "parsed";
  title?: string;
  score: number;
  snippet: string;
  evidence?: boolean;
  text: string;
  documents?: string[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreField(
  text: string | undefined,
  tokens: string[],
  weight: number,
): number {
  if (!text || tokens.length === 0) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (hay.includes(token)) score += weight;
  }
  return score;
}

function snippetAround(text: string, tokens: string[], maxChars = 240): string {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const token of tokens) {
    const at = lower.indexOf(token);
    if (at >= 0 && (idx < 0 || at < idx)) idx = at;
  }
  if (idx < 0) return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  const start = Math.max(0, idx - Math.floor(maxChars / 3));
  let slice = text.slice(start, start + maxChars).replace(/\s+/g, " ").trim();
  if (start > 0) slice = `…${slice}`;
  if (start + maxChars < text.length) slice = `${slice}…`;
  return slice;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitFrontmatter(markdown: string): {
  frontmatter: string | null;
  body: string;
} {
  const normalized = markdown.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    return { frontmatter: null, body: normalized };
  }
  const start = normalized.startsWith("---\r\n") ? 5 : 4;
  const end = normalized.indexOf("\n---", start);
  if (end < 0) return { frontmatter: null, body: normalized };
  let bodyStart = end + 4;
  if (normalized[bodyStart] === "\r") bodyStart += 1;
  if (normalized[bodyStart] === "\n") bodyStart += 1;
  return {
    frontmatter: normalized.slice(start, end),
    body: normalized.slice(bodyStart),
  };
}

function parseConceptFields(block: string): {
  title?: string;
  description?: string;
  type?: string;
  tags?: string;
} {
  const fields: {
    title?: string;
    description?: string;
    type?: string;
    tags?: string;
  } = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    const raw = kv[2]!.trim();
    if (!raw) continue;
    if (key === "tags" && raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1).trim();
      fields.tags = inner
        ? inner
            .split(",")
            .map((tag) => unquote(tag.trim()))
            .filter(Boolean)
            .join(" ")
        : undefined;
      continue;
    }
    if (key === "title") fields.title = unquote(raw);
    else if (key === "description") fields.description = unquote(raw);
    else if (key === "type") fields.type = unquote(raw);
  }
  return fields;
}

function isConceptPath(name: string): boolean {
  return (
    name.startsWith(BUNDLE_PATHS.okfRoot) &&
    name.endsWith(".md") &&
    !name.endsWith("/") &&
    !name.endsWith("/index.md") &&
    name !== BUNDLE_PATHS.okfIndex &&
    !name.endsWith("/log.md")
  );
}

async function readVerifiedText(
  buf: ArrayBuffer,
  entry: ZipListEntry,
  skipped: QuerySkipped[],
): Promise<string | null> {
  try {
    const data = await readZipEntryPayload(buf, entry);
    if (!payloadCrcMatches(data, entry.crc32)) {
      skipped.push({ path: entry.name, reason: "CRC-32 mismatch" });
      return null;
    }
    return new TextDecoder("utf-8").decode(data);
  } catch {
    skipped.push({ path: entry.name, reason: "Could not read entry" });
    return null;
  }
}

function parseSourceResources(block: string): string[] {
  const resources: string[] = [];
  let inSources = false;
  for (const line of block.split(/\r?\n/)) {
    if (/^sources:\s*$/.test(line)) {
      inSources = true;
      continue;
    }
    if (inSources && /^\S/.test(line)) break;
    if (!inSources) continue;
    const match = /^\s+(?:-\s+)?resource:\s*(.+)$/.exec(line);
    if (match) resources.push(unquote(match[1]!));
  }
  return resources;
}

function resolveResource(fromFile: string, resource: string): string | null {
  const raw = resource.trim();
  if (!raw || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  const stack = fromFile.split("/").slice(0, -1);
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(segment);
    }
  }
  const path = stack.join("/");
  return path || null;
}

/** Parsed markdown files cited by a concept and present in the archive. */
function parsedDocuments(
  conceptPath: string,
  markdown: string,
  names: Set<string>,
): string[] {
  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) return [];
  const found: string[] = [];
  for (const resource of parseSourceResources(frontmatter)) {
    const resolved = resolveResource(conceptPath, resource);
    if (!resolved?.startsWith(BUNDLE_PATHS.parsed)) continue;
    if (!resolved.toLowerCase().endsWith(".md")) continue;
    if (!names.has(resolved) || found.includes(resolved)) continue;
    found.push(resolved);
  }
  return found;
}

function hitFromConcept(
  path: string,
  markdown: string,
  tokens: string[],
  names: Set<string>,
): ScoredFile | null {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const fields = frontmatter ? parseConceptFields(frontmatter) : {};
  let score = 0;
  score += scoreField(fields.title, tokens, 4);
  score += scoreField(fields.tags, tokens, 3);
  score += scoreField(fields.description, tokens, 2);
  score += scoreField(fields.type, tokens, 1.5);
  score += scoreField(body, tokens, 0.5);
  if (score <= 0) return null;
  const blob = [fields.title, fields.description, fields.tags, fields.type, body]
    .filter(Boolean)
    .join("\n");
  return {
    path,
    kind: "okf",
    title: fields.title,
    score,
    snippet: snippetAround(blob, tokens),
    text: markdown,
    documents: parsedDocuments(path, markdown, names),
  };
}

type SearchDoc = {
  path: string;
  title?: string;
  description?: string;
  tags?: string;
  type?: string;
};

function parseSearchIndex(raw: string): SearchDoc[] | null {
  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      documents?: SearchDoc[];
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.documents)) return null;
    return parsed.documents.filter(
      (doc) => typeof doc?.path === "string" && doc.path.length > 0,
    );
  } catch {
    return null;
  }
}

function scoreSearchDoc(doc: SearchDoc, tokens: string[]): number {
  return (
    scoreField(doc.title, tokens, 4) +
    scoreField(doc.tags, tokens, 3) +
    scoreField(doc.description, tokens, 2) +
    scoreField(doc.type, tokens, 1.5) +
    scoreField(doc.path, tokens, 1)
  );
}

/**
 * Rank OKF concept cards in an open archive, then read the top matches.
 * Parsed markdown is used only when no concept matches.
 */
export async function queryPackage(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
  query: string,
): Promise<PackageQuery> {
  const trimmed = query.trim();
  const skipped: QuerySkipped[] = [];
  if (!trimmed) {
    return { query: "", hits: [], excerpts: [], passages: [], gaps: [], skipped };
  }
  const tokens = tokenize(trimmed);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const entryNames = new Set(byName.keys());
  const scored: ScoredFile[] = [];

  const indexEntry = byName.get(SEARCH_INDEX);
  let usedCatalog = false;
  if (indexEntry) {
    const raw = await readVerifiedText(buf, indexEntry, skipped);
    const docs = raw ? parseSearchIndex(raw) : null;
    if (docs && docs.length > 0) {
      usedCatalog = true;
      const ranked = docs
        .map((doc) => ({ doc, score: scoreSearchDoc(doc, tokens) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(HIT_LIMIT * 3, HIT_LIMIT));
      for (const { doc } of ranked) {
        const entry = byName.get(doc.path);
        if (!entry) continue;
        const markdown = await readVerifiedText(buf, entry, skipped);
        if (!markdown) continue;
        const hit = hitFromConcept(doc.path, markdown, tokens, entryNames);
        if (hit) scored.push(hit);
      }
    }
  }

  if (!usedCatalog) {
    for (const entry of entries) {
      if (!isConceptPath(entry.name)) continue;
      const markdown = await readVerifiedText(buf, entry, skipped);
      if (!markdown) continue;
      const hit = hitFromConcept(entry.name, markdown, tokens, entryNames);
      if (hit) scored.push(hit);
    }
  }

  if (!scored.some((hit) => hit.kind === "okf")) {
    const parsed = entries
      .filter(
        (entry) =>
          entry.name.startsWith(BUNDLE_PATHS.parsed) &&
          entry.name.endsWith(".md") &&
          !entry.name.endsWith("/"),
      )
      .slice(0, PARSED_FILE_CAP);
    for (const entry of parsed) {
      const markdown = await readVerifiedText(buf, entry, skipped);
      if (!markdown) continue;
      const sample = markdown.slice(0, PARSED_SCAN_CHARS);
      // Score the head for density and the full body so deep sections still rank.
      const score =
        scoreField(sample, tokens, 1) + scoreField(markdown, tokens, 0.75);
      if (score <= 0) continue;
      const stem = entry.name.split("/").pop()?.replace(/\.md$/i, "") ?? entry.name;
      scored.push({
        path: entry.name,
        kind: "parsed",
        title: stem,
        score: score * 0.6,
        snippet: snippetAround(markdown, tokens),
        evidence: true,
        text: markdown,
        documents: [entry.name],
      });
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || a.path.localeCompare(b.path),
  );
  const seen = new Set<string>();
  const unique: ScoredFile[] = [];
  for (const hit of scored) {
    if (seen.has(hit.path)) continue;
    seen.add(hit.path);
    unique.push(hit);
    if (unique.length >= HIT_LIMIT) break;
  }

  const excerpts: QueryExcerpt[] = unique.slice(0, READ_TOP_K).map((hit) => {
    // For long parsed extracts, send the window around distinctive query terms
    // so deep sections (e.g. Termination) reach the model on the first turn.
    const around =
      hit.kind === "parsed"
        ? passageAround(hit.text, tokens, QUERY_BODY_CHARS)
        : null;
    const text = around?.text ?? hit.text.slice(0, QUERY_BODY_CHARS);
    return {
      path: hit.path,
      title: hit.title,
      kind: hit.kind,
      text,
      truncated: around
        ? around.truncated
        : hit.text.length > QUERY_BODY_CHARS,
      ...(hit.documents && hit.documents.length > 0
        ? { documents: hit.documents }
        : {}),
    };
  });

  const passages: QueryPassage[] = [];
  const gaps: QueryGap[] = [];
  let passageBudget = 3;
  let gapBudget = 3;
  let cards = 0;
  const citedParsePaths = new Set<string>();
  for (const hit of unique) {
    if (hit.kind !== "okf" || cards >= READ_TOP_K) continue;
    cards += 1;
    let followed = 0;
    for (const resolved of citedPaths(hit.path, hit.text)) {
      if (followed >= 2) break;
      followed += 1;
      const parsePath =
        resolved.startsWith(BUNDLE_PATHS.parsed) && resolved.endsWith(".md")
          ? resolved
          : `${BUNDLE_PATHS.parsed}${resolved}.md`;
      if (byName.has(parsePath)) {
        citedParsePaths.add(parsePath);
        if (passageBudget <= 0) continue;
        const entry = byName.get(parsePath);
        const markdown = entry
          ? await readVerifiedText(buf, entry, skipped)
          : null;
        const window = markdown ? passageAround(markdown, tokens) : null;
        if (!window) continue;
        passages.push({ path: parsePath, ...window });
        passageBudget -= 1;
        continue;
      }
      if (byName.has(resolved) && queryReadKind(resolved) === "text") {
        if (passageBudget <= 0) continue;
        const entry = byName.get(resolved);
        const markdown = entry
          ? await readVerifiedText(buf, entry, skipped)
          : null;
        const window = markdown ? passageAround(markdown, tokens) : null;
        if (!window) continue;
        passages.push({ path: resolved, ...window });
        passageBudget -= 1;
        continue;
      }
      if (gapBudget <= 0) continue;
      gaps.push(gapFor(entries, resolved));
      gapBudget -= 1;
    }
  }

  // When OKF cards match branding terms at the top of a long act, also pull a
  // deep window around rare query terms (e.g. termination) so Ask sees them.
  const focusTokens = tokens.filter(
    (token) => token.length >= 6 || SECTION_HINT.test(token),
  );
  if (focusTokens.length > 0 && passageBudget > 0) {
    const targets =
      citedParsePaths.size > 0
        ? [...citedParsePaths]
        : entries
            .filter(
              (entry) =>
                entry.name.startsWith(BUNDLE_PATHS.parsed) &&
                entry.name.endsWith(".md") &&
                !entry.name.endsWith("/"),
            )
            .slice(0, 8)
            .map((entry) => entry.name);
    for (const path of targets) {
      if (passageBudget <= 0) break;
      if (passages.some((passage) => passage.path === path)) {
        // Already have a window for this file — only add another if it targets
        // a different offset (rare section vs branding intro).
      }
      const entry = byName.get(path);
      if (!entry) continue;
      const markdown = await readVerifiedText(buf, entry, skipped);
      if (!markdown) continue;
      const idx = bestPassageOffset(markdown, focusTokens);
      if (idx < 0) continue;
      const existing = passages.find((passage) => passage.path === path);
      if (existing) {
        // Skip if the existing window already covers this offset.
        const existingStart = markdown.indexOf(
          existing.text.replace(/^…/, "").slice(0, 40),
        );
        if (existingStart >= 0 && Math.abs(existingStart - idx) < PASSAGE_CHARS) {
          continue;
        }
      }
      const window = passageAround(markdown, focusTokens, DEEP_PASSAGE_CHARS);
      if (!window) continue;
      passages.push({ path, ...window });
      passageBudget -= 1;
    }
  }

  const seeded = await seedDeepPassages(
    buf,
    entries,
    tokens,
    skipped,
    passages,
  );
  if (seeded.length > 0) {
    passages.unshift(...seeded);
  }

  return {
    query: trimmed,
    hits: unique.map((hit) => ({
      score: hit.score,
      kind: hit.kind,
      path: hit.path,
      title: hit.title,
      snippet: hit.snippet,
      ...(hit.evidence ? { evidence: true } : {}),
      ...(hit.documents && hit.documents.length > 0
        ? { documents: hit.documents }
        : {}),
    })),
    excerpts,
    passages,
    gaps,
    skipped,
  };
}

function citedPaths(conceptPath: string, markdown: string): string[] {
  const { frontmatter } = splitFrontmatter(markdown);
  if (!frontmatter) return [];
  const found: string[] = [];
  for (const resource of parseSourceResources(frontmatter)) {
    const resolved = resolveResource(conceptPath, resource);
    if (resolved && !found.includes(resolved)) found.push(resolved);
  }
  return found;
}

/** Section / clause vocabulary — prefer these over branding terms that appear early. */
const SECTION_HINT =
  /^(termination|dissolution|contraction|expansion|section|article|subsection|definitions|findings|intent|purpose|powers|boundaries|merger|repeal|amendment)$/i;

/**
 * Prefer rare / section-like tokens (e.g. termination) over frequent branding
 * terms (e.g. stewardship) that appear at the start of legislation.
 */
export function bestPassageOffset(text: string, tokens: string[]): number {
  const candidates = tokens.filter((token) => token.length >= 3);
  let bestAt = -1;
  let bestScore = -1;
  for (const token of candidates) {
    const section = SECTION_HINT.test(token);
    const at = section
      ? tokenMatchLastIndex(text, token)
      : tokenMatchIndex(text, token);
    if (at < 0) continue;
    const count = countTokenMatches(text, token);
    const sectionBonus = section ? 24 : 0;
    const rarityBonus = count === 1 ? 10 : count <= 3 ? 4 : count <= 8 ? 1 : 0;
    const score = sectionBonus + rarityBonus + token.length / Math.max(1, count);
    if (score > bestScore) {
      bestScore = score;
      bestAt = at;
    }
  }
  return bestAt;
}

/** Case-insensitive match; tolerates PDF soft hyphens and hyphenated wraps. */
export function tokenMatchIndex(text: string, token: string): number {
  const needle = token.toLowerCase();
  if (needle.length < 2) return -1;
  const lower = text.toLowerCase();
  const direct = lower.indexOf(needle);
  if (direct >= 0) return direct;
  const flex = needle
    .split("")
    .map((ch) => (/[a-z0-9]/.test(ch) ? `${ch}[\\u00ad\\-]?\\s*` : escapeRegExp(ch)))
    .join("")
    .replace(/\\s\*$/, "");
  const match = new RegExp(flex, "i").exec(text);
  return match ? match.index : -1;
}

/** Last match — section headings often appear in a TOC before the real clause. */
export function tokenMatchLastIndex(text: string, token: string): number {
  let last = -1;
  let from = 0;
  while (from < text.length) {
    const slice = text.slice(from);
    const at = tokenMatchIndex(slice, token);
    if (at < 0) break;
    last = from + at;
    from = last + Math.max(1, token.length);
  }
  return last;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTokenMatches(text: string, token: string, cap = 40): number {
  let count = 0;
  let from = 0;
  while (count < cap) {
    const slice = text.slice(from);
    const at = tokenMatchIndex(slice, token);
    if (at < 0) break;
    count += 1;
    from += at + Math.max(1, token.length);
  }
  return count;
}

function passageAround(
  text: string,
  tokens: string[],
  maxChars = PASSAGE_CHARS,
): { text: string; truncated: boolean } | null {
  const idx = bestPassageOffset(text, tokens);
  if (idx < 0) return null;
  return sliceAroundOffset(text, idx, maxChars);
}

function sliceAroundOffset(
  text: string,
  idx: number,
  maxChars: number,
): { text: string; truncated: boolean } {
  const start = Math.max(0, idx - Math.floor(maxChars / 3));
  let slice = text.slice(start, start + maxChars);
  const truncated = start > 0 || start + maxChars < text.length;
  if (start > 0) slice = `…${slice}`;
  if (start + maxChars < text.length) slice = `${slice}…`;
  return { text: slice, truncated };
}

/**
 * Deterministic deep hits: scan stored text for section/focus query terms and
 * return windows the Ask model must see on the first turn.
 */
async function seedDeepPassages(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
  tokens: string[],
  skipped: QuerySkipped[],
  already: QueryPassage[],
): Promise<QueryPassage[]> {
  const focus = [
    ...tokens.filter((token) => SECTION_HINT.test(token)),
    ...tokens.filter((token) => token.length >= 7 && !SECTION_HINT.test(token)),
  ];
  const uniqueFocus = [...new Set(focus)];
  if (uniqueFocus.length === 0) return [];

  const seeded: QueryPassage[] = [];
  const covered = new Set(
    already.map((passage) => `${passage.path}:${passage.text.slice(0, 48)}`),
  );

  for (const token of uniqueFocus) {
    if (seeded.length >= 3) break;
    const ranked = [...entries].sort((a, b) => {
      const rank = (name: string) =>
        name.startsWith(BUNDLE_PATHS.parsed)
          ? 0
          : name.startsWith(BUNDLE_PATHS.okfRoot) || name.startsWith("wiki/okf/")
            ? 2
            : 1;
      return rank(a.name) - rank(b.name);
    });
    for (const entry of ranked) {
      if (seeded.length >= 3) break;
      const name = entry.name.replace(/\\/g, "/");
      if (queryReadKind(name) !== "text") continue;
      const markdown = await readVerifiedText(buf, entry, skipped);
      if (!markdown) continue;
      const at = SECTION_HINT.test(token)
        ? tokenMatchLastIndex(markdown, token)
        : tokenMatchIndex(markdown, token);
      if (at < 0) continue;
      const window = sliceAroundOffset(markdown, at, DEEP_PASSAGE_CHARS);
      const key = `${name}:${window.text.slice(0, 48)}`;
      if (covered.has(key)) continue;
      const prior = [...already, ...seeded].find((passage) => passage.path === name);
      if (prior) {
        const priorAt = tokenMatchIndex(
          prior.text.replace(/^…/, "").slice(0, 80),
          token,
        );
        if (priorAt >= 0) continue;
        const priorStart = markdown.indexOf(prior.text.replace(/^…/, "").slice(0, 32));
        if (priorStart >= 0 && Math.abs(priorStart - at) < PASSAGE_CHARS) continue;
      }
      covered.add(key);
      seeded.push({ path: name, ...window });
      // One strong hit per focus token is enough for the first Ask turn.
      break;
    }
  }
  return seeded;
}

function gapFor(entries: ZipListEntry[], path: string): QueryGap {
  const parsePath = `${BUNDLE_PATHS.parsed}${path}.md`;
  const origin =
    entries.find((entry) => entry.name === path)?.originUri ??
    entries.find((entry) => entry.name === parsePath)?.originUri;
  return {
    path,
    reason: NO_EXTRACT_REASON,
    ...(origin ? { originUri: origin } : {}),
  };
}

const PHRASE_HITS = 8;
const PHRASE_WINDOW = 240;

export type PhraseHit = {
  path: string;
  text: string;
  kind: "parsed" | "okf" | "original";
  offset: number;
};

export type FollowWindow = {
  text: string;
  offset: number;
  next: number;
  total: number;
};

/** One slice of a stored text file. `next` is the offset of the following slice. */
export function followWindow(
  text: string,
  offset = 0,
  maxChars = QUERY_BODY_CHARS,
): FollowWindow {
  const total = text.length;
  const start =
    Number.isFinite(offset) && offset > 0 ? Math.min(Math.floor(offset), total) : 0;
  const end = Math.min(total, start + maxChars);
  return { text: text.slice(start, end), offset: start, next: end, total };
}

/** Header the model uses to ask for the next slice. */
export function formatFollowWindow(window: FollowWindow): string {
  return `offset ${window.offset}\nnext ${window.next}\ntotal ${window.total}\n\n${window.text}`;
}

function phraseKind(path: string): PhraseHit["kind"] {
  if (path.startsWith("wiki/okf/")) return "okf";
  if (path.startsWith(`${BUNDLE_PATHS.parsed}`)) return "parsed";
  return "original";
}

function windowAround(text: string, at: number, phraseLength: number): string {
  const start = Math.max(0, at - Math.floor((PHRASE_WINDOW - phraseLength) / 2));
  let slice = text.slice(start, start + PHRASE_WINDOW).replace(/\s+/g, " ").trim();
  if (start > 0) slice = `…${slice}`;
  if (start + PHRASE_WINDOW < text.length) slice = `${slice}…`;
  return slice;
}

/**
 * Exact phrase first; if missing, find a window that contains all significant
 * tokens (helps section headings buried deep in legislation).
 */
export function findPhraseOffset(text: string, phrase: string): number {
  const needle = phrase.trim().replace(/\s+/g, " ");
  if (needle.length < 2) return -1;
  const exact = tokenMatchIndex(text, needle);
  if (exact >= 0) return exact;
  const tokens = needle
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return -1;
  if (tokens.length === 1) return tokenMatchIndex(text, tokens[0]!);
  const primary = [...tokens].sort((a, b) => b.length - a.length)[0]!;
  let from = 0;
  while (from < text.length) {
    const slice = text.slice(from);
    const at = tokenMatchIndex(slice, primary);
    if (at < 0) return -1;
    const abs = from + at;
    const windowStart = Math.max(0, abs - 400);
    const windowEnd = Math.min(text.length, abs + primary.length + 400);
    const window = text.slice(windowStart, windowEnd);
    if (tokens.every((token) => tokenMatchIndex(window, token) >= 0)) return abs;
    from = abs + Math.max(1, primary.length);
  }
  return -1;
}

export function formatPhraseHits(phrase: string, hits: PhraseHit[]): string {
  if (hits.length === 0) {
    return (
      `No stored text contains "${phrase}". ` +
      "Try a shorter exact phrase from the document (for example a section heading)."
    );
  }
  return hits
    .map(
      (hit, index) =>
        `${index + 1}. ${hit.path} (${hit.kind}) offset ${hit.offset}\n${hit.text}`,
    )
    .join("\n\n");
}

/** Exact phrase scan of stored text. PDF, Office, and image bytes stay closed. */
export async function searchPackagePhrase(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
  phrase: string,
): Promise<PhraseHit[]> {
  const needle = phrase.trim().replace(/\s+/g, " ");
  if (needle.length < 2) return [];
  const hits: PhraseHit[] = [];
  for (const entry of entries) {
    if (hits.length >= PHRASE_HITS) break;
    const name = entry.name.replace(/\\/g, "/");
    if (queryReadKind(name) !== "text") continue;
    try {
      const data = await readZipEntryPayload(buf, entry);
      if (!payloadCrcMatches(data, entry.crc32)) continue;
      const text = new TextDecoder("utf-8").decode(data);
      const at = findPhraseOffset(text, needle);
      if (at < 0) continue;
      hits.push({
        path: name,
        kind: phraseKind(name),
        offset: at,
        text: windowAround(text, at, needle.length),
      });
    } catch {
      continue;
    }
  }
  return hits;
}

/** Extra Field 0x014F URI for a parsed path or primary name. Does not download. */
export function originLink(entries: ZipListEntry[], selector: string): string | null {
  const name = selector.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name) return null;
  const prefix = BUNDLE_PATHS.parsed;
  const candidates = new Set<string>([name]);
  if (name.startsWith(prefix)) {
    candidates.add(name.endsWith(".md") ? name : `${name}.md`);
  } else {
    const asName = name.endsWith(".md") ? name : `${name}.md`;
    candidates.add(`${prefix}${asName}`);
    candidates.add(`${prefix}${name}.md`);
  }
  for (const entry of entries) {
    if (candidates.has(entry.name) && entry.originUri) return entry.originUri;
  }
  const base = name.split("/").pop() ?? name;
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix) || !entry.name.endsWith(".md") || !entry.originUri) {
      continue;
    }
    const primary = entry.name.slice(prefix.length, -".md".length);
    if (primary === name || primary === base || entry.name.endsWith(`/${base}.md`)) {
      return entry.originUri;
    }
  }
  return null;
}

/** Load one model-requested path, or refuse when pack stored no extract. */
export async function readPackageFollow(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
  requestPath: string,
  offset = 0,
): Promise<FollowWindow | { error: string }> {
  const name = requestPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const kind = queryReadKind(name);
  if (kind === "binary") return { error: NO_EXTRACT_REASON };
  if (kind !== "text") return { error: "That path cannot be read from this package." };
  const entry = entries.find((item) => item.name === name);
  if (!entry) return { error: `Not in this package: ${name}` };
  try {
    const data = await readZipEntryPayload(buf, entry);
    if (!payloadCrcMatches(data, entry.crc32)) {
      return { error: `CRC-32 mismatch: ${name}` };
    }
    const full = new TextDecoder("utf-8").decode(data);
    return followWindow(full, offset);
  } catch {
    return { error: `Could not read ${name}` };
  }
}
