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
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  createManifest,
  registerManifestBlock,
  serializeManifest,
  type NeoZipManifest as KitNeoZipManifest,
} from "neozipkit/node";
import { type ZipCompressionAlg } from "./compress.js";
import { isMetaInfPath } from "./merkle.js";
import {
  buildZipWithKit,
  buildZipWithKitMerkle,
  type WriteZipOptions,
} from "./neozipkit-writer.js";
import {
  originLocatorFromOriginal,
  originLocatorPresent,
  splitOriginRecord,
  type ManifestOrigin,
  type OriginRecordMode,
  type OriginLocator,
} from "./origin-extra.js";
export const PACKAGE_SPEC_VERSION = "0.2.0" as const;
export const DEFAULT_AI_ROOT = "wiki" as const;
export const DEFAULT_PARSED_DIR = "parsed" as const;
export const DEFAULT_OKF_DIR = "okf" as const;
export const DEFAULT_OKF_VERSION = "0.2" as const;

const MANIFEST_ENTRY = "META-INF/manifest.json";

export type AiRootName = "wiki" | "codex" | "ai" | "context";

export type EntryClass = "meta" | "ai" | "primary";

export type NeoZipAiOkf = {
  present: boolean;
  root?: string;
  index?: string;
  version?: string;
  /** Templates actually used (`book`, `legislation`, `invoice`). Omitted when every file stayed generic. */
  profiles?: string[];
};

export type NeoZipParserUse = {
  engine?: string;
  tier?: string;
  credential?: "zipwiki" | "user";
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
  /** LlamaParse tier. Omitted for LiteParse. */
  tier?: string;
  /** `zipwiki` credits or the machine Llama key. Omitted for LiteParse. */
  credential?: "zipwiki" | "user";
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
  /**
   * OKF enrichment profile for this primary (`book`, `legislation`, `invoice`,
   * or `generic`). Chosen once at pack so a later `okf_enrich` reuses it.
   */
  okfProfile?: string;
  /** Set when this file's parser differs from `ai.parser`. */
  parser?: NeoZipParserUse;
  /**
   * Original locator, size, and date. Omitted when the original is in the
   * ZIP and no URI was resolved. May also be carried on Extra Field 0x014F.
   */
  origin?: ManifestOrigin;
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
  /** Sum of original file sizes, in bytes, measured at pack time. */
  originalBytes?: number;
  assetEntryCount?: number;
  digest?: string;
  /** Plain statement copied from `.zipwiki-notice.md`. Not a document summary. */
  notice?: string;
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
  /** OKF profile stored on `ai.primaries[].okfProfile`. */
  okfProfile?: string;
  /** Parser used for this file. Uniform values are lifted onto `ai.parser`. */
  parser?: NeoZipParserUse;
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
  /**
   * Figure files for `{ai.root}/parsed/{P}.assets/`.
   * `name` is the file name; the markdown href is `{basename}.assets/{name}`.
   */
  assets?: Array<{ name: string; data: Buffer }>;
};

