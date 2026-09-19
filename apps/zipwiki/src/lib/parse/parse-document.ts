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
 * Prefer LlamaParse when a cloud client/key is available; otherwise LiteParse.
 * When `onMissingApiKey` is `error`, missing key / LlamaParse failures throw.
 */
async function parseLlamaPreferLite(
  path: string,
  runtime: ParseRuntimeOptions,
  lite: LiteParseAdapter,
  llama: LlamaParseAdapter,
  options: ParseDocumentOptions,
): Promise<DocumentParseResult> {
  const onMissing = runtime.project.parser.escalate.onMissingApiKey;
  const canLlama =
    isLlamaCloudConfigured() || Boolean(options.llamaparse);

  if (!canLlama) {
    if (onMissing === "error") {
      throw new Error(
        "LlamaParse requires LLAMA_CLOUD_API_KEY (or an injected LlamaCloud client).",
      );
    }
    const probe = await lite.parse(path, runtime);
    return {
      ...probe,
      route: {
        mode: "fixed",
        reason: "llamaparse unavailable (no API key); using liteparse",
      },
    };
  }

  try {
    return await llama.parse(path, runtime);
  } catch (err) {
    if (onMissing === "error") throw err;
    const probe = await lite.parse(path, runtime);
    return {
      ...probe,
      route: {
        mode: "fixed",
        reason: `llamaparse unavailable (${errMessage(err)}); using liteparse`,
      },
    };
  }
}

/**
 * Parse a document with the configured engine (`fixed`) or auto-escalate
 * from LiteParse → LlamaParse when complexity thresholds fire.
 *
 * Fixed `llamaparse` (the default): try LlamaParse when available, else
 * LiteParse. Fixed `liteparse`: always local. Auto: probe LiteParse, escalate
 * when thresholds fire.
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
    return remote.parse(path, runtime);
  }

  const lite = options.liteparse ?? new LiteParseAdapter();
  const llama = options.llamaparse ?? new LlamaParseAdapter();

  const mode = project.parser.mode;
  const engine = project.parser.engine;
  const escalateCfg = project.parser.escalate;

  if (mode !== "auto") {
    if (engine === "llamaparse") {
      return parseLlamaPreferLite(path, runtime, lite, llama, options);
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
