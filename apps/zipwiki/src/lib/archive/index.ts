/**
 * ZipWiki archive and NeoZip bundle layout.
 *
 * Each `.zipwiki` (legacy `.nzip`) is a ZIP per doc/NEOZIP_APPNOTE.md (0.2):
 * primaries + optional AI root (`codex/` by default) with `parsed/` and optional `okf/`.
 */

/** Default on-disk extension for ZipWiki packages. */
export const NZIP_EXTENSION = ".zipwiki" as const;

/** Older extension still accepted when opening packages. */
export const LEGACY_NZIP_EXTENSION = ".nzip" as const;

/** @deprecated Use {@link NZIP_EXTENSION}. Kept for older call sites. */
export const ZIPWIKI_EXTENSION = NZIP_EXTENSION;

/**
 * Canonical entry paths inside a ZipWiki package (NEOZIP_APPNOTE 0.2).
 * Originals are primaries at the zip path chosen by the writer; AI material
 * lives under {@link BUNDLE_PATHS.aiRoot} (default `wiki/`).
 */
export const BUNDLE_PATHS = {
  metaInf: "META-INF/",
  manifest: "META-INF/manifest.json",
  /** Default AI root name (no trailing slash). */
  aiRoot: "wiki",
  /** Default parse directory under the AI root. */
  parsedDir: "parsed",
  /** Default prefix for whole-document parse: `wiki/parsed/`. */
  parsed: "wiki/parsed/",
  /** Default OKF root. */
  okfRoot: "wiki/okf/",
  okfIndex: "wiki/okf/index.md",
  okfDocument: "wiki/okf/document.md",
  okfLog: "wiki/okf/log.md",
  /** Pack-time inverted catalog for zipaccess search. */
  searchIndex: "wiki/search.json",
} as const;

export type BundlePath = (typeof BUNDLE_PATHS)[keyof typeof BUNDLE_PATHS];

/** Document type labels used for dictionary selection & compression. */
export const DOCUMENT_TYPES = [
  "Financial_Report",
  "Legal_Contract",
  "Receipt_Scan",
  "Technical_Doc",
  "Generic",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Validate a user-supplied `--category` value against the archive spec. */
export function parseCategoryOverride(value: string): DocumentType {
  if (!isDocumentType(value)) {
    throw new Error(
      `Unknown category "${value}". Expected one of: ${DOCUMENT_TYPES.join(", ")}`,
    );
  }
  return value;
}

export { REPO_ROOT, resolveRepoPath, fail } from "./paths.js";

/** Which parser produced structured output for a source file. */
export type ParserEngine = "liteparse" | "llamaparse";

export function isNzipPath(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith(NZIP_EXTENSION) || lower.endsWith(LEGACY_NZIP_EXTENSION)
  );
}

/** Strip `.zipwiki` / `.nzip` from a package basename for titles / stems. */
export function stripPackageExtension(filename: string): string {
  return filename.replace(/\.(zipwiki|nzip)$/i, "") || filename;
}

/** @deprecated Use {@link isNzipPath}. */
export function isZipWikiPath(filename: string): boolean {
  return isNzipPath(filename) || filename.toLowerCase().endsWith(".zipwiki");
}

