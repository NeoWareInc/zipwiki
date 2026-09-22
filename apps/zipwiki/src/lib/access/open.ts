import {
  BUNDLE_PATHS,
  listZipEntries,
  pickOriginApiFields,
  readZipEntryVerified,
  useZipHandle,
  type ZipListEntry,
} from "../archive/index.js";
import {
  bufferLooksUtf8,
  clipBytes,
  clipUtf8,
  DEFAULT_MAX_BYTES,
} from "./clip.js";
import {
  AccessError,
  normalizeEntryName,
  resolvePackagePath,
  rethrowAccess,
} from "./resolve.js";
import { buildCatalog, type CatalogResult } from "./catalog.js";
import {
  entryHasOrigin,
  originFromEntries,
  primaryPathFromParsed,
  type OriginSummary,
} from "./origin.js";

export const OPEN_SEQUENCE = [
  "1. open (done)",
  "2. Prefer search or query; else read_okf_index",
  "3. read_okf for top concepts",
  "4. read_parsed / read_entry to stream bytes via MCP (verified inflate; size-capped). origin URI/CRC is on read_parsed when Extra Field 0x014F is present",
  "5. origin (fetch=true) to download the original and verify CRC-32; extract only when a filesystem path is required",
] as const;

function entryExists(entries: ZipListEntry[], name: string): boolean {
  return entries.some((e) => e.name === name || e.name === `${name}/`);
}

function okfConceptPaths(entries: ZipListEntry[]): string[] {
  return entries
    .filter(
      (e) =>
        e.name.startsWith(BUNDLE_PATHS.okfRoot) &&
        e.name.endsWith(".md") &&
        !e.name.endsWith("index.md") &&
        !e.name.endsWith("/log.md") &&
        !e.name.endsWith("/"),
    )
    .map((e) => e.name);
}

function readVerified(zipPath: string, entryName: string): Buffer {
  try {
    return readZipEntryVerified(zipPath, entryName).data;
  } catch (err) {
    rethrowAccess(err);
  }
}

export type OpenResult = {
  package: string;
  format: unknown;
  packageSpecVersion: unknown;
  profiles: unknown;
  aiRoot: unknown;
  digest: unknown;
  primaryCount: number;
  parsedCount: unknown;
  okf: {
    present: boolean;
    root: unknown;
    index: unknown;
    version: unknown;
    conceptCount: number;
    concepts: string[];
  };
  /** Manifest primaries enriched with Extra Field 0x014F from the parse entry. */
  primaries: Array<Record<string, unknown>>;
  /** Parsed members that carry an original locator. */
  origins: Array<{
    parsedPath: string;
    primaryPath: string;
    originUri?: string;
    originCrc32?: string;
    originSize?: number;
    originMtime?: number;
    originMtimeUtc?: string;
    originSha256?: string;
  }>;
  entryCount: number;
  openSequence: readonly string[];
  /** One row per primary: OKF title/type, parsed?, original?, next-read hints. */
  catalog: CatalogResult;
};

export function openPackage(packagePath?: string): OpenResult {
  const path = resolvePackagePath(packagePath);
  return useZipHandle(path, () => openPackageLoaded(path));
}