export type CollectionWriteInput = {
  outputPath: string;
  title?: string;
  digest?: string;
  /** Copied from `.zipwiki-notice.md` in a pack folder. */
  notice?: string;
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
   * Where origin URI, size, and mtime are written. Default `manifest`.
   * CRC-32 (or origin SHA-256) stays on Extra Field 0x014F when the original
   * is omitted.
   */
  originRecord?: OriginRecordMode;
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

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
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

/** Zip path for one figure of primary `P`: `{root}/parsed/{P}.assets/{file}`. */
export function parsedAssetPath(
  primaryPath: string,
  fileName: string,
  aiRoot: string = DEFAULT_AI_ROOT,
  parsedDir: string = DEFAULT_PARSED_DIR,
): string {
  const p = primaryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const file = basename(fileName.replace(/\\/g, "/"));
  return `${aiRoot.replace(/\/+$/, "")}/${parsedDir.replace(/\/+$/, "")}/${p}.assets/${file}`;
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
  return okf.files
    .filter((f) => {
      const name = f.name.replace(/\\/g, "/");
      if (/(^|\/)topics\/pdf\.md$/i.test(name)) return false;
      return name.split("/").pop() !== "log.md";
    })
    .map((f) => ({
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
  ".epub",
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
 * Assign unique content entry paths. A relative path such as
 * `patient/report.pdf` is kept. On an exact collision, use
 * `content/<n>/<path>`.
 */
export function assignContentPaths(names: string[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!used.has(normalized)) {
      used.add(normalized);
      out.push(normalized);
      continue;
    }
    let n = 2;
    let candidate = `content/${n}/${normalized}`;
    while (used.has(candidate)) {
      n++;
      candidate = `content/${n}/${normalized}`;
    }
    used.add(candidate);
    out.push(candidate);
  }
  return out;
}

/** Path inside the archive, relative to the pack directory that contains the file. */
export function relativeContentPath(abs: string, roots: string[]): string {
  const file = resolve(abs);
  let best: string | null = null;
  let bestLen = -1;
  for (const root of roots) {
    const dir = resolve(root);
    const prefix = dir.endsWith(sep) ? dir : dir + sep;
    if (file.startsWith(prefix) && dir.length > bestLen) {
      best = relative(dir, file).split(sep).join("/");
      bestLen = dir.length;
    }
  }
  return best && best.length > 0 ? best : basename(file);
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
  /** Plain statement from `.zipwiki-notice.md`. */
  notice?: string;
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
  /** Sum of original file sizes. Omitted when the writer did not measure them. */
  originalBytes?: number;
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
  const notice = input.notice?.trim() || undefined;
  const recordedParser = normalizeParserRecords(primaries);
  const profiles = okfProfilesUsed(primaries);
  if (aiOkf && profiles) aiOkf.profiles = profiles;
  const parserRecord: NeoZipAiParser = {
    ...input.parser,
    ...(recordedParser ?? {}),
  };
  if (recordedParser?.engine === "mixed") {
    delete parserRecord.tier;
    delete parserRecord.credential;
  }

  const envelope = createManifest({
    specVersion: PACKAGE_SPEC_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    profiles: input.profiles ?? ["zipwiki"],
  });
  return {
    format: "neozip",
    specVersion: envelope.specVersion,
    createdAt: envelope.createdAt,
    ...(envelope.profiles ? { profiles: envelope.profiles } : {}),
    ai: {
      root: aiRoot,
      parsedDir,
      primaryCount: primaries.length,
      parsedCount,
      ...(input.originalBytes !== undefined
        ? { originalBytes: input.originalBytes }
        : {}),
      ...(input.assetEntryCount !== undefined
        ? { assetEntryCount: input.assetEntryCount }
        : {}),
      ...(digest ? { digest } : {}),
      ...(notice ? { notice } : {}),
      ...(aiOkf ? { okf: aiOkf } : {}),
      parser: buildAiParser(input.parserEngine, parserRecord),
      ...(primaries.length > 0 ? { primaries } : {}),
    },
  };
}

function notableOkfProfile(profile?: string): string | undefined {
  if (!profile || profile === "generic" || profile === "auto") return undefined;
  return profile;
}

function okfProfilesUsed(primaries: NeoZipAiPrimary[]): string[] | undefined {
  const found = new Set<string>();
  for (const primary of primaries) {
    const profile = notableOkfProfile(primary.okfProfile);
    if (profile) found.add(profile);
    if (primary.okfProfile && !profile) delete primary.okfProfile;
  }
  return found.size > 0 ? [...found] : undefined;
}

/** Lift a uniform parser onto `ai.parser`. Mixed engines stay on each primary. */
export function normalizeParserRecords(
  primaries: NeoZipAiPrimary[],
): NeoZipParserUse | undefined {
  const uses = primaries.filter((primary) => primary.parser?.engine);
  if (uses.length === 0) return undefined;
  const engines = new Set(uses.map((primary) => primary.parser!.engine));
  if (engines.size > 1) {
    return { engine: "mixed" };
  }
  if (uses.length < primaries.length) return undefined;
  const engine = uses[0]!.parser!.engine;
  const tiers = new Set(
    uses.map((primary) => primary.parser?.tier).filter((tier) => tier),
  );
  const credentials = new Set(
    uses
      .map((primary) => primary.parser?.credential)
      .filter((credential) => credential),
  );
  const tier = tiers.size === 1 ? [...tiers][0] : undefined;
  const credential = credentials.size === 1 ? [...credentials][0] : undefined;
  for (const primary of primaries) {
    const parser = primary.parser;
    if (!parser?.engine) continue;
    const sameTier = !parser.tier || parser.tier === tier;
    const sameCredential = !parser.credential || parser.credential === credential;
    if (parser.engine === engine && sameTier && sameCredential) {
      delete primary.parser;
    }
  }
  return {
    engine,
    ...(tier ? { tier } : {}),
    ...(credential ? { credential } : {}),
  };
}

/**
 * Serialize a NeoZip manifest as pretty UTF-8 JSON with trailing newline.
 */
export function serializeNeoZipManifest(manifest: NeoZipManifest): string {
  return serializeManifest(manifest as KitNeoZipManifest);
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
      okfProfile: m.okfProfile,
      parser: m.parser,
      manifestOrigin: undefined as ManifestOrigin | undefined,
      extraOrigin: undefined as OriginLocator | undefined,
      structuredMarkdown,
      hasParsed,
      sourceIncluded: !omitOriginal,
      mtime,
      originUri: m.originUri?.trim() || undefined,
      assets: (m.assets ?? [])
        .filter((asset) => asset.name.trim() && asset.data.length > 0)
        .map((asset) => ({
          name: basename(asset.name.replace(/\\/g, "/")),
          data: asset.data,
        })),
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

  for (const m of byPath) {
    const located = originLocatorFromOriginal({
      data: m.data,
      mtime: m.mtime,
      uri: m.originUri,
      includeSha256: input.originSha256 === true,
    });
    const split = splitOriginRecord({
      locator: located,
      record: input.originRecord,
      sourceIncluded: m.sourceIncluded,
      originSha256: input.originSha256 === true,
    });
    m.manifestOrigin = split.manifest;
    m.extraOrigin = split.extra;
  }

  const wikiEntries: ZipEntry[] = [
    ...parsedMembers.map((m) => ({
      name: parsedPathFor(m.path, aiRoot),
      data: Buffer.from(m.structuredMarkdown!, "utf-8"),
      ...(input.parsedMtimeFromOriginal ? { mtime: m.mtime } : {}),
      ...(m.extraOrigin && originLocatorPresent(m.extraOrigin)
        ? { origin: m.extraOrigin }
        : {}),
    })),
    ...parsedMembers.flatMap((m) =>
      m.assets.map((asset) => ({
        name: parsedAssetPath(m.path, asset.name, aiRoot),
        data: asset.data,
      })),
    ),
    ...okfEntries,
  ].sort((a, b) =>
    Buffer.from(a.name, "utf-8").compare(Buffer.from(b.name, "utf-8")),
  );

  const createdAt = new Date().toISOString();

  const aiOkf = okfManifestBlock(input.okf, aiRoot);
  const primaries: NeoZipAiPrimary[] = byPath.map((m) => ({
    path: m.path,
    ...(m.mimeType ? { mimeType: m.mimeType } : {}),
    ...(m.documentType ? { documentType: m.documentType } : {}),
    ...(m.okfProfile ? { okfProfile: m.okfProfile } : {}),
    ...(m.parser ? { parser: m.parser } : {}),
    ...(m.manifestOrigin ? { origin: m.manifestOrigin } : {}),
    hasParsed: m.hasParsed,
    ...(m.sourceIncluded ? {} : { sourceIncluded: false }),
  }));
  const assetEntryCount = parsedMembers.reduce(
    (count, member) => count + member.assets.length,
    0,
  );
  const neoManifest = buildNeoZipManifest({
    createdAt,
    aiRoot,
    digest,
    ...(input.notice?.trim() ? { notice: input.notice.trim() } : {}),
    primaries,
    okf: aiOkf,
    parserEngine: input.parserEngine,
    parser: input.parser,
    originalBytes: byPath.reduce((sum, member) => sum + member.data.length, 0),
    ...(assetEntryCount > 0 ? { assetEntryCount } : {}),
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
    for (const stale of [
      `${aiRoot}/search.json`,
      `${aiRoot}/${DEFAULT_OKF_DIR}/log.md`,
    ]) {
      const abs = join(wikiRoot, stale);
      if (existsSync(abs)) rmSync(abs);
    }

    // ZipWiki pack order (not APPNOTE-required): manifest → wiki → sources.
    const entries: ZipEntry[] = [
      { name: MANIFEST_ENTRY, data: manifestData },
      ...wikiEntries,
      ...includedPrimaries.map((m) => ({
        name: m.path,
        data: m.data,
        mtime: m.mtime,
        ...(!m.hasParsed &&
        m.extraOrigin &&
        originLocatorPresent(m.extraOrigin)
          ? { origin: m.extraOrigin }
          : {}),
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
    const zipOpts: WriteZipOptions = {
      compression: input.compression,
      level: input.level,
      deflate: input.deflate,
      legacy: input.legacy,
      storeSuffixes: input.storeSuffixes,
      sha256Extra: input.sha256Extra === true,
    };
    let zip: Buffer;
    let merkleRoot: string | undefined;
    if (input.computeMerkle === true) {
      // Kit Merkle v1 over non-META-INF members (same set as primaries + wiki).
      const built = buildZipWithKitMerkle(entries, zipOpts, "v1");
      if (!built.merkleRoot) {
        throw new Error("merkle root requires at least one content leaf");
      }
      zip = built.buffer;
      merkleRoot = built.merkleRoot;
    } else {
      zip = buildZipWithKit(entries, zipOpts);
    }
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

export type { WriteZipOptions } from "./neozipkit-writer.js";

/**
 * Build a ZIP via NeoZipKit. Default integrity is ZIP CRC-32. Extra Field
 * 0x014E is written when `sha256Extra` is true; Extra Field 0x014F when
 * `origin` is set. Default compression is zstd (method 93); deflate (8) and
 * store (0) supported. Compression policy (suffix store list, level, legacy)
 * is resolved in `compress.ts`.
 */
export function writeZipBuffer(
  entries: ZipArchiveEntry[],
  compressOpts: WriteZipOptions = {},
): Buffer {
  return buildZipWithKit(entries, compressOpts);
}

/**
 * Register the ZipWiki `ai` manifest block with the kit validator registry.
 * Soft validation: `ai` must be an object; `ai.root` a string when present.
 */
registerManifestBlock("ai", {
  validate(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return ["ai must be an object"];
    }
    const root = (value as { root?: unknown }).root;
    if (root !== undefined && typeof root !== "string") {
      return ["ai.root must be a string"];
    }
  },
});
