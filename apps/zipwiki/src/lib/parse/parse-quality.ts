import { createRequire } from "node:module";
import type { ParseResult } from "@llamaindex/liteparse";
import type {
  NeoZipAiParser,
  NeoZipOcrConfidence,
  NeoZipParseComplexity,
  NeoZipParseComplexityPage,
} from "../archive/index.js";
import type { DocumentParseResult } from "./types.js";

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Resolve installed `@llamaindex/liteparse` version when available. */
export function liteparseEngineVersion(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@llamaindex/liteparse/package.json") as {
      version?: string;
    };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/** Resolve installed `@llamaindex/llama-cloud` version when available. */
export function llamaparseEngineVersion(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@llamaindex/llama-cloud/package.json") as {
      version?: string;
    };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/** Aggregate optional per-text-item OCR confidence values from a LiteParse result. */
export function summarizeOcrConfidence(
  result: ParseResult,
): NeoZipOcrConfidence {
  let totalItemCount = 0;
  let scoredItemCount = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const page of result.pages) {
    for (const item of page.textItems) {
      totalItemCount += 1;
      if (typeof item.confidence !== "number" || Number.isNaN(item.confidence)) {
        continue;
      }
      scoredItemCount += 1;
      sum += item.confidence;
      if (item.confidence < min) min = item.confidence;
      if (item.confidence > max) max = item.confidence;
    }
  }

  if (scoredItemCount === 0) {
    return { totalItemCount, scoredItemCount };
  }

  return {
    totalItemCount,
    scoredItemCount,
    mean: round4(sum / scoredItemCount),
    min: round4(min),
    max: round4(max),
  };
}

/**
 * Roll up LiteParse `includeComplexity` page stats into a thin manifest block.
 * This is risk / routing signal — not a document parse-accuracy score.
 */
export function summarizeParseComplexity(
  result: ParseResult,
): NeoZipParseComplexity | undefined {
  const pagesWithComplexity = result.pages.filter((p) => p.complexity);
  if (pagesWithComplexity.length === 0) return undefined;

  const reasonCounts: Record<string, number> = {};
  const layoutReasonCounts: Record<string, number> = {};
  let needsOcrCount = 0;
  let layoutComplexCount = 0;
  let maxColumnCount = 1;

  const pages: NeoZipParseComplexityPage[] = pagesWithComplexity.map((p) => {
    const c = p.complexity!;
    if (c.needsOcr) needsOcrCount += 1;
    for (const r of c.reasons) bump(reasonCounts, r);

    const layout = c.layout;
    if (layout?.isComplex) layoutComplexCount += 1;
    if (layout) {
      for (const r of layout.reasons) bump(layoutReasonCounts, r);
      if (layout.columnCount > maxColumnCount) {
        maxColumnCount = layout.columnCount;
      }
    }

    return {
      page: c.pageNumber,
      needsOcr: c.needsOcr,
      reasons: [...c.reasons],
      textCoverage: round4(c.textCoverage),
      isGarbled: c.isGarbled,
      ...(layout
        ? {
            layoutComplex: layout.isComplex,
            layoutReasons: [...layout.reasons],
            columnCount: layout.columnCount,
            ruledTableCount: layout.ruledTableCount,
            textTableRunCount: layout.textTableRunCount,
            figureCount: layout.figureCount,
          }
        : {}),
    };
  });

  const pageCount = pages.length;
  return {
    pageCount,
    needsOcrCount,
    needsOcrRatio: pageCount > 0 ? round4(needsOcrCount / pageCount) : 0,
    layoutComplexCount,
    layoutComplexRatio:
      pageCount > 0 ? round4(layoutComplexCount / pageCount) : 0,
    reasonCounts,
    layoutReasonCounts,
    maxColumnCount,
    pages,
  };
}

/** Build `ai.parser` from a neutral {@link DocumentParseResult}. */
export function buildParserManifestFromParts(
  result: DocumentParseResult,
  overrides: Partial<NeoZipAiParser> = {},
): NeoZipAiParser {
  return {
    engine: result.engine,
    ...(result.engineVersion ? { engineVersion: result.engineVersion } : {}),
    includeComplexity: Boolean(result.complexity),
    ...(result.complexity ? { complexity: result.complexity } : {}),
    ...(result.ocrConfidence ? { ocrConfidence: result.ocrConfidence } : {}),
    ...(result.route ? { route: result.route } : {}),
    ...overrides,
  };
}

/**
 * Build `ai.parser` metadata from a LiteParse result (complexity + OCR confidence).
 * Prefer {@link buildParserManifestFromParts} for multi-engine packs.
 */
export function buildParserManifest(
  result: ParseResult,
  overrides: Partial<NeoZipAiParser> = {},
): NeoZipAiParser {
  const complexity = summarizeParseComplexity(result);
  const ocrConfidence = summarizeOcrConfidence(result);
  const engineVersion = liteparseEngineVersion();

  return buildParserManifestFromParts(
    {
      engine: "liteparse",
      ...(engineVersion ? { engineVersion } : {}),
      text: result.text,
      ...(complexity ? { complexity } : {}),
      ocrConfidence,
    },
    overrides,
  );
}

