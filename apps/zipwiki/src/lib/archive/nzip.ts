/**
 * NeoZip / ZipWiki `.nzip` writer — APPNOTE 0.2 layout.
 *
 * ZipWiki pack CD order (not required by APPNOTE):
 *   META-INF/manifest.json
 *   {ai.root}/…                 (parsed + okf — written via on-disk wiki tree)
 *   <primary / source files…>
 *
 * Default integrity is ZIP CRC-32. Extra Field 0x014E (SHA-256) is opt-in.
 * Merkle v1 is computed only when a blockchain proof needs the root.
 */

import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  compressZipPayload,
  type CompressOptions,
  type ZipCompressionAlg,
} from "./compress.js";
import { contentMerkleRoot, isMetaInfPath } from "./merkle.js";
import {
  concatExtraFields,
  makeOriginExtra,
  originLocatorFromOriginal,
  originLocatorPresent,
  type OriginLocator,
} from "./origin-extra.js";
import {
  buildWikiSearchIndex,
  serializeWikiSearchIndex,
} from "../okf/search-index.js";

export const PACKAGE_SPEC_VERSION = "0.2.0" as const;
export const DEFAULT_AI_ROOT = "wiki" as const;
export const DEFAULT_PARSED_DIR = "parsed" as const;
export const DEFAULT_OKF_DIR = "okf" as const;
export const DEFAULT_OKF_VERSION = "0.2" as const;

const MANIFEST_ENTRY = "META-INF/manifest.json";
/** NeoZip Extra Field ID: SHA-256 of uncompressed payload (APPNOTE §7.1). */
const EF_NZIP_SHA256 = 0x014e;

export type AiRootName = "wiki" | "codex" | "ai" | "context";

export type EntryClass = "meta" | "ai" | "primary";

export type NeoZipAiOkf = {
  present: boolean;
  root?: string;
  index?: string;
  version?: string;
};

/** Compact per-page complexity / layout signals (LiteParse `includeComplexity`). */
export type NeoZipParseComplexityPage = {
  page: number;
  needsOcr: boolean;
  reasons: string[];
  textCoverage?: number;
  isGarbled?: boolean;
  layoutComplex?: boolean;
  layoutReasons?: string[];
  columnCount?: number;
  ruledTableCount?: number;
  textTableRunCount?: number;
  figureCount?: number;
};

/** Package-level rollup of LiteParse complexity (not a parse-accuracy score). */
export type NeoZipParseComplexity = {
  pageCount: number;
  needsOcrCount: number;
  needsOcrRatio: number;
  layoutComplexCount: number;
  layoutComplexRatio: number;
  reasonCounts: Record<string, number>;
  layoutReasonCounts: Record<string, number>;
  maxColumnCount: number;
  pages: NeoZipParseComplexityPage[];
};

/**
 * Aggregate of per-text-item OCR `confidence` values when present.
 * Native PDF text usually has no confidence; scoredItemCount is then 0.
 */
export type NeoZipOcrConfidence = {
  totalItemCount: number;
  scoredItemCount: number;
  mean?: number;
  min?: number;
  max?: number;
};

export type NeoZipAiParser = {
  engine?: string;
  engineVersion?: string;
  notes?: string;
  /** True when complexity was collected during pack. */
  includeComplexity?: boolean;
  complexity?: NeoZipParseComplexity;
  ocrConfidence?: NeoZipOcrConfidence;
  /** Optional routing metadata (e.g. auto-escalation from LiteParse). */
  route?: {
    mode?: "fixed" | "auto";
    escalatedFrom?: string;
    reason?: string;
  };
};

/**
 * Advisory per-primary summary for agents (APPNOTE §4.3).
 * Not an inventory — ZIP central directory + 0x014E remain authoritative for
 * basename / SHA-256; OKF frontmatter holds the per-file description.
 */
