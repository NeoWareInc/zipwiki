import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { stageLog } from "../lib/cli/activity-dots.js";
import {
  parseCategoryOverride,
  parsedMarkdownFileName,
  isOmittableDocumentSource,
  writeNzipCollectionBundle,
  cliOriginOverlay,
  resolveOriginUri,
  type DocumentType,
  type NeoZipAiParser,
} from "../lib/archive/index.js";
import {
  maybeReportLlamaParseUsage,
  maybeReportLocalLiteParse,
  resolveOmitOriginalDocuments,
  type ResolvedZipwikiConfig,
} from "../lib/config/index.js";
import {
  buildOkfDocument,
  buildZipWikiOkfSources,
  conceptFileNameFor,
  finalizeOkfDirectory,
} from "../lib/okf/index.js";
import {
  assessParseYield,
  classifyDocument,
  parseDocument,
  type CliParseOptions,
} from "../lib/parse/index.js";
import { runManifestCommand } from "../manifest-cmd.js";
import { runParseOkfPipeline } from "./scheduler.js";
import type { StageMember, StageOptions } from "./types.js";

function sha256FileHexIf(path: string, enabled: boolean): string | undefined {
  if (!enabled || !existsSync(path)) return undefined;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function guessMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export function stagePaths(stageDir: string) {
  const parsedDir = join(stageDir, "wiki", "parsed");
  const okfDir = join(stageDir, "wiki", "okf");
  return { parsedDir, okfDir, stageDir: resolve(stageDir) };
}

export function ensureStageDirs(stageDir: string): ReturnType<typeof stagePaths> {
  const paths = stagePaths(stageDir);
  mkdirSync(paths.parsedDir, { recursive: true });
  mkdirSync(paths.okfDir, { recursive: true });
  mkdirSync(join(stageDir, "META-INF"), { recursive: true });
  return paths;
}

function clearOkfOutputDir(outputDir: string): number {
  if (!existsSync(outputDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(outputDir)) {
    const path = join(outputDir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      rmSync(path, { recursive: true, force: true });
      removed += 1;
    } else if (name.endsWith(".md")) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}

export function writeOkfIndex(outputDir: string): number {
  return finalizeOkfDirectory(outputDir);
}

function collectOkfFiles(dir: string, prefix = ""): { name: string; data: string }[] {
  if (!existsSync(dir)) return [];
  const out: { name: string; data: string }[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(path).isDirectory()) {
      out.push(...collectOkfFiles(path, rel));
      continue;
    }
    if (rel.replace(/\\/g, "/") === "topics/pdf.md") continue;
    if (!name.endsWith(".md")) continue;
    out.push({ name: rel, data: readFileSync(path, "utf-8") });
  }
  return out;
}

export type ParseFileResult = {
  member: StageMember;
  markdown: string;
};

export async function parseOneFile(
  abs: string,
  opts: StageOptions,
  project: ResolvedZipwikiConfig,
  forcedCategory?: DocumentType,
): Promise<ParseFileResult> {
  const originalName = basename(abs);
  const cli: CliParseOptions = {
    password: opts.password,
    ocr: opts.noOcr === true ? false : opts.ocr,
    noOcr: opts.noOcr === true,
    ocrLanguage: opts.ocrLanguage,
    maxPages: opts.maxPages,
    dpi: opts.dpi,
    targetPages: opts.targetPages,
    ocrServerUrl: opts.ocrServerUrl,
    quiet: opts.quiet === true,
  };
  const parsed = await parseDocument(abs, {
    project,
    cli,
    remoteParse: opts.remoteParse,
  });
  const yieldInfo = assessParseYield(parsed.text, {
    complexity: parsed.complexity,
  });
  if (!yieldInfo.ok) {
    throw new Error(
      `Parse produced no usable text for ${originalName} (${yieldInfo.reason})`,
    );
  }
  const classification = classifyDocument({
    fileName: originalName,
    text: parsed.text,
  });
  await maybeReportLlamaParseUsage({
    engine: parsed.engine,
    llamaCredits: parsed.llamaCredits,
    pages: parsed.pages?.length,
    filename: originalName,
    jobId: parsed.jobId,
    quiet: opts.quiet,
  });
  return {
    markdown: parsed.text,
    member: {
      abs,
      originalName,
      documentType: forcedCategory ?? classification.documentType,
      structuredMarkdown: parsed.text,
    },
  };
}

/** Write parse markdown for one file into stage wiki/parsed. */
export function writeParsedFile(
  stageDir: string,
  originalName: string,
  markdown: string,
): string {
  const { parsedDir } = ensureStageDirs(stageDir);
  const out = join(parsedDir, parsedMarkdownFileName(originalName));
  writeFileSync(out, markdown, "utf-8");
  return out;
}

function stubMarkdownForFailedParse(
  originalName: string,
  reason: string,
): string {
  return [
    `# ${originalName}`,
    "",
    `${originalName} is included as a primary document in this NeoZip package.`,
    `Text extract was unavailable (${reason}).`,
    "",
  ].join("\n");
}

export async function okfOneFile(input: {
  abs: string;
  originalName: string;
  parsedMarkdown: string;
  stageDir: string;
  useAi: boolean;
  provider?: string;
  model?: string;
  quiet?: boolean;
  /** When false, do not cite a wiki/parsed source (parse failed). */
  parseAvailable?: boolean;
  /**
   * When true (default pack setting), omittable documents with a parse are not
   * stored as primaries in the `.nzip` — cite the host path instead.
   */
  omitOriginalDocuments?: boolean;
  /** Hash original bytes for OKF `contentSha256` (only when --sha256 / --origin-sha256). */
  includeSha256?: boolean;
}): Promise<{ path: string; mode: "ai" | "fallback"; aiError?: string; ms: number }> {
  const { okfDir } = ensureStageDirs(input.stageDir);
  const conceptName = conceptFileNameFor(input.originalName);
  const outFile = join(okfDir, conceptName);
  const parseFile = join(
    stagePaths(input.stageDir).parsedDir,
    parsedMarkdownFileName(input.originalName),
  );
  const parseAvailable =
    input.parseAvailable !== false && existsSync(parseFile);
  const omitOriginal =
    input.omitOriginalDocuments === true &&
    parseAvailable &&
    isOmittableDocumentSource(input.originalName);
  const classification = classifyDocument({
    fileName: input.originalName,
    text: input.parsedMarkdown,
  });
  const sources = buildZipWikiOkfSources({
    originalName: input.originalName,
    absolutePath: input.abs,
    parseAvailable,
    primaryInPackage: !omitOriginal,
  });
  const digest = parseAvailable
    ? undefined
    : `${input.originalName} is included as a primary in this NeoZip package (text extract unavailable).`;

  const started = Date.now();
  const result = await buildOkfDocument({
    sourceName: input.originalName,
    sourcePath: input.abs,
    parsedMarkdown: parseAvailable
      ? input.parsedMarkdown
      : stubMarkdownForFailedParse(
          input.originalName,
          "LiteParse/extract failed or missing",
        ),
    documentType: classification.documentType,
    ...(input.includeSha256
      ? { contentSha256: sha256FileHexIf(input.abs, true) }
      : {}),
    digest,
    useAi: input.useAi,
    requireAi: false,
    provider: input.provider,
    model: input.model,
    sources,
  });
  const ms = Date.now() - started;

  const concept =
    result.files.find((f) => f.name === conceptName) ?? result.files[0];
  if (!concept) throw new Error("buildOkfDocument returned no files");
  writeFileSync(outFile, concept.data, "utf-8");
  return { path: outFile, mode: result.mode, aiError: result.aiError, ms };
}

/** Overlapping parse → OKF for all files into stageDir. */
export async function runParseAndOkfPhase(input: {
  files: string[];
  stageDir: string;
  opts: StageOptions;
  project: ResolvedZipwikiConfig;
  useAi: boolean;
  parseOnly?: boolean;
  okfOnly?: boolean;
}): Promise<{ members: StageMember[]; errors: number }> {
  const { files, stageDir, opts, project, useAi } = input;
  const { parsedDir, okfDir } = ensureStageDirs(stageDir);
  const forcedCategory = opts.category
    ? parseCategoryOverride(opts.category)
    : undefined;
  const concurrency = opts.concurrency ?? 2;
  const members: StageMember[] = new Array(files.length);
  const omitOriginalDocuments = resolveOmitOriginalDocuments({
    cli: opts.omitOriginalDocuments,
    pack: project.pack,
  });
  const includeSha256 =
    opts.sha256Extra === true || opts.originSha256 === true;

  if (input.okfOnly) {
    // OKF every source: use wiki/parsed when present, else filename/type context
    // so LLM can still summarize when LiteParse could not extract text.
    if (!opts.keepExistingOkf) clearOkfOutputDir(okfDir);

    const pipeline = await runParseOkfPipeline(files, concurrency, {
      failFast: opts.failFast,
      parse: async (abs) => {
        const originalName = basename(abs);
        const parseFile = join(
          parsedDir,
          parsedMarkdownFileName(originalName),
        );
        if (existsSync(parseFile)) {
          return {
            originalName,
            markdown: readFileSync(parseFile, "utf-8"),
            parseFile,
            parseFailed: false as const,
          };
        }
        if (!opts.quiet) {
          stageLog(
            `[stage] okf ${originalName} (no parse — filename/type context)`,
          );
        }
        return {
          originalName,
          markdown: stubMarkdownForFailedParse(
            originalName,
            `missing parse ${parseFile}`,
          ),
          parseFile: undefined,
          parseFailed: true as const,
        };
      },
      okf: async (abs, _index, loaded) => {
        const written = await okfOneFile({
          abs,
          originalName: loaded.originalName,
          parsedMarkdown: loaded.markdown,
          stageDir,
          useAi,
          provider: opts.okfProvider ?? project.okf.provider,
          model: opts.okfModel ?? project.okf.model,
          quiet: opts.quiet,
          parseAvailable: !loaded.parseFailed,
          omitOriginalDocuments,
          includeSha256,
        });
        if (!opts.quiet) {
          const notes: string[] = [written.mode, `${written.ms}ms`];
          if (loaded.parseFailed) notes.push("no parse");
          if (written.aiError) notes.push(`ai: ${written.aiError}`);
          stageLog(
            `[stage] okf done ${loaded.originalName} (${notes.join(", ")})`,
          );
        }
        return written.path;
      },
      onOkfError: (item, _i, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        stageLog(`[stage] okf error ${basename(item)}: ${msg}`);
      },
    });
    const outMembers: StageMember[] = [];
    for (let i = 0; i < files.length; i++) {
      const abs = files[i]!;
      const p = pipeline.parsed[i];
      const o = pipeline.okf[i];
      if (p?.value && o?.value) {
        outMembers.push({
          abs,
          originalName: p.value.originalName,
          documentType: classifyDocument({
            fileName: p.value.originalName,
            text: p.value.markdown,
          }).documentType,
          structuredMarkdown: p.value.parseFailed
            ? undefined
            : p.value.markdown,
          parsePath: p.value.parseFile,
          okfPath: o.value,
          parseFailed: p.value.parseFailed,
        });
      } else {
        outMembers.push({
          abs,
          originalName: basename(abs),
          documentType: "Generic",
          error: p?.error ?? o?.error ?? "unknown",
        });
      }
    }
    writeOkfIndex(okfDir);
    return { members: outMembers, errors: pipeline.errors };
  }

  if (input.parseOnly) {
    const pipeline = await runParseOkfPipeline(files, concurrency, {
      failFast: opts.failFast,
      parse: async (abs) => {
        try {
          const result = await parseOneFile(abs, opts, project, forcedCategory);
          const parsePath = writeParsedFile(
            stageDir,
            result.member.originalName,
            result.markdown,
          );
          await maybeReportLocalLiteParse({
            success: true,
            bytes: Buffer.byteLength(result.markdown, "utf8"),
            quiet: opts.quiet,
            engine: project.parser.engine,
          });
          if (!opts.quiet) {
            stageLog(`[stage] parse ${result.member.originalName}`);
          }
          return { ...result, parsePath };
        } catch (err) {
          await maybeReportLocalLiteParse({
            success: false,
            quiet: opts.quiet,
            engine: project.parser.engine,
          });
          throw err;
        }
      },
      okf: async () => undefined,
      onParseError: (item, _i, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        stageLog(`[stage] parse error ${basename(item)}: ${msg}`);
      },
    });
    for (let i = 0; i < files.length; i++) {
      const p = pipeline.parsed[i];
      if (p?.value) {
        members[i] = { ...p.value.member, parsePath: p.value.parsePath };
      } else {
        members[i] = {
          abs: files[i]!,
          originalName: basename(files[i]!),
          documentType: "Generic",
          error: p?.error ?? "unknown",
        };
      }
    }
    return { members, errors: pipeline.errors };
  }

  // Overlapping parse + OKF. Parse failures still get OKF (filename/type) and
  // keep the original for the zip root (omit-original only applies when parsed).
  if (!opts.keepExistingOkf) clearOkfOutputDir(okfDir);

  let softParseErrors = 0;
  const pipeline = await runParseOkfPipeline(files, concurrency, {
    failFast: opts.failFast,
    parse: async (abs) => {
      try {
        const result = await parseOneFile(abs, opts, project, forcedCategory);
        const parsePath = writeParsedFile(
          stageDir,
          result.member.originalName,
          result.markdown,
        );
        await maybeReportLocalLiteParse({
          success: true,
          bytes: Buffer.byteLength(result.markdown, "utf8"),
          quiet: opts.quiet,
          engine: project.parser.engine,
        });
        if (!opts.quiet) {
          stageLog(`[stage] parse ${result.member.originalName}`);
        }
        return { ...result, parsePath, parseFailed: false as const };
      } catch (err) {
        softParseErrors += 1;
        await maybeReportLocalLiteParse({
          success: false,
          quiet: opts.quiet,
          engine: project.parser.engine,
        });
        const msg = err instanceof Error ? err.message : String(err);
        const originalName = basename(abs);
        if (!opts.quiet) {
          stageLog(`[stage] parse error ${originalName}: ${msg}`);
        }
        if (opts.failFast) throw err;
        const classification = classifyDocument({
          fileName: originalName,
          text: originalName,
        });
        return {
          markdown: stubMarkdownForFailedParse(originalName, msg),
          member: {
            abs,
            originalName,
            documentType: forcedCategory ?? classification.documentType,
            parseFailed: true,
            error: msg,
          },
          parsePath: undefined,
          parseFailed: true as const,
        };
      }
    },
    okf: async (abs, _index, parsed) => {
      const written = await okfOneFile({
        abs,
        originalName: parsed.member.originalName,
        parsedMarkdown: parsed.markdown,
        stageDir,
        useAi,
        provider: opts.okfProvider ?? project.okf.provider,
        model: opts.okfModel ?? project.okf.model,
        quiet: opts.quiet,
        parseAvailable: !parsed.parseFailed,
        omitOriginalDocuments,
        includeSha256,
      });
      if (!opts.quiet) {
        const notes: string[] = [written.mode, `${written.ms}ms`];
        if (parsed.parseFailed) notes.push("no parse");
        if (written.aiError) notes.push(`ai: ${written.aiError}`);
        stageLog(
          `[stage] okf done ${parsed.member.originalName} (${notes.join(", ")})`,
        );
      }
      return written.path;
    },
    onOkfError: (item, _i, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      stageLog(`[stage] okf error ${basename(item)}: ${msg}`);
    },
  });

  for (let i = 0; i < files.length; i++) {
    const p = pipeline.parsed[i];
    const o = pipeline.okf[i];
    if (p?.value) {
      members[i] = {
        ...p.value.member,
        // Only attach parse text when parse succeeded (omit-original gate).
        structuredMarkdown: p.value.parseFailed
          ? undefined
          : p.value.member.structuredMarkdown ?? p.value.markdown,
        parsePath: p.value.parsePath,
        okfPath: o?.value,
        parseFailed: p.value.parseFailed,
        // Soft parse errors are tracked separately; OKF failure is hard.
        error: o?.error,
      };
    } else {
      members[i] = {
        abs: files[i]!,
        originalName: basename(files[i]!),
        documentType: "Generic",
        error: p?.error ?? o?.error ?? "unknown",
      };
    }
  }

  writeOkfIndex(okfDir);
  return { members, errors: pipeline.errors + softParseErrors };
}

export async function runManifestPhase(input: {
  files: string[];
  stageDir: string;
  opts: StageOptions;
}): Promise<void> {
  const { parsedDir, okfDir } = stagePaths(input.stageDir);
  await runManifestCommand({
    inputDir: input.files.length === 1
      ? join(input.files[0]!, "..")
      : undefined,
    parseDir: parsedDir,
    okfDir,
    outputDir: input.stageDir,
    config: input.opts.config,
    quiet: input.opts.quiet,
    parserEngine: input.opts.parser,
  });
}

/** Manifest that discovers files from the input list explicitly. */
export async function runManifestPhaseForFiles(input: {
  inputDir: string;
  stageDir: string;
  opts: StageOptions;
}): Promise<void> {
  const { parsedDir, okfDir } = stagePaths(input.stageDir);
  await runManifestCommand({
    inputDir: input.inputDir,
    parseDir: parsedDir,
    okfDir,
    outputDir: input.stageDir,
    config: input.opts.config,
    quiet: input.opts.quiet,
    parserEngine: input.opts.parser,
  });
}

export function runCompressPhase(input: {
  members: StageMember[];
  stageDir: string;
  outputPath: string;
  opts: StageOptions;
  project: ResolvedZipwikiConfig;
  parser?: NeoZipAiParser;
  omitOriginalDocuments: boolean;
  title: string;
  /** Absolute pack input roots (rules do not leak across). */
  inputRoots?: string[];
}): string {
  // Pack every member whose primary file exists on the source path (m.abs).
  // Primaries are not staged under stageDir — compress reads them in-place.
  // Parse failures still include the original at zip root; omit-original only
  // drops originals when parsed.
  const { parsedDir } = stagePaths(input.stageDir);
  const packMembers: StageMember[] = [];
  for (const m of input.members) {
    if (!existsSync(m.abs)) continue;
    if (!m.structuredMarkdown && !m.parseFailed) {
      const parseFile = join(
        parsedDir,
        parsedMarkdownFileName(m.originalName),
      );
      if (existsSync(parseFile)) {
        m.structuredMarkdown = readFileSync(parseFile, "utf-8");
      }
    }
    packMembers.push(m);
  }
  if (packMembers.length === 0) {
    throw new Error("No files to compress into .nzip");
  }
  const usable = packMembers;

  const { okfDir } = stagePaths(input.stageDir);
  const okfFiles: { name: string; data: string }[] = [];
  if (input.opts.noOkf !== true && existsSync(okfDir)) {
    okfFiles.push(...collectOkfFiles(okfDir));
  } else if (input.opts.noOkf === true && existsSync(okfDir)) {
    clearOkfOutputDir(okfDir);
  }

  const compression =
    input.opts.legacy || input.opts.deflate
      ? "deflate"
      : (input.opts.compression ?? input.project.pack.compression);
  const level = input.opts.level ?? input.project.pack.level;

  const inputRoots =
    input.inputRoots && input.inputRoots.length > 0
      ? input.inputRoots
      : [...new Set(usable.map((m) => resolve(m.abs, "..")))];
  const overlay = cliOriginOverlay({
    originPattern: input.opts.originPattern,
    originUrlTemplate: input.opts.originUrlTemplate,
    originFile: input.opts.originFile,
  });

  const written = writeNzipCollectionBundle({
    outputPath: input.outputPath,
    title: input.title,
    omitOriginalDocuments: input.omitOriginalDocuments,
    wikiDir: input.stageDir,
    keepWikiDir: true,
    members: usable.map((m) => {
      const originUri = resolveOriginUri(m.abs, {
        inputRoots,
        cliOverlay: overlay,
      });
      return {
        originalPath: m.abs,
        originalName: input.opts.junkPaths
          ? basename(m.originalName)
          : m.originalName,
        mimeType: guessMime(m.abs),
        documentType: m.documentType,
        ...(m.structuredMarkdown
          ? { structuredMarkdown: m.structuredMarkdown }
          : {}),
        ...(originUri ? { originUri } : {}),
      };
    }),
    ...(okfFiles.length > 0 ? { okf: { files: okfFiles } } : {}),
    compression: compression as "zstd" | "deflate" | "store",
    level,
    storeSuffixes:
      input.opts.storeSuffixes ?? input.project.pack.storeSuffixes,
    parser: input.parser,
    parsedMtimeFromOriginal: input.opts.parsedMtimeFromOriginal === true,
    sha256Extra: input.opts.sha256Extra === true,
    originSha256: input.opts.originSha256 === true,
  });

  return written.bundlePath;
}