/** Merge complexity summaries from several primaries (collection packs). */
export function mergeParserManifests(
  parsers: NeoZipAiParser[],
): NeoZipAiParser | undefined {
  if (parsers.length === 0) return undefined;
  if (parsers.length === 1) return parsers[0];

  const reasonCounts: Record<string, number> = {};
  const layoutReasonCounts: Record<string, number> = {};
  const pages: NeoZipParseComplexityPage[] = [];
  let needsOcrCount = 0;
  let layoutComplexCount = 0;
  let maxColumnCount = 1;
  let totalItems = 0;
  let scoredItems = 0;
  let confSum = 0;
  let confMin = Number.POSITIVE_INFINITY;
  let confMax = Number.NEGATIVE_INFINITY;
  let anyComplexity = false;

  for (const p of parsers) {
    if (p.complexity) {
      anyComplexity = true;
      needsOcrCount += p.complexity.needsOcrCount;
      layoutComplexCount += p.complexity.layoutComplexCount;
      maxColumnCount = Math.max(maxColumnCount, p.complexity.maxColumnCount);
      for (const [k, v] of Object.entries(p.complexity.reasonCounts)) {
        reasonCounts[k] = (reasonCounts[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(p.complexity.layoutReasonCounts)) {
        layoutReasonCounts[k] = (layoutReasonCounts[k] ?? 0) + v;
      }
      pages.push(...p.complexity.pages);
    }
    if (p.ocrConfidence) {
      totalItems += p.ocrConfidence.totalItemCount;
      scoredItems += p.ocrConfidence.scoredItemCount;
      if (
        typeof p.ocrConfidence.mean === "number" &&
        p.ocrConfidence.scoredItemCount > 0
      ) {
        confSum += p.ocrConfidence.mean * p.ocrConfidence.scoredItemCount;
      }
      if (typeof p.ocrConfidence.min === "number") {
        confMin = Math.min(confMin, p.ocrConfidence.min);
      }
      if (typeof p.ocrConfidence.max === "number") {
        confMax = Math.max(confMax, p.ocrConfidence.max);
      }
    }
  }

  const pageCount = pages.length;
  const ocrConfidence: NeoZipOcrConfidence = {
    totalItemCount: totalItems,
    scoredItemCount: scoredItems,
    ...(scoredItems > 0
      ? {
          mean: round4(confSum / scoredItems),
          min: round4(confMin),
          max: round4(confMax),
        }
      : {}),
  };

  const engineVersion =
    parsers.find((p) => p.engineVersion)?.engineVersion ??
    liteparseEngineVersion();

  const engines = new Set(parsers.map((p) => p.engine).filter(Boolean));
  const engine =
    engines.size === 1
      ? (parsers[0]?.engine ?? "liteparse")
      : "mixed";

  const route = parsers.find((p) => p.route)?.route;

  return {
    engine,
    ...(engineVersion ? { engineVersion } : {}),
    includeComplexity: anyComplexity,
    ...(anyComplexity
      ? {
          complexity: {
            pageCount,
            needsOcrCount,
            needsOcrRatio: pageCount > 0 ? round4(needsOcrCount / pageCount) : 0,
            layoutComplexCount,
            layoutComplexRatio:
              pageCount > 0 ? round4(layoutComplexCount / pageCount) : 0,
            reasonCounts,
            layoutReasonCounts,
            maxColumnCount,
            pages,
          },
        }
      : {}),
    ocrConfidence,
    ...(route ? { route } : {}),
  };
}

/** Whether complexity rollup warrants LlamaParse escalation. */
export function shouldEscalateToLlamaParse(
  complexity: NeoZipParseComplexity | undefined,
  escalate: {
    minNeedsOcrRatio: number;
    minLayoutComplexRatio: number;
  },
): { escalate: boolean; reason?: string } {
  if (!complexity || complexity.pageCount === 0) {
    return { escalate: false };
  }
  if (complexity.needsOcrRatio >= escalate.minNeedsOcrRatio) {
    return {
      escalate: true,
      reason: `needsOcrRatio ${complexity.needsOcrRatio} >= ${escalate.minNeedsOcrRatio}`,
    };
  }
  if (complexity.layoutComplexRatio >= escalate.minLayoutComplexRatio) {
    return {
      escalate: true,
      reason: `layoutComplexRatio ${complexity.layoutComplexRatio} >= ${escalate.minLayoutComplexRatio}`,
    };
  }
  return { escalate: false };
}

/** Default minimum letters/digits for a parse to count as usable content. */
export const MIN_PARSE_CONTENT_CHARS = 40;

/**
 * Strip LiteParse/markdown scaffolding so empty page shells do not look like
 * real content (` ```text `, `-----` separators, etc.).
 */
export function stripParseBoilerplate(text: string): string {
  return text
    .replace(/```[\w-]*\r?\n?/g, "")
    .replace(/```/g, "")
    .replace(/^-{3,}\s*$/gm, "")
    .replace(/\u0000/g, "")
    .trim();
}

export type ParseYieldAssessment =
  | { ok: true; contentChars: number }
  | { ok: false; reason: string; contentChars: number };

/**
 * Decide whether a parse produced usable text. LiteParse often "succeeds" on
 * scanned PDFs with empty text + `needsOcr` — treat that as a failed extract
 * so callers can skip writing empty `.md` files.
 */
export function assessParseYield(
  text: string,
  opts?: {
    complexity?: NeoZipParseComplexity;
    minContentChars?: number;
  },
): ParseYieldAssessment {
  const cleaned = stripParseBoilerplate(text ?? "");
  const contentChars = (cleaned.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const min = opts?.minContentChars ?? MIN_PARSE_CONTENT_CHARS;

  if (contentChars >= min) {
    return { ok: true, contentChars };
  }

  const c = opts?.complexity;
  const needsOcr =
    Boolean(c) &&
    c!.pageCount > 0 &&
    c!.needsOcrRatio >= 0.99;

  if (needsOcr) {
    return {
      ok: false,
      reason: "no extractable text (document needs OCR)",
      contentChars,
    };
  }

  return {
    ok: false,
    reason:
      contentChars === 0
        ? "no extractable text"
        : `insufficient extractable text (${contentChars} < ${min} content chars)`,
    contentChars,
  };
}
