import { isLlamaCloudConfigured } from "../config/index.js";
import type { CliParseOptions } from "./config.js";

export type ParseHeaderInfo = {
  /** Command context label, e.g. batch-parse | parse-file | pack. */
  command: string;
  engine: "liteparse" | "llamaparse" | "auto";
  mode?: "fixed" | "auto";
  ocr: boolean;
  format?: string;
  ocrLanguage?: string;
  ocrServerUrl?: string;
  /** Directory containing eng.traineddata (local LiteParse OCR). */
  tessdataPath?: string;
  maxPages?: number;
  dpi?: number;
  targetPages?: string;
  numWorkers?: number;
  recursive?: boolean;
  complexity?: boolean;
  /** LlamaParse tier when engine is llamaparse or auto. */
  llamaTier?: string;
  escalateNeedsOcrRatio?: number;
  escalateLayoutRatio?: number;
  fileCount?: number;
  extra?: Record<string, string | number | boolean | undefined>;
};

function onOff(v: boolean): string {
  return v ? "on" : "off";
}

/** Build stderr lines for a parse session header (no trailing blank). */
export function formatParseHeader(info: ParseHeaderInfo): string[] {
  const lines: string[] = [
    "[parse] ────────────────────────────────",
    `[parse] session     ${info.command}`,
    `[parse] engine      ${info.engine}`,
  ];
  if (info.mode) {
    lines.push(`[parse] mode        ${info.mode}`);
  }
  lines.push(`[parse] ocr         ${onOff(info.ocr)}`);
  if (info.format) {
    lines.push(`[parse] format      ${info.format}`);
  }
  if (info.ocr && info.ocrLanguage) {
    lines.push(`[parse] ocrLanguage ${info.ocrLanguage}`);
  }
  if (info.ocr && info.tessdataPath) {
    lines.push(`[parse] tessdata    ${info.tessdataPath}`);
  }
  if (info.ocr && info.ocrServerUrl) {
    lines.push(`[parse] ocrServer   ${info.ocrServerUrl}`);
  }
  if (info.maxPages !== undefined) {
    lines.push(`[parse] maxPages    ${info.maxPages}`);
  }
  if (info.dpi !== undefined) {
    lines.push(`[parse] dpi         ${info.dpi}`);
  }
  if (info.targetPages) {
    lines.push(`[parse] targetPages ${info.targetPages}`);
  }
  if (info.numWorkers !== undefined) {
    lines.push(`[parse] numWorkers  ${info.numWorkers}`);
  }
  if (info.recursive !== undefined) {
    lines.push(`[parse] recursive   ${onOff(info.recursive)}`);
  }
  if (info.complexity !== undefined) {
    lines.push(`[parse] complexity  ${onOff(info.complexity)}`);
  }
  if (
    (info.engine === "llamaparse" || info.engine === "auto") &&
    info.llamaTier
  ) {
    lines.push(`[parse] llamaTier   ${info.llamaTier}`);
  }
  if (info.mode === "auto") {
    if (info.escalateNeedsOcrRatio !== undefined) {
      lines.push(
        `[parse] escalateOCR  >= ${info.escalateNeedsOcrRatio}`,
      );
    }
    if (info.escalateLayoutRatio !== undefined) {
      lines.push(
        `[parse] escalateLay  >= ${info.escalateLayoutRatio}`,
      );
    }
    lines.push(
      `[parse] llamaKey     ${isLlamaCloudConfigured() ? "set" : "missing"}`,
    );
  } else if (info.engine === "llamaparse") {
    lines.push(
      `[parse] llamaKey     ${isLlamaCloudConfigured() ? "set" : "missing"}`,
    );
  }
  if (info.fileCount !== undefined) {
    lines.push(`[parse] files       ${info.fileCount}`);
  }
  if (info.extra) {
    for (const [k, v] of Object.entries(info.extra)) {
      if (v === undefined) continue;
      lines.push(`[parse] ${k.padEnd(11)} ${v}`);
    }
  }
  lines.push("[parse] ────────────────────────────────");
  return lines;
}

export function printParseHeader(info: ParseHeaderInfo): void {
  for (const line of formatParseHeader(info)) {
    console.error(line);
  }
}

/** Resolve effective OCR from CLI flags (default on unless --no-ocr). */
export function resolveCliOcrEnabled(
  opts: CliParseOptions,
): boolean {
  if (opts.noOcr === true || opts.ocr === false) return false;
  return true;
}

/** CLI + project config: whether OCR should run for LiteParse or LlamaParse. */
export function resolveParseOcrEnabled(
  cli: CliParseOptions | undefined,
  project?: {
    pack?: { noOcr?: boolean };
    parser?: { liteparse?: { ocrEnabled?: boolean } };
  },
): boolean {
  if (!resolveCliOcrEnabled(cli ?? {})) return false;
  if (project?.pack?.noOcr === true) return false;
  if (project?.parser?.liteparse?.ocrEnabled === false) return false;
  return true;
}