export type NeoZipAiPrimary = {
  /** Zip entry path after collision rewrite (e.g. `report.pdf` or `content/2/report.pdf`). */
  path: string;
  mimeType?: string;
  documentType?: string;
  /** True when `{ai.root}/parsed/{path}.md` is present in this package. */
  hasParsed: boolean;
  /**
   * False when the original primary bytes were intentionally omitted (parse-only
   * for document formats). Defaults to true / omitted from JSON when included.
   */
  sourceIncluded?: boolean;
};

export type NeoZipAi = {
  root: AiRootName | string;
  parsedDir?: string;
  primaryCount?: number;
  parsedCount?: number;
  assetEntryCount?: number;
  digest?: string;
  okf?: NeoZipAiOkf;
  parser?: NeoZipAiParser;
  /** Optional advisory file summary; CD is the inventory. */
  primaries?: NeoZipAiPrimary[];
};

/** AI-support control surface (APPNOTE §4). No package-level inventory. */
export type NeoZipManifest = {
  format: "neozip";
  specVersion: string;
  createdAt: string;
  profiles?: string[];
  ai?: NeoZipAi;
};

/** OKF file relative to `{aiRoot}/okf/` (e.g. `document.md`). */
export type OkfWriteFile = {
  name: string;
  data: string | Buffer;
};

export type OkfWriteInput = {
  files: OkfWriteFile[];
  /** OKF language version for `ai.okf.version` (default `0.2`). */
  version?: string;
};

export type BundleWriteInput = {
  /** Destination `.nzip` path on disk. */
  outputPath: string;
  /** Absolute path to the pristine original file. */
  originalPath: string;
  /** Entry name for the original inside the zip (usually the basename). */
  originalName: string;
  mimeType?: string;
  documentType?: string;
  /** Whole-document markdown under `{ai.root}/parsed/{P}.md`. */
  structuredMarkdown?: string;
  /** Optional one-line digest for `ai.digest`. */
  digest?: string;
  /** AI root directory name (default `codex`). */
  aiRoot?: AiRootName | string;
  parserEngine?: string;
  /** Optional OKF bundle files under `{ai.root}/okf/`. */
  okf?: OkfWriteInput;
  /**
   * Optional parser metadata for `ai.parser` (engine, complexity, OCR confidence).
   * Merged over `{ engine: parserEngine ?? "liteparse" }`.
   */
  parser?: NeoZipAiParser;
  /** ZIP compression (default zstd level 7). */
  compression?: ZipCompressionAlg;
  level?: number;
  deflate?: boolean;
  legacy?: boolean;
  storeSuffixes?: string[];
  /**
   * When true, parsed `{ai.root}/parsed/{P}.md` entries use the source file's
   * modification time. Default: pack time.
   */
  parsedMtimeFromOriginal?: boolean;
  /** Write Extra Field 0x014E (SHA-256 of each member). Default: omit. */
  sha256Extra?: boolean;
  /** Include SHA-256 of original bytes in Extra Field 0x014F (instead of CRC-32). Default: CRC-32. */
  originSha256?: boolean;
  /** Compute Merkle v1 root (blockchain proofs). Default: skip. */
  computeMerkle?: boolean;
};

export type CollectionMemberInput = {
  originalPath: string;
  originalName: string;
  mimeType?: string;
  documentType?: string;
  /**
   * Whole-document markdown under `{ai.root}/parsed/{P}.md`.
   * Omit or leave undefined when extract failed — no parse entry is written
   * and `ai.primaries[].hasParsed` is false.
   */
  structuredMarkdown?: string;
  digest?: string;
  /**
   * When true and a parse exists for an omittable document format (pdf, docx,
   * raster images, …), store only the parsed extract in the .nzip (not the
   * original bytes). Plain text and markdown are always stored as-is.
   */
  omitOriginal?: boolean;
  /**
   * Absolute URI for the original (Extra Field 0x014F on the parse entry).
   * Size and Unix mtime are taken from the original bytes / stat at pack
   * time when available. Original integrity is CRC-32 by default, or
   * SHA-256 when the writer sets `originSha256` (not both).
   */
  originUri?: string;
};