function openPackageLoaded(path: string): OpenResult {
  const entries = listZipEntries(path);
  let manifest: Record<string, unknown> | null = null;
  if (entryExists(entries, BUNDLE_PATHS.manifest)) {
    const raw = readVerified(path, BUNDLE_PATHS.manifest).toString("utf8");
    manifest = JSON.parse(raw) as Record<string, unknown>;
  }
  const ai = (manifest?.ai ?? null) as Record<string, unknown> | null;
  const okf = (ai?.okf ?? null) as Record<string, unknown> | null;
  const primariesRaw = Array.isArray(ai?.primaries) ? ai.primaries : [];
  const aiRoot =
    typeof ai?.root === "string" ? ai.root : BUNDLE_PATHS.aiRoot;

  const originByPrimary = new Map<
    string,
    ReturnType<typeof pickOriginApiFields> & { parsedPath: string }
  >();
  const origins: OpenResult["origins"] = [];
  for (const e of entries) {
    if (!entryHasOrigin(e)) continue;
    const primaryPath = primaryPathFromParsed(e.name, aiRoot);
    if (!primaryPath) continue;
    const fields = pickOriginApiFields(e);
    const row = {
      parsedPath: e.name,
      primaryPath,
      ...fields,
    };
    origins.push(row);
    originByPrimary.set(primaryPath, {
      ...fields,
      parsedPath: row.parsedPath,
    });
  }

  const primaries = primariesRaw.map((p) => {
    if (!p || typeof p !== "object") return {};
    const rec = { ...(p as Record<string, unknown>) };
    const pathKey = typeof rec.path === "string" ? rec.path : null;
    if (pathKey && originByPrimary.has(pathKey)) {
      const o = originByPrimary.get(pathKey)!;
      Object.assign(rec, pickOriginApiFields(o));
    }
    return rec;
  });

  const concepts = okfConceptPaths(entries);
  const catalog = buildCatalog(path);
  return {
    package: path,
    format: manifest?.format ?? null,
    packageSpecVersion: manifest?.specVersion ?? null,
    profiles: manifest?.profiles ?? null,
    aiRoot,
    digest: ai?.digest ?? null,
    primaryCount: Number(ai?.primaryCount ?? primaries.length),
    parsedCount: ai?.parsedCount ?? null,
    okf: {
      present: Boolean(okf?.present) || concepts.length > 0,
      root: okf?.root ?? BUNDLE_PATHS.okfRoot,
      index: okf?.index ?? BUNDLE_PATHS.okfIndex,
      version: okf?.version ?? null,
      conceptCount: concepts.length,
      concepts,
    },
    primaries,
    origins,
    entryCount: entries.length,
    openSequence: OPEN_SEQUENCE,
    catalog,
  };
}

export type ListResult = {
  package: string;
  entries: Array<{
    path: string;
    size: number;
    compressedSize: number;
    method: number;
    originUri?: string;
    originCrc32?: string;
    originSize?: number;
    originMtime?: number;
    originMtimeUtc?: string;
    originSha256?: string;
  }>;
};

export function listPackage(args: {
  package?: string;
  prefix?: string;
  limit?: number;
}): ListResult {
  const path = resolvePackagePath(args.package);
  return useZipHandle(path, () => listPackageLoaded(path, args.prefix, args.limit));
}

function listPackageLoaded(
  path: string,
  prefixArg?: string,
  limitArg?: number,
): ListResult {
  const prefix = prefixArg?.trim() ?? "";
  const limit = Math.min(Math.max(limitArg ?? 500, 1), 5000);
  let entries = listZipEntries(path);
  if (prefix) {
    entries = entries.filter((e) => e.name.startsWith(prefix));
  }
  entries = entries.slice(0, limit);
  return {
    package: path,
    entries: entries.map((e) => ({
      path: e.name,
      size: e.uncompressedSize,
      compressedSize: e.compressedSize,
      method: e.method,
      ...pickOriginApiFields(e),
    })),
  };
}

export type ReadResult = {
  package: string;
  path: string | null;
  truncated?: boolean;
  totalBytes?: number;
  offset?: number;
  /** UTF-8 text when encoding is utf8 (default). */
  text?: string;
  /** Present when encoding is base64 (binary / non-UTF-8). */
  encoding?: "utf8" | "base64";
  /** Base64 payload when encoding is base64. */
  data?: string;
  note?: string;
  concepts?: string[];
  /** Extra Field 0x014F on this parse (or matching parse for a primary). */
  origin?: OriginSummary;
};

