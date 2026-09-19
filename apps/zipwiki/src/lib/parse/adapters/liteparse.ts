import LiteParse from "@llamaindex/liteparse";
import { buildConfig } from "../config.js";
import {
  buildParserManifestFromParts,
  liteparseEngineVersion,
  summarizeOcrConfidence,
  summarizeParseComplexity,
} from "../parse-quality.js";
import { annotateParseError } from "../libreoffice-hint.js";
import { resolveParseOcrEnabled } from "../parse-header.js";
import { resolveTessdataPath } from "../tessdata.js";
import type {
  DocumentParser,
  DocumentParseResult,
  ParseRuntimeOptions,
} from "../types.js";

export class LiteParseAdapter implements DocumentParser {
  readonly id = "liteparse" as const;

  async parse(
    path: string,
    opts: ParseRuntimeOptions,
  ): Promise<DocumentParseResult> {
    try {
      const lp = opts.project.parser.liteparse;
      const cli = opts.cli ?? {};
      const ocrWanted = resolveParseOcrEnabled(cli, opts.project);

      const config = buildConfig({
        ...cli,
        format: "markdown",
        ocr: ocrWanted,
        maxPages: cli.maxPages ?? lp.maxPages,
        dpi: cli.dpi ?? lp.dpi,
        ocrLanguage: cli.ocrLanguage ?? lp.ocrLanguage,
        config: cli.config ?? lp.configFile,
        quiet: cli.quiet,
      });
      config.outputFormat = "markdown";
      config.includeComplexity =
        lp.includeComplexity !== false || Boolean(cli.complexity);
      config.ocrEnabled = ocrWanted;
      config.ocrFailureFatal = false;
      const tessdataPath = resolveTessdataPath();
      if (tessdataPath) config.tessdataPath = tessdataPath;

      const parser = new LiteParse(config);
      const result = await parser.parse(path);
      const complexity = summarizeParseComplexity(result);
      const ocrConfidence = summarizeOcrConfidence(result);
      const engineVersion = liteparseEngineVersion();

      return {
        engine: "liteparse",
        ...(engineVersion ? { engineVersion } : {}),
        text: result.text,
        pages: result.pages.map((p) => ({
          pageNum: p.pageNum,
          text: p.text,
          markdown: p.markdown,
        })),
        ...(complexity ? { complexity } : {}),
        ocrConfidence,
        raw: result,
      };
    } catch (err) {
      throw annotateParseError(err);
    }
  }
}

export function documentResultToManifest(
  result: DocumentParseResult,
): ReturnType<typeof buildParserManifestFromParts> {
  return buildParserManifestFromParts(result);
}
