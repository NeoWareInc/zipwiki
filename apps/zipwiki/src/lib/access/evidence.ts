/**
 * Local follow-up after an OKF hit: cited parsed passages, stored text
 * primaries, and an explicit gap when pack never stored an extract.
 */
import {
  BUNDLE_PATHS,
  isOmittableDocumentSource,
  listZipEntries,
  readZipEntryVerified,
  useZipHandle,
} from "../archive/index.js";
import { resolveOkfResource, tokenizeSearchQuery } from "../okf/index.js";
import { originFromEntries } from "./origin.js";
import { readEntries } from "./open.js";
import { searchPackage, type EvidenceGap, type EvidencePassage, type SearchHit, type SearchResult, type SearchScope } from "./search.js";

export const PASSAGE_CHARS = 4_000;
/** Larger window when seeding a section/clause hit. */
export const DEEP_PASSAGE_CHARS = 8_000;
export const NO_EXTRACT_REASON =
  "No extracted text was stored for this file at pack time.";

const TEXT_EXTENSIONS = [".txt", ".text", ".md", ".markdown"];

export type QueryReadKind = "text" | "binary" | "reject";

/** Keep in step with `isQueryFollowPath` on the Fly query route. */
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
  if (name.startsWith("wiki/parsed/") && name.endsWith(".md")) return "text";
  if (name.startsWith("wiki/") || name.startsWith("META-INF/")) return "reject";
  const lower = name.toLowerCase();
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "text";
  if (isOmittableDocumentSource(name)) return "binary";
  return "reject";
}

/** Section / clause vocabulary — prefer these over branding terms that appear early. */
const SECTION_HINT =
  /^(termination|dissolution|contraction|expansion|section|article|subsection|definitions|findings|intent|purpose|powers|boundaries|merger|repeal|amendment)$/i;

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

/**
 * Prefer rare / section-like tokens (e.g. termination) over frequent branding
 * terms (e.g. stewardship) that dominate the start of legislation.
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

export function sliceAroundOffset(
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

export function passageAround(
  text: string,
  tokens: string[],
  maxChars = PASSAGE_CHARS,
): { text: string; truncated: boolean } | null {
  const idx = bestPassageOffset(text, tokens);
  if (idx < 0) return null;
  return sliceAroundOffset(text, idx, maxChars);
}

function readMember(zipPath: string, name: string): string | null {
  try {
    return readZipEntryVerified(zipPath, name).data.toString("utf8");
  } catch {
    return null;
  }
}

function gapFor(
  entries: ReturnType<typeof listZipEntries>,
  path: string,
): EvidenceGap {
  const origin = originFromEntries(entries, path);
  return {
    path,
    reason: NO_EXTRACT_REASON,
    ...(origin?.originUri ? { originUri: origin.originUri } : {}),
  };
}

/**
 * For the top OKF cards, follow at most two citations each and at most three
 * passages in total. A citation with no token hit stays a citation. A file
 * that was never extracted becomes a gap.
 */
export function attachEvidence(
  packagePath: string,
  hits: SearchHit[],
  query: string,
): SearchHit[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return hits;
  return useZipHandle(packagePath, () => {
    const entries = listZipEntries(packagePath);
    const names = new Set(entries.map((entry) => entry.name));
    let passagesLeft = 3;
    let gapsLeft = 3;
    let cards = 0;
    return hits.map((hit) => {
      if (hit.kind !== "okf" || cards >= 3) return hit;
      cards += 1;
      const sources = hit.sources ?? [];
      const passages: EvidencePassage[] = [];
      const gaps: EvidenceGap[] = [];
      let followed = 0;
      for (const resource of sources) {
        if (followed >= 2) break;
        const resolved = resolveOkfResource(BUNDLE_PATHS.okfRoot, resource);
        if (!resolved) continue;
        followed += 1;
        const parsePath =
          resolved.startsWith(BUNDLE_PATHS.parsed) && resolved.endsWith(".md")
            ? resolved
            : `${BUNDLE_PATHS.parsed}${resolved}.md`;
        if (names.has(parsePath)) {
          if (passagesLeft <= 0) continue;
          const markdown = readMember(packagePath, parsePath);
          const window = markdown ? passageAround(markdown, tokens) : null;
          if (!window) continue;
          passages.push({ path: parsePath, ...window });
          passagesLeft -= 1;
          continue;
        }
        if (names.has(resolved) && queryReadKind(resolved) === "text") {
          if (passagesLeft <= 0) continue;
          const markdown = readMember(packagePath, resolved);
          const window = markdown ? passageAround(markdown, tokens) : null;
          if (!window) continue;
          passages.push({ path: resolved, ...window });
          passagesLeft -= 1;
          continue;
        }
        if (gapsLeft <= 0) continue;
        gaps.push(gapFor(entries, resolved));
        gapsLeft -= 1;
      }
      return {
        ...hit,
        ...(passages.length > 0 ? { passages } : {}),
        ...(gaps.length > 0 ? { gaps } : {}),
      };
    });
  });
}

