import { readFileSync } from "node:fs";
import type {
  LiteParseConfig,
  OutputFormat,
  ParseResult,
} from "@llamaindex/liteparse";
import { resolveTessdataPath } from "./tessdata.js";

export type CliParseOptions = {
  format?: string;
  imageMode?: string;
  links?: boolean;
  ocr?: boolean;
  /** When true, skip OCR (same as `ocr: false` / `--no-ocr`). */
  noOcr?: boolean;
  ocrLanguage?: string;
  ocrServerUrl?: string;
  ocrServerHeader?: Record<string, string>;
  maxPages?: number;
  targetPages?: string;
  dpi?: number;
  preserveSmallText?: boolean;
  password?: string;
  quiet?: boolean;
  numWorkers?: number;
  complexity?: boolean;
  config?: string;
};

export function buildConfig(opts: CliParseOptions): Partial<LiteParseConfig> {
  const config: Partial<LiteParseConfig> = {};

  if (opts.config) {
    const fileConfig = JSON.parse(
      readFileSync(opts.config, "utf-8"),
    ) as Partial<LiteParseConfig>;
    Object.assign(config, fileConfig);
  }

  if (opts.format) config.outputFormat = opts.format as OutputFormat;
  if (opts.imageMode) {
    config.imageMode = opts.imageMode as LiteParseConfig["imageMode"];
  }
  if (opts.links === false) config.extractLinks = false;
  if (opts.ocrServerUrl) config.ocrServerUrl = opts.ocrServerUrl;
  if (opts.ocrServerHeader) config.ocrServerHeaders = opts.ocrServerHeader;
  if (opts.ocrLanguage) config.ocrLanguage = opts.ocrLanguage;
  if (opts.maxPages) config.maxPages = opts.maxPages;
  if (opts.targetPages) config.targetPages = opts.targetPages;
  if (opts.dpi) config.dpi = opts.dpi;
  if (opts.preserveSmallText) config.preserveVerySmallText = true;
  if (opts.password) config.password = opts.password;
  if (opts.quiet) config.quiet = true;
  if (opts.numWorkers) config.numWorkers = opts.numWorkers;
  if (opts.complexity) config.includeComplexity = true;

  // OCR on by default (LiteParse uses local tessdata). --no-ocr → ocr:false.
  config.ocrEnabled = opts.noOcr !== true && opts.ocr !== false;
  config.ocrFailureFatal = false;
  const tessdataPath = resolveTessdataPath();
  if (tessdataPath) config.tessdataPath = tessdataPath;

  return config;
}

export function formatParseResult(
  result: ParseResult,
  format: OutputFormat,
  includeComplexity = false,
): string {
  if (format === "json") {
    return JSON.stringify(
      {
        pages: result.pages.map((p) => ({
          page: p.pageNum,
          width: p.width,
          height: p.height,
          text: p.text,
          markdown: p.markdown,
          textItems: p.textItems,
          ...(includeComplexity && p.complexity
            ? { complexity: p.complexity }
            : {}),
        })),
      },
      null,
      2,
    );
  }

  return result.text;
}
