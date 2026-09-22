import type { ParseEngineId, ParserMode } from "../lib/config/index.js";
import type { CliParseOptions } from "../lib/parse/index.js";
import type { DocumentType } from "../lib/archive/index.js";

export type PipelinePhase =
  | "parse"
  | "okf"
  | "manifest"
  | "compress"
  | "all";

export type StageMember = {
  abs: string;
  originalName: string;
  /** Optional prose; not a content hash. */
  digest?: string;
  documentType: DocumentType;
  structuredMarkdown?: string;
  parsePath?: string;
  okfPath?: string;
  /** Soft failure (e.g. parse); member may still be packed + OKF'd. */
  error?: string;
  /** True when LiteParse/etc. failed; original should still be in the zip. */
  parseFailed?: boolean;
};

export type StageOptions = CliParseOptions & {
  /** Pipeline phase to run. Default: all */
  phase?: PipelinePhase;
  /** Stage root (META-INF + wiki/). Default: temp or sample-output for scripts. */
  stageDir?: string;
  /** Keep temp stage after compress (named stageDir is always kept). */
  keepStageDir?: boolean;
  /** Alias for stageDir (pack --wiki-dir compat). */
  wikiDir?: string;
  keepWikiDir?: boolean;
  /** Stop after manifest when phase is all (no .nzip). */
  noZip?: boolean;
  /** Max in-flight parses (and OKF workers). Default: 2 */
  concurrency?: number;
  /** Fail the run on first file error. Default: false */
  failFast?: boolean;
  output?: string;
  outputDir?: string;
  name?: string;
  noOcr?: boolean;
  category?: string;
  noAiOkf?: boolean;
  /** Skip OKF entirely (no wiki/okf/, no LLM). Distinct from --no-ai-okf. */
  noOkf?: boolean;
  okfProvider?: string;
  okfModel?: string;
  config?: string;
  parser?: ParseEngineId;
  parserMode?: ParserMode;
  compression?: "zstd" | "deflate" | "store";
  level?: number;
  deflate?: boolean;
  legacy?: boolean;
  storeSuffixes?: string[];
  recurse?: boolean;
  junkPaths?: boolean;
  omitOriginalDocuments?: boolean;
  /**
   * Stamp parsed wiki entries with the source file's mtime.
   * Originals always use the source file mtime.
   */
  parsedMtimeFromOriginal?: boolean;
  remoteParse?: boolean;
  remoteOkf?: boolean;
  parseApiUrl?: string;
  parseApiKey?: string;
  parseCredential?: string;
  okfCredential?: string;
  exclude?: string[];
  include?: string[];
  /** Filename regex for CLI origin overlay (with originUrlTemplate). */
  originPattern?: string;
  /** URI template for CLI origin overlay on each pack input root. */
  originUrlTemplate?: string;
  /** When true, CLI overlay uses pathToFileURL for each file. */
  originFile?: boolean;
  /**
   * Write Extra Field 0x014E (SHA-256 of each zip member).
   * Default: ZIP CRC-32 only.
   */
  sha256Extra?: boolean;
  /**
   * Include SHA-256 of original primary bytes in Extra Field 0x014F
   * (instead of CRC-32).
   */
  originSha256?: boolean;
  dryRun?: boolean;
  /**
   * Skip the proceed / change settings / abort prompt.
   * Non-interactive runs skip it already; `--yes` skips it on a TTY.
   */
  yes?: boolean;
  testIntegrity?: boolean;
  showFiles?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  /** @internal Skip ZipWiki account sync (unit tests only). */
  skipAccountSync?: boolean;
  archiveComment?: string;
  /** Skip writing META-INF when running okf alone. */
  noManifest?: boolean;
  keepExistingOkf?: boolean;
};

export type StageResult = {
  stageDir: string;
  outputPath?: string;
  members: StageMember[];
  phasesRun: PipelinePhase[];
  errors: number;
};