function clipForAgent(
  zipPath: string,
  entry: string,
  buf: Buffer,
  maxBytes: number,
  offset: number,
  preferBinary: boolean,
): ReadResult {
  if (preferBinary || !bufferLooksUtf8(buf)) {
    const clipped = clipBytes(buf, maxBytes, offset);
    return {
      package: zipPath,
      path: entry,
      encoding: "base64",
      truncated: clipped.truncated,
      totalBytes: clipped.totalBytes,
      offset,
      data: clipped.slice.toString("base64"),
      note: preferBinary
        ? "Binary entry streamed as base64 (prefer extract only if a filesystem path is required)."
        : "Non-UTF-8 payload streamed as base64.",
    };
  }
  const clipped = clipUtf8(buf, maxBytes, offset);
  return {
    package: zipPath,
    path: entry,
    encoding: "utf8",
    truncated: clipped.truncated,
    totalBytes: clipped.totalBytes,
    offset,
    text: clipped.text,
  };
}

export function readOkfIndex(args: {
  package?: string;
  maxBytes?: number;
  offset?: number;
}): ReadResult {
  const path = resolvePackagePath(args.package);
  return useZipHandle(path, () => readOkfIndexLoaded(path, args));
}

function readOkfIndexLoaded(
  path: string,
  args: { maxBytes?: number; offset?: number },
): ReadResult {
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const offset = args.offset ?? 0;
  const entries = listZipEntries(path);
  const indexPath = BUNDLE_PATHS.okfIndex;
  if (entryExists(entries, indexPath)) {
    const clipped = clipUtf8(readVerified(path, indexPath), maxBytes, offset);
    return {
      package: path,
      path: indexPath,
      encoding: "utf8",
      truncated: clipped.truncated,
      totalBytes: clipped.totalBytes,
      offset,
      text: clipped.text,
    };
  }
  return {
    package: path,
    path: null,
    note: "No OKF index; listing concept files under wiki/okf/",
    concepts: okfConceptPaths(entries),
  };
}

export function readOkf(args: {
  package?: string;
  path?: string;
  stem?: string;
  maxBytes?: number;
  offset?: number;
}): ReadResult {
  const zipPath = resolvePackagePath(args.package);
  return useZipHandle(zipPath, () => readOkfLoaded(zipPath, args));
}

function readOkfLoaded(
  zipPath: string,
  args: {
    path?: string;
    stem?: string;
    maxBytes?: number;
    offset?: number;
  },
): ReadResult {
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const offset = args.offset ?? 0;
  let entry = args.path?.trim();
  if (!entry && args.stem?.trim()) {
    const stem = args.stem.trim().replace(/\.md$/i, "");
    entry = `${BUNDLE_PATHS.okfRoot}${stem}.md`;
  }
  if (!entry) {
    throw new AccessError("Provide `path` (e.g. wiki/okf/foo.md) or `stem`.");
  }
  entry = normalizeEntryName(entry);
  if (!entry.startsWith(BUNDLE_PATHS.okfRoot)) {
    entry = `${BUNDLE_PATHS.okfRoot}${entry.replace(/^wiki\/okf\//, "")}`;
  }
  const clipped = clipUtf8(readVerified(zipPath, entry), maxBytes, offset);
  return {
    package: zipPath,
    path: entry,
    encoding: "utf8",
    truncated: clipped.truncated,
    totalBytes: clipped.totalBytes,
    offset,
    text: clipped.text,
  };
}

export function readParsed(args: {
  package?: string;
  path?: string;
  name?: string;
  maxBytes?: number;
  offset?: number;
}): ReadResult {
  const zipPath = resolvePackagePath(args.package);
  return useZipHandle(zipPath, () => readParsedLoaded(zipPath, args));
}

function readParsedLoaded(
  zipPath: string,
  args: {
    path?: string;
    name?: string;
    maxBytes?: number;
    offset?: number;
  },
): ReadResult {
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const offset = args.offset ?? 0;
  let entry = args.path?.trim();
  if (!entry && args.name?.trim()) {
    const name = args.name.trim();
    entry = name.startsWith(BUNDLE_PATHS.parsed)
      ? name
      : `${BUNDLE_PATHS.parsed}${name.endsWith(".md") ? name : `${name}.md`}`;
  }
  if (!entry) {
    throw new AccessError(
      "Provide `path` (e.g. wiki/parsed/doc.pdf.md) or `name`.",
    );
  }
  entry = normalizeEntryName(entry);
  const clipped = clipUtf8(readVerified(zipPath, entry), maxBytes, offset);
  const origin = originFromEntries(listZipEntries(zipPath), entry);
  return {
    package: zipPath,
    path: entry,
    encoding: "utf8",
    truncated: clipped.truncated,
    totalBytes: clipped.totalBytes,
    offset,
    text: clipped.text,
    ...(origin ? { origin } : {}),
  };
}

