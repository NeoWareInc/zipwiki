import {
  isLlamaCloudConfigured,
  isRemoteParseMode,
  loadEnvFiles,
  type ResolvedZipwikiConfig,
} from "../config/index.js";
import { LiteParseAdapter } from "./adapters/liteparse.js";
import { LlamaParseAdapter } from "./adapters/llamaparse.js";
import { RemoteParseAdapter } from "./adapters/remote.js";
import { shouldEscalateToLlamaParse } from "./parse-quality.js";
import type { CliParseOptions } from "./config.js";
import type { DocumentParseResult, ParseRuntimeOptions } from "./types.js";

export type ParseDocumentOptions = {
  project: ResolvedZipwikiConfig;
  cli?: CliParseOptions & { noOcr?: boolean; quiet?: boolean };
  /** Force remote parse API (overrides ZIPWIKI_PARSE_MODE). */
  remoteParse?: boolean;
  /** Inject adapters for tests. */
  liteparse?: LiteParseAdapter;
  llamaparse?: LlamaParseAdapter;
  remote?: RemoteParseAdapter;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fixed LlamaParse. A missing key or a LlamaParse error is reported.
 * LiteParse is not substituted after the plan already says LlamaParse.
 */
async function parseFixedLlama(
  path: string,
  runtime: ParseRuntimeOptions,
  llama: LlamaParseAdapter,
  options: ParseDocumentOptions,
): Promise<DocumentParseResult> {
  const canLlama =
    isLlamaCloudConfigured() || Boolean(options.llamaparse);

  if (!canLlama) {
    throw new Error(
      "LlamaParse is selected, but LLAMA_CLOUD_API_KEY is not set. ZipWiki will not switch to LiteParse.\n" +
        "  Hosted LlamaParse: zipwiki auth login\n" +
        "  This machine: zipwiki config api-key llama <LLAMA_CLOUD_API_KEY>",
    );
  }

  return llama.parse(path, runtime);
}

/**
 * Parse a document with the configured engine (`fixed`) or auto-escalate
 * from LiteParse → LlamaParse when complexity thresholds fire.
 *
 * Fixed `llamaparse`: LlamaParse only. Fixed `liteparse`: always local.
 * Auto: probe LiteParse, escalate when thresholds fire, and fall back to
 * LiteParse only when escalation was not required.
 *
 * When `ZIPWIKI_PARSE_MODE=remote` (or `remoteParse: true`), delegates to
 * the ZipWiki parse API server.
 */
export async function parseDocument(
  path: string,
  options: ParseDocumentOptions,
): Promise<DocumentParseResult> {
  loadEnvFiles();
  const { project, cli } = options;
  const runtime: ParseRuntimeOptions = { project, cli };

  if (isRemoteParseMode({ remoteParse: options.remoteParse })) {
    const remote = options.remote ?? new RemoteParseAdapter();
    try {
      return await remote.parse(path, runtime);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code !== "quota_fallback_free" && code !== "free_plan") throw err;
      const lite = options.liteparse ?? new LiteParseAdapter();
      const probe = await lite.parse(path, runtime);
      return {
        ...probe,
        route: { mode: "fixed", reason: errMessage(err) },
      };
    }
  }

  const lite = options.liteparse ?? new LiteParseAdapter();
  const llama = options.llamaparse ?? new LlamaParseAdapter();

  const mode = project.parser.mode;
  const engine = project.parser.engine;
  const escalateCfg = project.parser.escalate;

  if (mode !== "auto") {
    if (engine === "llamaparse") {
      return parseFixedLlama(path, runtime, llama, options);
    }
    return lite.parse(path, runtime);
  }

  // Auto: probe with LiteParse, escalate when thresholds hit.
  const probe = await lite.parse(path, runtime);
  const decision = shouldEscalateToLlamaParse(probe.complexity, escalateCfg);
  if (!decision.escalate) {
    return {
      ...probe,
      route: { mode: "auto" },
    };
  }

  if (!isLlamaCloudConfigured() && !options.llamaparse) {
    if (escalateCfg.onMissingApiKey === "error") {
      throw new Error(
        `Auto-escalate to LlamaParse required (${decision.reason}) but LLAMA_CLOUD_API_KEY is not set.`,
      );
    }
    return {
      ...probe,
      route: {
        mode: "auto",
        reason: `escalate skipped (no API key): ${decision.reason}`,
      },
    };
  }

  try {
    const cloud = await llama.parse(path, runtime);
    return {
      ...cloud,
      // Keep LiteParse complexity for inspection when available.
      ...(probe.complexity ? { complexity: probe.complexity } : {}),
      ...(probe.ocrConfidence ? { ocrConfidence: probe.ocrConfidence } : {}),
      route: {
        mode: "auto",
        escalatedFrom: "liteparse",
        reason: decision.reason,
      },
    };
  } catch (err) {
    if (escalateCfg.onMissingApiKey === "error") throw err;
    return {
      ...probe,
      route: {
        mode: "auto",
        reason: `escalate failed (${errMessage(err)}); using liteparse: ${decision.reason}`,
      },
    };
  }
}
