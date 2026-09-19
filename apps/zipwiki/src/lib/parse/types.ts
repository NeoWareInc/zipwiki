import type {
  NeoZipAiParser,
  NeoZipOcrConfidence,
  NeoZipParseComplexity,
} from "../archive/index.js";
import type { ParseEngineId, ResolvedZipwikiConfig } from "../config/index.js";
import type { CliParseOptions } from "./config.js";

export type { ParseEngineId };

export type DocumentParsePage = {
  pageNum: number;
  text?: string;
  markdown?: string;
};

/** Neutral parse result shared by LiteParse and LlamaParse adapters. */
export type DocumentParseResult = {
  engine: ParseEngineId;
  engineVersion?: string;
  /** Whole-document markdown for `codex/parsed/{P}.md`. */
  text: string;
  pages?: DocumentParsePage[];
  complexity?: NeoZipParseComplexity;
  ocrConfidence?: NeoZipOcrConfidence;
  route?: NeoZipAiParser["route"];
  raw?: unknown;
};

export type ParseRuntimeOptions = {
  project: ResolvedZipwikiConfig;
  /** CLI LiteParse-oriented flags (ocr, maxPages, dpi, …). */
  cli?: CliParseOptions & { noOcr?: boolean; quiet?: boolean };
};

export interface DocumentParser {
  readonly id: ParseEngineId;
  parse(path: string, opts: ParseRuntimeOptions): Promise<DocumentParseResult>;
}