const FOLLOW_CHARS = 12_000;
const PHRASE_HITS = 8;
const PHRASE_WINDOW = 240;

export type PhraseHit = {
  path: string;
  text: string;
  kind: "parsed" | "okf" | "original";
  /** Character index of the phrase in the stored text. */
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
  maxChars = FOLLOW_CHARS,
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

/**
 * Exact phrase scan of concept cards, parsed markdown, and stored text
 * primaries. Unparsed PDF, Office, and image bytes are not opened.
 */
export function searchPhrase(packagePath: string, phrase: string): PhraseHit[] {
  const needle = phrase.trim().replace(/\s+/g, " ");
  if (needle.length < 2) return [];
  return useZipHandle(packagePath, () => {
    const hits: PhraseHit[] = [];
    for (const entry of listZipEntries(packagePath)) {
      if (hits.length >= PHRASE_HITS) break;
      const name = entry.name.replace(/\\/g, "/");
      if (queryReadKind(name) !== "text") continue;
      const text = readMember(packagePath, name);
      if (!text) continue;
      const at = findPhraseOffset(text, needle);
      if (at < 0) continue;
      hits.push({
        path: name,
        kind: phraseKind(name),
        offset: at,
        text: windowAround(text, at, needle.length),
      });
    }
    return hits;
  });
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

/** Load one model-requested path, or refuse when pack stored no extract. */
export function readFollow(
  packagePath: string,
  requestPath: string,
  offset = 0,
): FollowWindow | { error: string } {
  const name = requestPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const kind = queryReadKind(name);
  if (kind === "binary") return { error: NO_EXTRACT_REASON };
  if (kind !== "text") return { error: "That path cannot be read from this package." };
  return useZipHandle(packagePath, () => {
    const names = new Set(listZipEntries(packagePath).map((entry) => entry.name));
    if (!names.has(name)) return { error: `Not in this package: ${name}` };
    const text = readMember(packagePath, name);
    if (text == null) return { error: `Could not read ${name}` };
    return followWindow(text, offset);
  });
}

export type QueryArchiveResult = SearchResult & {
  hits: SearchHit[];
  topK: Array<{
    path: string;
    encoding?: string;
    truncated?: boolean;
    text?: string;
    data?: string;
  }>;
};

/** Search, then attach local passages and gaps and read the top hit bodies. */
export function queryArchive(args: {
  package?: string;
  query: string;
  in?: SearchScope;
  limit?: number;
  snippetChars?: number;
  readTopK?: number;
  maxBytes?: number;
}): QueryArchiveResult {
  const search = searchPackage({
    package: args.package,
    query: args.query,
    in: args.in,
    limit: args.limit,
    snippetChars: args.snippetChars,
  });
  const hits = attachEvidence(search.package, search.hits, search.query);
  const k = Math.min(Math.max(args.readTopK ?? 3, 0), hits.length);
  const paths = hits.slice(0, k).map((hit) => hit.path);
  const topK =
    paths.length > 0
      ? readEntries({
          package: args.package ?? search.package,
          paths,
          maxBytes: args.maxBytes,
        }).map((row) => ({
          path: row.path ?? "",
          encoding: row.encoding ?? "utf8",
          truncated: row.truncated,
          text: row.text,
          data: row.data,
        }))
      : [];
  return { ...search, hits, topK };
}
