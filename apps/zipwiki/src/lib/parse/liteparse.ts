import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, parse as parsePath, relative } from "node:path";
import LiteParse, { type OutputFormat } from "@llamaindex/liteparse";
import {
  loadZipwikiConfig,
  type ParseEngineId,
  type ParserMode,
} from "../config/index.js";
import {
  collectFiles,
  ensureDir,
  extensionForFormat,
  fail,
  parseTargetPages,
  resolveInput,
} from "./utils.js";
import {
  buildConfig,
  type CliParseOptions,
} from "./config.js";
import {
  assessParseYield,
} from "./parse-quality.js";
import {
  printParseHeader,
  resolveCliOcrEnabled,
} from "./parse-header.js";
import { parseDocument } from "./parse-document.js";
import { resolveTessdataPath } from "./tessdata.js";
import type { DocumentParseResult } from "./types.js";

export type ParseFileOptions = CliParseOptions & {
  output?: string;
  imageOutputDir?: string;
  /** Override parser engine (also from ZIPWIKI_PARSER / zipwiki.config.json). */
  parser?: ParseEngineId;
  /** Override parser mode (also from ZIPWIKI_PARSER_MODE). */
  parserMode?: ParserMode;
  /** Path to zipwiki.config.json (project config). */
  projectConfig?: string;
};

export async function runParseFile(
  file: string,
  opts: ParseFileOptions,
): Promise<void> {
  let tempPath: string | undefined;
  try {
    const format = (opts.format ?? "text") as OutputFormat;
    const { config: project, configPath } = loadZipwikiConfig({
      configPath: opts.projectConfig ?? opts.config,
      parserEngine: opts.parser,
      parserMode: opts.parserMode,
      noOcr: opts.ocr === false || opts.noOcr === true,
    });

    const ocrEnabled =
      resolveCliOcrEnabled(opts) &&
      !project.pack.noOcr &&
      project.parser.liteparse.ocrEnabled !== false;

    const engineLabel =
      project.parser.mode === "auto" ? "auto" : project.parser.engine;

    let pathForParse = file;
    if (file === "-") {
      const input = await resolveInput(file);
      tempPath = join(tmpdir(), `zipwiki-parse-${Date.now()}.bin`);
      writeFileSync(tempPath, input);
      pathForParse = tempPath;
    }

    if (!opts.quiet) {
      if (configPath) {
        console.error(`[parse] config ${configPath}`);
      }
      printParseHeader({
        command: "parse-file",
        engine: engineLabel,
        mode: project.parser.mode,
        ocr: ocrEnabled,
        format,
        ocrLanguage:
          opts.ocrLanguage ?? project.parser.liteparse.ocrLanguage ?? "eng",
        ocrServerUrl: opts.ocrServerUrl,
        tessdataPath: ocrEnabled ? resolveTessdataPath() : undefined,
        maxPages: opts.maxPages ?? project.parser.liteparse.maxPages,
        dpi: opts.dpi ?? project.parser.liteparse.dpi,
        targetPages: opts.targetPages,
        complexity: Boolean(opts.complexity),
        llamaTier: project.parser.llamaparse.tier,
        fileCount: 1,
        extra: { file: basename(file) },
      });
      console.error(`[parse] parsing ${basename(file)}`);
    }

    const result = await parseDocument(pathForParse, {
      project,
      cli: {
        ...opts,
        format: "markdown",
        noOcr: !ocrEnabled,
        ocr: ocrEnabled ? opts.ocr : false,
        maxPages: opts.maxPages ?? project.parser.liteparse.maxPages,
        dpi: opts.dpi ?? project.parser.liteparse.dpi,
        ocrLanguage: opts.ocrLanguage ?? project.parser.liteparse.ocrLanguage,
        quiet: opts.quiet,
      },
    });

    const yieldCheck = assessParseYield(result.text, {
      complexity: result.complexity,
    });
    if (!yieldCheck.ok) {
      fail(
        new Error(
          `parse failed for ${basename(file)}: ${yieldCheck.reason}`,
        ),
      );
    }

    const output = formatDocumentResult(result, format);

    const raw = result.raw as
      | { images?: Array<{ id: string; format: string; bytes: Buffer }> }
      | undefined;
    if (opts.imageOutputDir && raw?.images && raw.images.length > 0) {
      ensureDir(opts.imageOutputDir);
      for (const img of raw.images) {
        writeFileSync(
          join(opts.imageOutputDir, `image_${img.id}.${img.format}`),
          img.bytes,
        );
      }
      if (!opts.quiet) {
        console.error(
          `[parse] wrote ${raw.images.length} image(s) to ${opts.imageOutputDir}`,
        );
      }
    }

    if (opts.output) {
      writeFileSync(opts.output, output, "utf-8");
    } else {
      process.stdout.write(output);
    }
  } catch (err) {
    fail(err);
  } finally {
    if (tempPath) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
    }
  }
}