export type CollectionWriteInput = {
  outputPath: string;
  title?: string;
  digest?: string;
  members: CollectionMemberInput[];
  aiRoot?: AiRootName | string;
  parserEngine?: string;
  /** Optional package-level OKF under `{ai.root}/okf/`. */
  okf?: OkfWriteInput;
  /** Optional parser metadata for `ai.parser`. */
  parser?: NeoZipAiParser;
  /** ZIP compression (default zstd level 7). */
  compression?: ZipCompressionAlg;
  level?: number;
  deflate?: boolean;
  legacy?: boolean;
  storeSuffixes?: string[];
  /**
   * When true (default), parsed document members store extract only in the
   * .nzip — not the original file bytes (same as `omitOriginal` per member).
   */
  omitOriginalDocuments?: boolean;
  /**
   * Package root used to materialize `META-INF/` + `{ai.root}/` before zipping.
   * Defaults to a temp directory (removed after write unless `keepWikiDir`).
   */
  wikiDir?: string;
  /** Keep a temp wikiDir after the .nzip is written (named wikiDir is always kept). */
  keepWikiDir?: boolean;
  /**
   * When true, parsed `{ai.root}/parsed/{P}.md` entries use the source file's
   * modification time. Manifest and OKF still use pack time. Default: false.
   */
  parsedMtimeFromOriginal?: boolean;
  /**
   * Write Extra Field 0x014E (SHA-256 of each member’s uncompressed payload).
   * Default: omit (ZIP CRC-32 only).
   */
  sha256Extra?: boolean;
  /**
   * Include SHA-256 of original primary bytes in Extra Field 0x014F on the
   * parse member (instead of CRC-32). Default: CRC-32 only.
   */
  originSha256?: boolean;
  /**
   * Compute Merkle v1 over non-META-INF members. Default: skip (only needed
   * when binding TOKEN.NZIP / TIMESTAMP.NZIP).
   */
  computeMerkle?: boolean;
};

export type CollectionWriteResult = {
  bundlePath: string;
  /** Present only when `computeMerkle` was set. */
  merkleRoot?: string;
  size: number;
  memberPaths: string[];
  /** On-disk package root used for the wiki tree (temp or `wikiDir`). */
  wikiDir?: string;
};