export type {
  AiRootName,
  BundleWriteInput,
  BundleWriteResult,
  CollectionMemberInput,
  CollectionWriteInput,
  CollectionWriteResult,
  EntryClass,
  NeoZipAi,
  NeoZipAiOkf,
  NeoZipAiParser,
  NeoZipAiPrimary,
  NeoZipManifest,
  NeoZipOcrConfidence,
  NeoZipParseComplexity,
  NeoZipParseComplexityPage,
  OkfWriteFile,
  OkfWriteInput,
} from "./nzip.js";
export {
  DEFAULT_AI_ROOT,
  DEFAULT_OKF_DIR,
  DEFAULT_OKF_VERSION,
  DEFAULT_PARSED_DIR,
  PACKAGE_SPEC_VERSION,
  assignContentPaths,
  buildNeoZipManifest,
  classifyEntry,
  findOrphanParses,
  isOmittableDocumentSource,
  okfPathFor,
  parsedPathFor,
  parsedMarkdownFileName,
  serializeNeoZipManifest,
  writeNzipBundle,
  writeNzipCollectionBundle,
  writeZipBuffer,
} from "./nzip.js";
export type {
  BuildNeoZipManifestInput,
  ZipArchiveEntry,
  ZipPrecompressed,
  WriteZipOptions,
} from "./nzip.js";
export {
  ZIP_METHOD_DEFLATE,
  ZIP_METHOD_STORE,
  ZIP_METHOD_ZSTD,
  compressZipPayload,
  resolveCompressionAlg,
  shouldStoreBySuffix,
  type CompressOptions,
  type CompressedPayload,
  type ZipCompressionAlg,
} from "./compress.js";
export type {
  MerkleAlgorithm,
  MerkleContentEntry,
  MerkleLeaf,
} from "./merkle.js";
export {
  computeArchiveMerkleRoot,
  computeMerkleRootV0FromDigests,
  computeMerkleRootV1FromContents,
  computeMerkleRootV1FromLeaves,
  contentDigest,
  contentMerkleRoot,
  isMetaInfPath,
  leafHashV0,
  leafHashV1,
  matchMerkleRoot,
  merkleRootFromLeaves,
  normalizeMerklePath,
  parentHash,
} from "./merkle.js";
/** @deprecated APPNOTE 0.2 uses per-primary `codex/parsed/{P}.md`, not structured.pack. */
export type {
  StructuredPackBuildResult,
  StructuredPackMemberInput,
  StructuredPackSlice,
} from "./structured-pack.js";
/** @deprecated See structured-pack note above. */
export {
  buildStructuredPack,
  readStructuredPackMember,
} from "./structured-pack.js";
/** @deprecated llms.txt is not part of APPNOTE 0.2. */
export type { BuildLlmsTxtInput, LlmsTxtMember } from "./llms-txt.js";
/** @deprecated llms.txt is not part of APPNOTE 0.2. */
export { buildCollectionLlmsTxt } from "./llms-txt.js";
export type { ZipHandle, ZipListEntry } from "./zip-list.js";
export {
  closeZipHandle,
  findZipEntry,
  listZipEntries,
  listZipEntriesFromBuffer,
  formatZipListing,
  formatOriginalsSummary,
  formatCompressionPercent,
  fromDosDateTime,
  openZipHandle,
  zipMethodLabel,
  zipExtractLine,
  readCompressedPayload,
  readCompressedPayloadFromHandle,
  readInflatedWithExtraFromHandle,
  readLocalExtraFieldFromHandle,
  readZipEntry,
  readZipEntryFromHandle,
  readZipEntryPayload,
  readZipEntryPayloadFromHandle,
  resetZipPreadBytes,
  runWithZipHandle,
  useZipHandle,
  zipPreadBytes,
} from "./zip-list.js";
export type { VerifyPayloadResult } from "./integrity.js";
export {
  EF_NZIP_SHA256,
  ZipIntegrityError,
  assertPayloadIntegrity,
  manifestSha256ForPath,
  parseSha256FromExtra,
  readLocalExtraField,
  readZipEntryVerified,
  readZipEntryVerifiedFromBuffer,
  readZipEntryVerifiedFromHandle,
  sha256Hex,
  verifyUncompressedPayload,
} from "./integrity.js";
export type { OriginApiFields, OriginLocator } from "./origin-extra.js";
export {
  EF_NZIP_ORIGIN,
  ORIGIN_EXTRA_VERSION,
  ORIGIN_TAG,
  ORIGIN_URI_MAX_BYTES,
  concatExtraFields,
  makeOriginExtra,
  originCrc32FromApi,
  originCrc32Hex,
  originCrc32Of,
  originLocatorFromOriginal,
  originLocatorPresent,
  originMtimeIso,
  originSha256Of,
  originToApiFields,
  pickOriginApiFields,
  parseOriginFromExtra,
  unixTimeSeconds,
} from "./origin-extra.js";
export type { OriginRule, ResolveOriginOptions } from "./origin-resolve.js";
export {
  ORIGINS_RULE_FILENAME,
  cliOriginOverlay,
  normalizeOriginUri,
  parseOriginRuleJson,
  readOriginSidecar,
  resolveOriginUri,
  tryApplyOriginRule,
} from "./origin-resolve.js";
export { toDosDateTime } from "./nzip.js";
export type { LoadedArchiveMembers } from "./rewrite.js";
export {
  PROOF_SIDECAR_NAMES,
  copyZipMember,
  hasProofSidecars,
  isContentPath,
  loadCopyableArchive,
  nextAvailablePrimaryPath,
  logicalPrimaryFromUserKey,
  resolveExistingPrimaryPath,
  sortPackOrder,
  writeArchiveAtomic,
} from "./rewrite.js";
export type { PackageInventory, PrimarySlot } from "./inventory.js";
export {
  basenameOfPrimary,
  loadPackageInventory,
  okfStemOwners,
  primaryPathsOf,
  usedPrimaryPaths,
} from "./inventory.js";