export type IsComplexOptions = {
  compact?: boolean;
  maxPages?: number;
  targetPages?: string;
  password?: string;
  quiet?: boolean;
};

export async function runIsComplex(
  file: string,
  opts: IsComplexOptions,
): Promise<void> {
  try {
    const config = buildConfig(opts);
    const parser = new LiteParse(config);
    const stats = await parser.isComplex(await resolveInput(file));
    const complexPages = stats.filter((s) => s.needsOcr).length;

    process.stdout.write(
      opts.compact ? JSON.stringify(stats) : JSON.stringify(stats, null, 2),
    );
    process.stdout.write("\n");

    if (!opts.quiet) {
      const verdict = complexPages > 0 ? "COMPLEX" : "SIMPLE";
      const layoutCount = (reason: string) =>
        stats.filter((s) => s.layout?.reasons.includes(reason)).length;
      console.error(
        `${verdict} — ${complexPages}/${stats.length} page(s) need OCR; ` +
          `layout: ${layoutCount("multi-column")} multi-column, ` +
          `${layoutCount("table-likely")} table, ` +
          `${layoutCount("dense-graphics")} graphics-dense`,
      );
    }

    if (complexPages > 0) process.exit(1);
  } catch (err) {
    fail(err);
  }
}

export type ScreenshotOptions = {
  outputDir?: string;
  targetPages?: string;
  dpi?: number;
  password?: string;
  quiet?: boolean;
};

export async function runScreenshot(
  file: string,
  opts: ScreenshotOptions,
): Promise<void> {
  try {
    const config = buildConfig(opts);
    const parser = new LiteParse(config);
    const pageNumbers = parseTargetPages(opts.targetPages);
    const outputDir = opts.outputDir ?? "./screenshots";
    ensureDir(outputDir);

    const results = await parser.screenshot(file, pageNumbers);
    for (const result of results) {
      const outputPath = join(outputDir, `page_${result.pageNum}.png`);
      writeFileSync(outputPath, result.imageBuffer);
      if (!opts.quiet) {
        console.error(
          `[parse] screenshot page ${result.pageNum} → ${outputPath}`,
        );
      }
    }
  } catch (err) {
    fail(err);
  }
}

export type BatchParseOptions = CliParseOptions & {
  recursive?: boolean;
  extension?: string;
  /** Override parser engine (also from ZIPWIKI_PARSER / zipwiki.config.json). */
  parser?: ParseEngineId;
  /** Override parser mode (also from ZIPWIKI_PARSER_MODE). */
  parserMode?: ParserMode;
  /** Path to zipwiki.config.json (project config). */
  projectConfig?: string;
};

type BatchRow = {
  name: string;
  status: "ok" | "skipped" | "error";
  detail: string;
  ms: number;
  engine?: string;
};

function formatDocumentResult(
  result: DocumentParseResult,
  format: OutputFormat,
): string {
  if (format === "json") {
    return `${JSON.stringify(
      {
        engine: result.engine,
        text: result.text,
        pages: result.pages,
        ...(result.complexity ? { complexity: result.complexity } : {}),
        ...(result.route ? { route: result.route } : {}),
      },
      null,
      2,
    )}\n`;
  }
  return result.text;
}

