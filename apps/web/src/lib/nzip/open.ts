import {
  BUNDLE_PATHS,
  listZipEntriesFromBuffer,
  readZipEntryText,
  zipMethodLabel,
  type ZipListEntry,
} from "./zip";

export type NzipPrimary = {
  path?: string;
  name?: string;
  [key: string]: unknown;
};

export type NzipOpenSummary = {
  filename: string;
  byteLength: number;
  format: unknown;
  specVersion: unknown;
  profiles: unknown;
  aiRoot: string;
  primaryCount: number;
  primaries: NzipPrimary[];
  okf: {
    present: boolean;
    root: string;
    index: string;
    version: unknown;
    concepts: string[];
  };
  parsed: string[];
  origins: Array<{
    parsedPath: string;
    primaryPath: string | null;
    originUri?: string;
    originCrc32?: string;
    originSize?: number;
    originMtime?: number;
    originMtimeUtc?: string;
    originSha256?: string;
  }>;
  methods: string[];
  entries: ZipListEntry[];
  entryCount: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Open a .nzip ArrayBuffer and return overview + contents inventory
 * (browser open sequence aligned with MCP open).
 */
export async function openNzip(
  buf: ArrayBuffer,
  filename: string,
): Promise<NzipOpenSummary> {
  const entries = listZipEntriesFromBuffer(buf);
  const files = entries.filter((e) => !e.name.endsWith("/"));

  let manifest: Record<string, unknown> | null = null;
  const man = files.find((e) => e.name === BUNDLE_PATHS.manifest);
  if (!man) {
    throw new Error(`Missing ${BUNDLE_PATHS.manifest} — not a ZipWiki .nzip`);
  }
  try {
    const raw = await readZipEntryText(buf, entries, BUNDLE_PATHS.manifest);
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read manifest: ${msg}`);
  }

  const ai = asRecord(manifest.ai);
  const okfMeta = asRecord(ai?.okf);
  const primariesRaw = Array.isArray(ai?.primaries) ? ai.primaries : [];
  const primaries = primariesRaw.filter(
    (p): p is NzipPrimary => Boolean(p) && typeof p === "object",
  );

  const okfConcepts = files
    .filter(
      (e) =>
        e.name.startsWith(BUNDLE_PATHS.okfRoot) &&
        e.name.endsWith(".md") &&
        e.name !== BUNDLE_PATHS.okfIndex &&
        !e.name.endsWith("/index.md") &&
        !e.name.endsWith("/log.md"),
    )
    .map((e) => e.name)
    .sort();

  const parsed = files
    .filter((e) => e.name.startsWith(BUNDLE_PATHS.parsed))
    .map((e) => e.name)
    .sort();

  const aiRoot =
    typeof ai?.root === "string" ? ai.root : BUNDLE_PATHS.aiRoot;
  const parsePrefix = `${aiRoot.replace(/\/+$/, "")}/parsed/`;
  const origins = files
    .filter(
      (e) =>
        e.originUri !== undefined ||
        e.originCrc32 !== undefined ||
        e.originSize !== undefined ||
        e.originMtime !== undefined ||
        e.originSha256 !== undefined,
    )
    .map((e) => ({
      parsedPath: e.name,
      primaryPath:
        e.name.startsWith(parsePrefix) && e.name.endsWith(".md")
          ? e.name.slice(parsePrefix.length, -".md".length)
          : null,
      ...(e.originUri ? { originUri: e.originUri } : {}),
      ...(e.originCrc32 !== undefined ? { originCrc32: e.originCrc32 } : {}),
      ...(e.originSize !== undefined ? { originSize: e.originSize } : {}),
      ...(e.originMtime !== undefined ? { originMtime: e.originMtime } : {}),
      ...(e.originMtimeUtc ? { originMtimeUtc: e.originMtimeUtc } : {}),
      ...(e.originSha256 ? { originSha256: e.originSha256 } : {}),
    }));

  const originByPrimary = new Map(
    origins
      .filter((o) => o.primaryPath)
      .map((o) => {
        const fields = {
          ...(o.originUri ? { originUri: o.originUri } : {}),
          ...(o.originCrc32 !== undefined ? { originCrc32: o.originCrc32 } : {}),
          ...(o.originSize !== undefined ? { originSize: o.originSize } : {}),
          ...(o.originMtime !== undefined ? { originMtime: o.originMtime } : {}),
          ...(o.originMtimeUtc ? { originMtimeUtc: o.originMtimeUtc } : {}),
          ...(o.originSha256 ? { originSha256: o.originSha256 } : {}),
        };
        return [o.primaryPath!, fields] as const;
      }),
  );
  const primariesEnriched = primaries.map((p) => {
    const pathKey =
      typeof p.path === "string"
        ? p.path
        : typeof p.name === "string"
          ? p.name
          : null;
    if (pathKey && originByPrimary.has(pathKey)) {
      return { ...p, ...originByPrimary.get(pathKey) };
    }
    return p;
  });

  const methodSet = new Set(files.map((e) => zipMethodLabel(e.method)));

  return {
    filename,
    byteLength: buf.byteLength,
    format: manifest.format ?? null,
    specVersion: manifest.specVersion ?? null,
    profiles: manifest.profiles ?? null,
    aiRoot,
    primaryCount:
      typeof ai?.primaryCount === "number"
        ? ai.primaryCount
        : primaries.length,
    primaries: primariesEnriched,
    okf: {
      present: Boolean(okfMeta?.present) || okfConcepts.length > 0,
      root:
        typeof okfMeta?.root === "string"
          ? okfMeta.root
          : BUNDLE_PATHS.okfRoot,
      index:
        typeof okfMeta?.index === "string"
          ? okfMeta.index
          : BUNDLE_PATHS.okfIndex,
      version: okfMeta?.version ?? null,
      concepts: okfConcepts,
    },
    parsed,
    origins,
    methods: [...methodSet].sort(),
    entries: files,
    entryCount: files.length,
  };
}

export { BUNDLE_PATHS, zipMethodLabel };
export type { ZipListEntry };