export type BundleWriteResult = {
  bundlePath: string;
  /** SHA-256 of the original primary; only set when `sha256Extra` is true. */
  contentSha256?: string;
  /** Present only when `computeMerkle` was set. */
  merkleRoot?: string;
  size: number;
};

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256Digest(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

function sha256Hex(buf: Buffer): string {
  return sha256Digest(buf).toString("hex");
}

export type ZipArchiveEntry = {
  name: string;
  /** Uncompressed payload (used to compress, or to recompute Merkle). */
  data: Buffer;
  /** Optional modification time (defaults to pack time). Ignored when `precompressed` is set. */
  mtime?: Date;
  /**
   * Optional original attributes (Extra Field 0x014F). Typically set on
   * `wiki/parsed/{P}.md` when the primary is remote/omitted. Each field is
   * independently optional. Ignored when `precompressed` is set (extras copied).
   */
  origin?: OriginLocator;
  /**
   * Copy this member’s compressed bytes without recompressing. When set,
   * `data` is still the uncompressed payload (for Merkle / verify).
   */
  precompressed?: ZipPrecompressed;
};

/** Existing compressed member copied into a rewritten archive. */
export type ZipPrecompressed = {
  method: number;
  /** Compressed payload (local-file data). */
  data: Buffer;
  crc32: number;
  uncompressedSize: number;
  /** Local/central Extra Field blob (0x014E, optional 0x014F, …). */
  extra: Buffer;
  dosTime: number;
  dosDate: number;
};

/** @deprecated Use {@link ZipArchiveEntry}. */
type ZipEntry = ZipArchiveEntry;

/** MS-DOS date/time used in ZIP local + central headers. */
export function toDosDateTime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const y = Math.max(0, Math.min(127, year - 1980));
  return {
    time: ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
    date: ((y & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
  };
}

/**
 * Classify a zip entry path under APPNOTE §3.1.
 * `aiRoot` is the declared root name without trailing slash (e.g. `codex`).
 */
export function classifyEntry(
  path: string,
  aiRoot: string = DEFAULT_AI_ROOT,
): EntryClass {
  const p = path.replace(/\\/g, "/");
  if (isMetaInfPath(p) || p.toLowerCase() === "meta-inf") {
    return "meta";
  }
  const root = aiRoot.replace(/\/+$/, "");
  if (p === root || p.startsWith(`${root}/`)) {
    return "ai";
  }
  return "primary";
}

/** Path for parsed markdown of primary `P` (APPNOTE §4.3). */
export function parsedPathFor(
  primaryPath: string,
  aiRoot: string = DEFAULT_AI_ROOT,
  parsedDir: string = DEFAULT_PARSED_DIR,
): string {
  const p = primaryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${aiRoot.replace(/\/+$/, "")}/${parsedDir.replace(/\/+$/, "")}/${p}.md`;
}

/** On-disk parse filename: original basename with `.md` appended (`report.pdf.md`). */
export function parsedMarkdownFileName(primaryPath: string): string {
  const p = primaryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const base = p.split("/").pop() ?? p;
  return `${base}.md`;
}

/** Zip entry path for an OKF file under `{aiRoot}/okf/`. */
export function okfPathFor(
  relativeName: string,
  aiRoot: string = DEFAULT_AI_ROOT,
  okfDir: string = DEFAULT_OKF_DIR,
): string {
  const name = relativeName.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${aiRoot.replace(/\/+$/, "")}/${okfDir.replace(/\/+$/, "")}/${name}`;
}

function toOkfZipEntries(
  okf: OkfWriteInput | undefined,
  aiRoot: string,
): ZipEntry[] {
  if (!okf?.files?.length) return [];
  return okf.files.map((f) => ({
    name: okfPathFor(f.name, aiRoot),
    data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf-8"),
  }));
}

function okfManifestBlock(
  okf: OkfWriteInput | undefined,
  aiRoot: string,
): NeoZipAiOkf | undefined {
  if (!okf?.files?.length) return undefined;
  const root = `${aiRoot.replace(/\/+$/, "")}/${DEFAULT_OKF_DIR}/`;
  const hasIndex = okf.files.some(
    (f) => f.name.replace(/\\/g, "/") === "index.md",
  );
  return {
    present: true,
    root,
    index: hasIndex ? `${root}index.md` : undefined,
    version: okf.version ?? DEFAULT_OKF_VERSION,
  };
}

/**
 * Document formats whose originals may be omitted when a parse exists.
 * Plain text, markdown, and CSV always keep their primary bytes.
 */
const OMITTABLE_DOCUMENT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".docm",
  ".dot",
  ".dotm",
  ".dotx",
  ".odt",
  ".ott",
  ".rtf",
  ".pages",
  ".ppt",
  ".pptx",
  ".pptm",
  ".pot",
  ".potm",
  ".potx",
  ".odp",
  ".otp",
  ".key",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".ods",
  ".ots",
  ".numbers",
]);

/** True when `name` is a binary/office document eligible for omit-original. */
export function isOmittableDocumentSource(name: string): boolean {
  const base = basename(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  return OMITTABLE_DOCUMENT_EXTENSIONS.has(base.slice(dot));
}

/**
 * Verify parse pairing (APPNOTE §3.2). Returns orphan parse paths that lack a
 * primary. Pass `allowedMissingPrimaries` when originals were intentionally
 * omitted (parse-only document packages).
 */
export function findOrphanParses(
  entryNames: string[],
  aiRoot: string = DEFAULT_AI_ROOT,
  parsedDir: string = DEFAULT_PARSED_DIR,
  allowedMissingPrimaries?: ReadonlySet<string>,
): string[] {
  const names = new Set(entryNames.map((n) => n.replace(/\\/g, "/")));
  const root = aiRoot.replace(/\/+$/, "");
  const prefix = `${root}/${parsedDir.replace(/\/+$/, "")}/`;
  const orphans: string[] = [];

  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".md")) continue;
    if (name.includes(".assets/")) continue;
    const primary = name.slice(prefix.length, -".md".length);
    if (names.has(primary)) continue;
    if (allowedMissingPrimaries?.has(primary)) continue;
    orphans.push(name);
  }
  return orphans;
}

