import type { CliParseOptions } from "./config.js";

/** Defaults used to hide unchanged parse-header lines. */
const HEADER_DEFAULTS = {
  mode: "fixed" as const,
  ocr: true,
  format: "markdown",
  ocrLanguage: "eng",
  maxPages: 1000,
  dpi: 150,
  concurrency: 2,
  phase: "all",
  escalateNeedsOcrRatio: 0.25,
  escalateLayoutRatio: 0.5,
};

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

/** Short labels for the selectable LlamaParse tier. */
function shortLlamaTier(tier?: string): string | undefined {
  const t = tier?.trim().toLowerCase();
  if (!t) return undefined;
  if (
    t === "cost_effective" ||
    t === "turbo" ||
    t === "fast" ||
    t === "quick" ||
    t === "cost-effective"
  ) {
    return "fast";
  }
  if (t === "agentic") return "agentic";
  if (t === "agentic_plus") return "agentic+";
  return t;
}

/** Selectable parser summary, e.g. `llamaparse, fast` or `liteparse`. */
export function formatParseEngineSummary(
  info: Pick<ParseHeaderInfo, "engine" | "llamaTier">,
): string {
  if (info.engine === "llamaparse") {
    const tier = shortLlamaTier(info.llamaTier);
    return tier ? `llamaparse, ${tier}` : "llamaparse";
  }
  if (info.engine === "auto") {
    const tier = shortLlamaTier(info.llamaTier);
    return tier
      ? `auto → liteparse / llamaparse, ${tier}`
      : "auto → liteparse / llamaparse";
  }
  return "liteparse";
}

function pushIf(
  lines: string[],
  key: string,
  value: string | number | boolean | undefined,
): void {
  if (value === undefined) return;
  lines.push(`[parse] ${key.padEnd(11)} ${value}`);
}

/**
 * Parse session header: selectable engine, a few basics, and only non-default
 * options. Skips tessdata paths, key presence, and other unchanged noise.
 */
export function formatParseHeader(info: ParseHeaderInfo): string[] {
  const lines: string[] = [`[parse] ${formatParseEngineSummary(info)}`];

  if (info.fileCount !== undefined) {
    pushIf(lines, "files", info.fileCount);
  }

  // OCR is a basic control; always show on/off.
  pushIf(lines, "ocr", onOff(info.ocr));

  if (info.mode && info.mode !== HEADER_DEFAULTS.mode) {
    pushIf(lines, "mode", info.mode);
  }
  if (info.format && info.format !== HEADER_DEFAULTS.format) {
    pushIf(lines, "format", info.format);
  }
  if (
    info.ocr &&
    info.ocrLanguage &&
    info.ocrLanguage !== HEADER_DEFAULTS.ocrLanguage
  ) {
    pushIf(lines, "ocrLanguage", info.ocrLanguage);
  }
  if (info.ocrServerUrl) {
    pushIf(lines, "ocrServer", info.ocrServerUrl);
  }
  if (
    info.maxPages !== undefined &&
    info.maxPages !== HEADER_DEFAULTS.maxPages
  ) {
    pushIf(lines, "maxPages", info.maxPages);
  }
  if (info.dpi !== undefined && info.dpi !== HEADER_DEFAULTS.dpi) {
    pushIf(lines, "dpi", info.dpi);
  }
  if (info.targetPages) {
    pushIf(lines, "targetPages", info.targetPages);
  }
  if (info.numWorkers !== undefined) {
    pushIf(lines, "numWorkers", info.numWorkers);
  }
  if (info.recursive === true) {
    pushIf(lines, "recursive", onOff(true));
  }
  if (info.complexity === true) {
    pushIf(lines, "complexity", onOff(true));
  }
  if (info.mode === "auto") {
    if (
      info.escalateNeedsOcrRatio !== undefined &&
      info.escalateNeedsOcrRatio !== HEADER_DEFAULTS.escalateNeedsOcrRatio
    ) {
      pushIf(lines, "escalateOCR", `>= ${info.escalateNeedsOcrRatio}`);
    }
    if (
      info.escalateLayoutRatio !== undefined &&
      info.escalateLayoutRatio !== HEADER_DEFAULTS.escalateLayoutRatio
    ) {
      pushIf(lines, "escalateLay", `>= ${info.escalateLayoutRatio}`);
    }
  }

  if (info.extra) {
    for (const [k, v] of Object.entries(info.extra)) {
      if (v === undefined) continue;
      if (k === "concurrency" && v === HEADER_DEFAULTS.concurrency) continue;
      if (k === "phase" && v === HEADER_DEFAULTS.phase) continue;
      // Pack plan already covers OKF; skip the default-on noise.
      if (k === "okfAi" && v === true) continue;
      pushIf(lines, k, v);
    }
  }

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