export function readEntry(args: {
  package?: string;
  path: string;
  maxBytes?: number;
  offset?: number;
  /** Force base64 even for UTF-8 text. */
  asBinary?: boolean;
}): ReadResult {
  const zipPath = resolvePackagePath(args.package);
  return useZipHandle(zipPath, () => readEntryLoaded(zipPath, args));
}

function readEntryLoaded(
  zipPath: string,
  args: {
    path: string;
    maxBytes?: number;
    offset?: number;
    asBinary?: boolean;
  },
): ReadResult {
  const entry = normalizeEntryName(args.path);
  if (!entry) {
    throw new AccessError("Provide `path` for the archive entry.");
  }
  const lower = entry.toLowerCase();
  const binaryish =
    /\.(png|jpe?g|gif|webp|pdf|zip|nzip|docx?|xlsx?|pptx?|bin|exe|dll|so|dylib)$/i.test(
      lower,
    );
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  const offset = args.offset ?? 0;
  const buf = readVerified(zipPath, entry);
  const preferBinary =
    args.asBinary === true ||
    (binaryish && !lower.endsWith(".md") && !lower.endsWith(".json"));
  const result = clipForAgent(zipPath, entry, buf, maxBytes, offset, preferBinary);
  const origin = originFromEntries(listZipEntries(zipPath), entry);
  return origin ? { ...result, origin } : result;
}

export function readEntries(args: {
  package?: string;
  paths: string[];
  maxBytes?: number;
  offset?: number;
  asBinary?: boolean;
}): ReadResult[] {
  const paths = args.paths.map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) {
    throw new AccessError("Provide at least one entry path.", "invalid_args");
  }
  const zipPath = resolvePackagePath(args.package);
  return useZipHandle(zipPath, () =>
    paths.map((path) =>
      readEntryLoaded(zipPath, {
        path,
        maxBytes: args.maxBytes,
        offset: args.offset,
        asBinary: args.asBinary,
      }),
    ),
  );
}

/** Always `META-INF/manifest.json` (raw JSON body). */
export function readManifest(args: {
  package?: string;
  maxBytes?: number;
}): ReadResult {
  return readEntry({
    package: args.package,
    path: BUNDLE_PATHS.manifest,
    maxBytes: args.maxBytes,
  });
}

/** Header line before a part when `read` dumps more than one entry. */
export function zipwikiReadBegin(path: string, encoding?: "utf8" | "base64"): string {
  const extra = encoding === "base64" ? " encoding=base64" : "";
  return `===== ZIPWIKI ${path}${extra} =====`;
}

export function zipwikiReadEnd(path: string): string {
  return `===== END ${path} =====`;
}

function payloadOf(r: ReadResult): string {
  if (r.encoding === "base64") return r.data ?? "";
  return r.text ?? "";
}

/**
 * Stdout body for `zipwiki read` / `read`.
 * One path: raw payload only (no headers).
 * Several paths: each part wrapped so an LLM can split files.
 */
export function formatReadStdout(results: ReadResult[]): string {
  if (results.length === 0) return "";
  if (results.length === 1) return payloadOf(results[0]!);
  return results
    .map((r) => {
      const path = r.path ?? "unknown";
      const body = payloadOf(r);
      const nl = body.endsWith("\n") ? "" : "\n";
      return `${zipwikiReadBegin(path, r.encoding)}\n${body}${nl}${zipwikiReadEnd(path)}`;
    })
    .join("\n\n");
}