/**
 * Assign unique content entry paths. Prefer basename; on collision use
 * `content/<n>/<basename>`.
 */
export function assignContentPaths(names: string[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const base = basename(name).replace(/\\/g, "/");
    if (!used.has(base)) {
      used.add(base);
      out.push(base);
      continue;
    }
    let n = 2;
    let candidate = `content/${n}/${base}`;
    while (used.has(candidate)) {
      n++;
      candidate = `content/${n}/${base}`;
    }
    used.add(candidate);
    out.push(candidate);
  }
  return out;
}

function makeSha256Extra(digest: Buffer): Buffer {
  if (digest.length !== 32) {
    throw new Error("0x014E requires a 32-byte SHA-256 digest");
  }
  const extra = Buffer.alloc(4 + 32);
  extra.writeUInt16LE(EF_NZIP_SHA256, 0);
  extra.writeUInt16LE(32, 2);
  digest.copy(extra, 4);
  return extra;
}

/** Build local/central Extra Field blob: optional 0x014E, optional 0x014F. */
function makeEntryExtra(
  digest: Buffer | undefined,
  origin?: OriginLocator,
): Buffer {
  const parts: Buffer[] = [];
  if (digest) parts.push(makeSha256Extra(digest));
  if (originLocatorPresent(origin)) parts.push(makeOriginExtra(origin));
  return concatExtraFields(...parts);
}

function buildAiParser(
  parserEngine: string | undefined,
  parser?: NeoZipAiParser,
): NeoZipAiParser {
  return {
    ...parser,
    engine: parser?.engine ?? parserEngine ?? "liteparse",
  };
}

export type BuildNeoZipManifestInput = {
  createdAt?: string;
  profiles?: string[];
  /** AI root directory name (default `codex`). */
  aiRoot?: AiRootName | string;
  /** Package-level one-line summary. */
  digest?: string;
  /** Advisory per-primary summaries (APPNOTE §4.3.1). */
  primaries: NeoZipAiPrimary[];
  /**
   * OKF either as pack input files, or a pre-built `ai.okf` block.
   * Omit when no OKF is present.
   */
  okf?: OkfWriteInput | NeoZipAiOkf;
  parserEngine?: string;
  parser?: NeoZipAiParser;
  parsedDir?: string;
  /** Override `ai.parsedCount` (defaults to primaries with `hasParsed`). */
  parsedCount?: number;
  assetEntryCount?: number;
};

function resolveOkfBlock(
  okf: OkfWriteInput | NeoZipAiOkf | undefined,
  aiRoot: string,
): NeoZipAiOkf | undefined {
  if (!okf) return undefined;
  if ("present" in okf) {
    return okf.present ? okf : undefined;
  }
  return okfManifestBlock(okf, aiRoot);
}

/**
 * Build APPNOTE §4 `META-INF/manifest.json` body from parse + OKF signals.
 * Used by the `.nzip` writer and the standalone `zipwiki manifest` / `okf` flow.
 */