export async function runBatchParse(
  inputDir: string,
  outputDir: string,
  opts: BatchParseOptions,
): Promise<void> {
  try {
    const format = (opts.format ?? "text") as OutputFormat;
    const outExt = extensionForFormat(format);

    const { config: project, configPath } = loadZipwikiConfig({
      configPath: opts.projectConfig,
      parserEngine: opts.parser,
      parserMode: opts.parserMode,
      noOcr: opts.ocr === false,
    });

    const ocrEnabled =
      resolveCliOcrEnabled(opts) &&
      !project.pack.noOcr &&
      project.parser.liteparse.ocrEnabled !== false;

    ensureDir(outputDir);

    const extFilter = opts.extension
      ? opts.extension.startsWith(".")
        ? opts.extension.toLowerCase()
        : `.${opts.extension.toLowerCase()}`
      : undefined;

    const files = collectFiles(inputDir, Boolean(opts.recursive), extFilter);
    if (files.length === 0) {
      console.error(`[parse] no matching files found in ${inputDir}`);
      return;
    }

    const engineLabel =
      project.parser.mode === "auto" ? "auto" : project.parser.engine;

    if (!opts.quiet) {
      if (configPath) {
        console.error(`[parse] config ${configPath}`);
      }
      printParseHeader({
        command: "batch-parse",
        engine: engineLabel,
        mode: project.parser.mode,
        ocr: ocrEnabled,
        format,
        ocrLanguage:
          opts.ocrLanguage ?? project.parser.liteparse.ocrLanguage ?? "eng",
        ocrServerUrl: opts.ocrServerUrl,
        tessdataPath: ocrEnabled ? resolveTessdataPath() : undefined,
        maxPages: opts.maxPages ?? project.parser.liteparse.maxPages,
        dpi: opts.dpi ?? project.parser.liteparse.dpi,
        targetPages: opts.targetPages,
        numWorkers: opts.numWorkers,
        recursive: Boolean(opts.recursive),
        complexity: true,
        llamaTier: project.parser.llamaparse.tier,
        escalateNeedsOcrRatio: project.parser.escalate.minNeedsOcrRatio,
        escalateLayoutRatio: project.parser.escalate.minLayoutComplexRatio,
        fileCount: files.length,
        extra: {
          input: inputDir,
          output: outputDir,
        },
      });
    }

    const rows: BatchRow[] = [];

    for (const filePath of files) {
      const t0 = Date.now();
      const name = basename(filePath);
      const rel = relative(inputDir, filePath);
      const parsed = parsePath(rel);
      const outPath = join(outputDir, parsed.dir, parsed.name + outExt);
      ensureDir(join(outputDir, parsed.dir));

      if (!opts.quiet) {
        console.error(`[parse] parsing ${name}`);
      }

      try {
        const result = await parseDocument(filePath, {
          project,
          cli: {
            ...opts,
            format: "markdown",
            noOcr: !ocrEnabled,
            ocr: ocrEnabled ? opts.ocr : false,
            maxPages: opts.maxPages ?? project.parser.liteparse.maxPages,
            dpi: opts.dpi ?? project.parser.liteparse.dpi,
            ocrLanguage:
              opts.ocrLanguage ?? project.parser.liteparse.ocrLanguage,
            quiet: opts.quiet,
          },
        });
        const yieldCheck = assessParseYield(result.text, {
          complexity: result.complexity,
        });
        const ms = Date.now() - t0;

        if (!yieldCheck.ok) {
          try {
            unlinkSync(outPath);
          } catch {
            /* no prior file */
          }
          if (!opts.quiet) {
            console.error(
              `[parse] skipped ${name}: ${yieldCheck.reason} — no .md written`,
            );
          }
          rows.push({
            name,
            status: "skipped",
            detail: yieldCheck.reason,
            ms,
            engine: result.engine,
          });
          continue;
        }

        const output = formatDocumentResult(result, format);
        writeFileSync(outPath, output, "utf-8");
        if (!opts.quiet) {
          console.error(
            `[parse] ${name} → ${outPath} (${ms}ms; ${result.engine})`,
          );
        }
        rows.push({
          name,
          status: "ok",
          detail: outPath,
          ms,
          engine: result.engine,
        });
      } catch (err) {
        const ms = Date.now() - t0;
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[parse] error ${name}: ${detail}`);
        rows.push({ name, status: "error", detail, ms });
      }
    }

    const ok = rows.filter((r) => r.status === "ok").length;
    const skipped = rows.filter((r) => r.status === "skipped").length;
    const errored = rows.filter((r) => r.status === "error").length;

    console.error("");
    console.error("[parse] summary");
    console.error("───────────────");
    for (const row of rows) {
      const label =
        row.status === "ok"
          ? "ok"
          : row.status === "skipped"
            ? "skipped"
            : "error";
      const engine = row.engine ? ` [${row.engine}]` : "";
      console.error(
        `  ${label.padEnd(8)} ${row.name}${engine}  (${row.ms}ms)${row.status === "ok" ? "" : ` — ${row.detail}`}`,
      );
    }
    console.error("───────────────");
    console.error(
      `[parse] scanned ${rows.length}: ${ok} wrote .md, ${skipped} skipped (no extract), ${errored} errors`,
    );
  } catch (err) {
    fail(err);
  }
}
