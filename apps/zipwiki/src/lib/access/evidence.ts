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

export function passageAround(
  text: string,
  tokens: string[],
  maxChars = PASSAGE_CHARS,
): { text: string; truncated: boolean } | null {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const token of tokens) {
    const at = lower.indexOf(token);
    if (at >= 0 && (idx < 0 || at < idx)) idx = at;
  }
  if (idx < 0) return null;
  const start = Math.max(0, idx - Math.floor(maxChars / 3));
  let slice = text.slice(start, start + maxChars);
  const truncated = start > 0 || start + maxChars < text.length;
  if (start > 0) slice = `…${slice}`;
  if (start + maxChars < text.length) slice = `${slice}…`;
  return { text: slice, truncated };
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

/** Load one model-requested path, or refuse when pack stored no extract. */
export function readFollow(
  packagePath: string,
  requestPath: string,
): { text: string; truncated: boolean } | { error: string } {
  const name = requestPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const kind = queryReadKind(name);
  if (kind === "binary") return { error: NO_EXTRACT_REASON };
  if (kind !== "text") return { error: "That path cannot be read from this package." };
  return useZipHandle(packagePath, () => {
    const names = new Set(listZipEntries(packagePath).map((entry) => entry.name));
    if (!names.has(name)) return { error: `Not in this package: ${name}` };
    const text = readMember(packagePath, name);
    if (text == null) return { error: `Could not read ${name}` };
    return {
      text: text.slice(0, FOLLOW_CHARS),
      truncated: text.length > FOLLOW_CHARS,
    };
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