export function buildNeoZipManifest(
  input: BuildNeoZipManifestInput,
): NeoZipManifest {
  const aiRoot = (input.aiRoot ?? DEFAULT_AI_ROOT).replace(/\/+$/, "");
  const parsedDir = (input.parsedDir ?? DEFAULT_PARSED_DIR).replace(/\/+$/, "");
  const primaries = input.primaries;
  const parsedCount =
    input.parsedCount ?? primaries.filter((p) => p.hasParsed).length;
  const aiOkf = resolveOkfBlock(input.okf, aiRoot);
  const digest = input.digest?.trim() || undefined;

  return {
    format: "neozip",
    specVersion: PACKAGE_SPEC_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    profiles: input.profiles ?? ["zipwiki"],
    ai: {
      root: aiRoot,
      parsedDir,
      primaryCount: primaries.length,
      parsedCount,
      ...(input.assetEntryCount !== undefined
        ? { assetEntryCount: input.assetEntryCount }
        : {}),
      ...(digest ? { digest } : {}),
      ...(aiOkf ? { okf: aiOkf } : {}),
      parser: buildAiParser(input.parserEngine, input.parser),
      ...(primaries.length > 0 ? { primaries } : {}),
    },
  };
}

/**
 * Serialize a NeoZip manifest as pretty UTF-8 JSON with trailing newline.
 */
