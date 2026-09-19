import { resolveRepoPath } from "./lib/parse/index.js";
import type { PipelinePhase, StageOptions } from "./pipeline/types.js";

/** Infer stage root from a wiki/parsed or wiki/okf path (or treat as stage root). */
export function inferStageDir(wikiChildOrStage: string): string {
  const abs = resolveRepoPath(wikiChildOrStage);
  const parts = abs.replace(/\\/g, "/").split("/");
  const n = parts.length;
  if (
    n >= 2 &&
    parts[n - 2] === "wiki" &&
    (parts[n - 1] === "parsed" || parts[n - 1] === "okf")
  ) {
    return parts.slice(0, n - 2).join("/") || "/";
  }
  return abs;
}

export function compressionLevelFromFlags(opts: Record<string, unknown>): number | undefined {
  for (let i = 0; i <= 9; i++) {
    if (opts[String(i)] === true) return i;
  }
  const level = opts.level;
  return typeof level === "number" && !Number.isNaN(level) ? level : undefined;
}

/** Map Commander pack/stage option bag → StageOptions. */
export function stageOptionsFromCli(
  opts: Record<string, unknown>,
  overrides: Partial<StageOptions> = {},
): StageOptions {
  const levelFlag = compressionLevelFromFlags(opts);
  return {
    phase: (opts.phase as PipelinePhase | undefined) ?? overrides.phase,
    stageDir: (opts.stageDir as string | undefined) ?? overrides.stageDir,
    wikiDir: (opts.wikiDir as string | undefined) ?? overrides.wikiDir,
    keepStageDir: opts.keepStageDir === true || opts.keepWikiDir === true,
    keepWikiDir: opts.keepWikiDir === true,
    noZip: opts.noZip === true,
    concurrency:
      typeof opts.concurrency === "number" && !Number.isNaN(opts.concurrency)
        ? opts.concurrency
        : overrides.concurrency,
    failFast: opts.failFast === true,
    output: opts.output as string | undefined,
    outputDir: opts.outputDir as string | undefined,
    name: opts.name as string | undefined,
    noOcr: opts.noOcr === true || opts.ocr === false,
    ocr: opts.noOcr === true || opts.ocr === false ? false : (opts.ocr as boolean | undefined),
    category: opts.category as string | undefined,
    noAiOkf:
      opts.noAiOkf === true ||
      opts.aiOkf === false ||
      opts.noAi === true ||
      opts.ai === false ||
      overrides.noAiOkf,
    noOkf: opts.noOkf === true || opts.okf === false || overrides.noOkf === true,
    okfProvider:
      (opts.okfProvider as string | undefined) ??
      (opts.provider as string | undefined),
    okfModel:
      (opts.okfModel as string | undefined) ??
      (opts.model as string | undefined),
    config: opts.config
      ? resolveRepoPath(String(opts.config))
      : opts.projectConfig
        ? resolveRepoPath(String(opts.projectConfig))
        : undefined,
    parser: opts.parser as StageOptions["parser"],
    parserMode: opts.parserMode as StageOptions["parserMode"],
    compression: opts.compression as StageOptions["compression"],
    level: levelFlag,
    deflate: opts.deflate === true || opts.pkzipCompress === true,
    legacy: opts.legacy === true,
    storeSuffixes:
      Array.isArray(opts.suffixes) && (opts.suffixes as string[]).length > 0
        ? (opts.suffixes as string[])
        : undefined,
    recurse: opts.recurse === true || opts.recursive === true,
    omitOriginalDocuments:
      opts.includeOriginal === true
        ? false
        : opts.omitOriginal === true
          ? true
          : undefined,
    parsedMtimeFromOriginal: opts.parsedDateFromOriginal === true,
    remoteParse: opts.remoteParse === true,
    remoteOkf: opts.remoteOkf === true,
    parseApiUrl: opts.parseApiUrl as string | undefined,
    parseApiKey: opts.parseApiKey as string | undefined,
    parseCredential: opts.useLlamaParseKey
      ? "llama"
      : (opts.parseCredential as string | undefined),
    okfCredential: opts.useAnthropicOkf
      ? "anthropic"
      : (opts.okfCredential as string | undefined),
    junkPaths: opts.junkPaths === true,
    exclude: opts.exclude as string[] | undefined,
    include: opts.include as string[] | undefined,
    originPattern: opts.originPattern as string | undefined,
    originUrlTemplate: opts.originUrlTemplate as string | undefined,
    originFile: opts.originFile === true,
    sha256Extra: opts.sha256 === true,
    originSha256: opts.originSha256 === true,
    dryRun: opts.dryRun === true,
    testIntegrity: opts.testIntegrity === true,
    showFiles: opts.showFiles === true || opts.list === true,
    verbose: opts.verbose === true,
    archiveComment: opts.archiveComment as string | undefined,
    quiet: opts.quiet === true,
    keepExistingOkf: opts.keepExisting === true,
    password: opts.password as string | undefined,
    ocrLanguage: opts.ocrLanguage as string | undefined,
    maxPages: opts.maxPages as number | undefined,
    dpi: opts.dpi as number | undefined,
    targetPages: opts.targetPages as string | undefined,
    ocrServerUrl: opts.ocrServerUrl as string | undefined,
    ...overrides,
  };
}