export function serializeNeoZipManifest(manifest: NeoZipManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Write a single-primary ZipWiki package (APPNOTE 0.2).
 * Same bundle layout as multi-primary — delegates to {@link writeNzipCollectionBundle}.
 */
export function writeNzipBundle(input: BundleWriteInput): BundleWriteResult {
  const result = writeNzipCollectionBundle({
    outputPath: input.outputPath,
    digest: input.digest,
    members: [
      {
        originalPath: input.originalPath,
        originalName: input.originalName,
        mimeType: input.mimeType,
        documentType: input.documentType,
        ...(input.structuredMarkdown
          ? { structuredMarkdown: input.structuredMarkdown }
          : {}),
        digest: input.digest,
      },
    ],
    aiRoot: input.aiRoot,
    parserEngine: input.parserEngine,
    okf: input.okf,
    parser: input.parser,
    compression: input.compression,
    level: input.level,
    deflate: input.deflate,
    legacy: input.legacy,
    storeSuffixes: input.storeSuffixes,
    parsedMtimeFromOriginal: input.parsedMtimeFromOriginal,
    sha256Extra: input.sha256Extra,
    originSha256: input.originSha256,
    computeMerkle: input.computeMerkle,
  });
  return {
    bundlePath: result.bundlePath,
    ...(input.sha256Extra === true
      ? { contentSha256: sha256Hex(readFileSync(input.originalPath)) }
      : {}),
    ...(result.merkleRoot ? { merkleRoot: result.merkleRoot } : {}),
    size: result.size,
  };
}

function writeEntryFile(root: string, entryName: string, data: Buffer): void {
  const abs = join(root, entryName);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
}

/**
 * Write a multi-primary ZipWiki package (APPNOTE 0.2): N primaries + N parse
 * files (N >= 1). Single-file packages use the same bundle layout.
 *
 * Materializes AI wiki (+ META-INF) under `wikiDir` or a temp root, then writes
 * the .nzip as: manifest → wiki → source primaries (read from each member's
 * `originalPath`; primaries are not copied into the stage root).
 */
export function writeNzipCollectionBundle(
  input: CollectionWriteInput,
): CollectionWriteResult {
  if (input.members.length < 1) {
    throw new Error("package requires at least one member");
  }

  const contentPaths = assignContentPaths(
    input.members.map((m) => m.originalName),
  );
  const aiRoot = (input.aiRoot ?? DEFAULT_AI_ROOT).replace(/\/+$/, "");

  const loaded = input.members.map((m, i) => {
    const data = readFileSync(m.originalPath);
    const mtime = statSync(m.originalPath).mtime;
    const path = contentPaths[i]!;
    const structuredMarkdown =
      typeof m.structuredMarkdown === "string" &&
      m.structuredMarkdown.length > 0
        ? m.structuredMarkdown
        : undefined;
    const hasParsed = structuredMarkdown !== undefined;
    const omitOriginal =
      hasParsed &&
      isOmittableDocumentSource(path) &&
      (m.omitOriginal === true || input.omitOriginalDocuments === true);
    return {
      path,
      originalName: basename(m.originalName).replace(/\\/g, "/"),
      data,
      mimeType: m.mimeType,
      documentType: m.documentType,
      structuredMarkdown,
      hasParsed,
      sourceIncluded: !omitOriginal,
      mtime,
      originUri: m.originUri?.trim() || undefined,
    };
  });

  const byPath = [...loaded].sort((a, b) =>
    Buffer.from(a.path, "utf-8").compare(Buffer.from(b.path, "utf-8")),
  );

  const digest = input.digest?.trim() || undefined;

  const okfEntries = toOkfZipEntries(input.okf, aiRoot);
  const parsedMembers = byPath.filter((m) => m.hasParsed);
  const includedPrimaries = byPath.filter((m) => m.sourceIncluded);
  const omittedPrimaries = byPath.filter((m) => !m.sourceIncluded);

  const searchIndex = buildWikiSearchIndex(
    okfEntries.map((e) => ({ name: e.name, data: e.data.toString("utf8") })),
    `${aiRoot.replace(/\/+$/, "")}/${DEFAULT_OKF_DIR}/`,
  );
  const searchEntry =
    searchIndex.documents.length > 0
      ? {
          name: `${aiRoot.replace(/\/+$/, "")}/search.json`,
          data: Buffer.from(serializeWikiSearchIndex(searchIndex), "utf8"),
        }
      : undefined;

  const wikiEntries: ZipEntry[] = [
    ...parsedMembers.map((m) => {
      const origin = originLocatorFromOriginal({
        data: m.data,
        mtime: m.mtime,
        uri: m.originUri,
        includeSha256: input.originSha256 === true,
      });
      const writeOrigin =
        Boolean(m.originUri) ||
        !m.sourceIncluded ||
        input.originSha256 === true;
      return {
        name: parsedPathFor(m.path, aiRoot),
        data: Buffer.from(m.structuredMarkdown!, "utf-8"),
        ...(input.parsedMtimeFromOriginal ? { mtime: m.mtime } : {}),
        ...(writeOrigin && originLocatorPresent(origin) ? { origin } : {}),
      };
    }),
    ...okfEntries,
    ...(searchEntry ? [searchEntry] : []),
  ].sort((a, b) =>
    Buffer.from(a.name, "utf-8").compare(Buffer.from(b.name, "utf-8")),
  );

  const merkleRoot =
    input.computeMerkle === true
      ? contentMerkleRoot(
          [
            ...includedPrimaries.map((m) => ({
              path: m.path,
              content: m.data,
            })),
            ...wikiEntries.map((e) => ({ path: e.name, content: e.data })),
          ],
        )
      : undefined;
  const createdAt = new Date().toISOString();

  const aiOkf = okfManifestBlock(input.okf, aiRoot);
  const primaries: NeoZipAiPrimary[] = byPath.map((m) => ({
    path: m.path,
    ...(m.mimeType ? { mimeType: m.mimeType } : {}),
    ...(m.documentType ? { documentType: m.documentType } : {}),
    hasParsed: m.hasParsed,
    ...(m.sourceIncluded ? {} : { sourceIncluded: false }),
  }));
  const neoManifest = buildNeoZipManifest({
    createdAt,
    aiRoot,
    digest,
    primaries,
    okf: aiOkf,
    parserEngine: input.parserEngine,
    parser: input.parser,
    profiles:
      input.sha256Extra === true
        ? ["integrity", "zipwiki"]
        : ["zipwiki"],
  });
  const manifestData = Buffer.from(
    serializeNeoZipManifest(neoManifest),
    "utf-8",
  );

  const explicitWikiDir = input.wikiDir?.trim();
  const wikiRoot = explicitWikiDir
    ? explicitWikiDir
    : mkdtempSync(join(tmpdir(), "zipwiki-wiki-"));
  const keepWiki =
    Boolean(explicitWikiDir) || input.keepWikiDir === true;
  mkdirSync(wikiRoot, { recursive: true });

  try {
    writeEntryFile(wikiRoot, MANIFEST_ENTRY, manifestData);
    for (const entry of wikiEntries) {
      writeEntryFile(wikiRoot, entry.name, entry.data);
    }

    // ZipWiki pack order (not APPNOTE-required): manifest → wiki → sources.
    const entries: ZipEntry[] = [
      { name: MANIFEST_ENTRY, data: manifestData },
      ...wikiEntries,
      ...includedPrimaries.map((m) => ({
        name: m.path,
        data: m.data,
        mtime: m.mtime,
      })),
    ];

    const orphans = findOrphanParses(
      entries.map((e) => e.name),
      aiRoot,
      DEFAULT_PARSED_DIR,
      new Set(omittedPrimaries.map((m) => m.path)),
    );
    if (orphans.length > 0) {
      throw new Error(`orphan parse entries: ${orphans.join(", ")}`);
    }

    mkdirSync(dirname(input.outputPath), { recursive: true });
    const zip = buildZip(entries, {
      compression: input.compression,
      level: input.level,
      deflate: input.deflate,
      legacy: input.legacy,
      storeSuffixes: input.storeSuffixes,
      sha256Extra: input.sha256Extra === true,
    });
    writeFileSync(input.outputPath, zip);
    return {
      bundlePath: input.outputPath,
      ...(merkleRoot ? { merkleRoot } : {}),
      size: zip.length,
      memberPaths: includedPrimaries.map((m) => m.path),
      ...(keepWiki ? { wikiDir: wikiRoot } : {}),
    };
  } finally {
    if (!keepWiki) {
      rmSync(wikiRoot, { recursive: true, force: true });
    }
  }
}

/**
 * Build a ZIP. Default integrity is ZIP CRC-32. Extra Field 0x014E is
 * written when `sha256Extra` is true; Extra Field 0x014F when `origin` is set.
 * Default compression is zstd (method 93); deflate (8) and store (0) supported.
 */
export type WriteZipOptions = CompressOptions & {
  /** Write Extra Field 0x014E on newly compressed members. Default false. */
  sha256Extra?: boolean;
};

export function writeZipBuffer(
  entries: ZipArchiveEntry[],
  compressOpts: WriteZipOptions = {},
): Buffer {
  return buildZip(entries, compressOpts);
}

function buildZip(
  entries: ZipEntry[],
  compressOpts: WriteZipOptions = {},
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const packTime = new Date();

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf-8");
    const copied = entry.precompressed;
    const uncompressed = entry.data;
    const crc = copied ? copied.crc32 >>> 0 : crc32(uncompressed);
    const extra = copied
      ? copied.extra
      : makeEntryExtra(
          compressOpts.sha256Extra === true
            ? sha256Digest(uncompressed)
            : undefined,
          entry.origin,
        );
    const extraLen = extra.length;
    const { time: dosTime, date: dosDate } = copied
      ? { time: copied.dosTime, date: copied.dosDate }
      : toDosDateTime(entry.mtime ?? packTime);

    const payload = copied
      ? {
          method: copied.method,
          data: copied.data,
          compressedSize: copied.data.length,
          uncompressedSize: copied.uncompressedSize,
        }
      : compressZipPayload(uncompressed, {
          ...compressOpts,
          entryName: entry.name,
        });
    const method = payload.method;
    const versionNeeded = method === 93 ? 63 : 20;

    const local = Buffer.alloc(30 + nameBuf.length + extraLen);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(versionNeeded, 4);
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.compressedSize, 18);
    local.writeUInt32LE(payload.uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(extraLen, 28);
    nameBuf.copy(local, 30);
    extra.copy(local, 30 + nameBuf.length);

    const central = Buffer.alloc(46 + nameBuf.length + extraLen);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(versionNeeded, 4); // version made by
    central.writeUInt16LE(versionNeeded, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.compressedSize, 20);
    central.writeUInt32LE(payload.uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(extraLen, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    extra.copy(central, 46 + nameBuf.length);

    localParts.push(local, payload.data);
    centralParts.push(central);
    offset += local.length + payload.data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}
