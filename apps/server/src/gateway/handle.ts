import {
  invokeAnthropic,
  invokeQueryAnswer,
  type OkfRequest,
} from "./anthropic.js";
import {
  invokeLlamaParse,
  LlamaParseTimeoutError,
  type LlamaParseProgress,
} from "./llamaparse.js";
import type { ConvexGateway, GatewayResponse } from "./types.js";

export type GatewayDeps = {
  convex: ConvexGateway;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
  /** Test / ops override for LlamaParse poll budget. */
  llamaWait?: {
    maxWaitMs?: number;
    progressEveryMs?: number;
    pollIntervalMs?: number;
  };
};

function masterKey(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value || null;
}

export async function handleParse(
  deps: GatewayDeps,
  args: {
    token: string;
    filename: string;
    bytes: Uint8Array;
    noOcr?: boolean;
    tier?: string;
    version?: string;
    onProgress?: (info: LlamaParseProgress) => void;
  },
): Promise<GatewayResponse> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  let validated;
  try {
    validated = await deps.convex.validateKey(args.token, "parse");
  } catch {
    return { status: 503, body: { error: "convex_unavailable" } };
  }
  if (!validated.ok) {
    return { status: validated.status, body: { error: validated.error } };
  }
  if (!validated.billable || validated.fallback) {
    return {
      status: 200,
      body: {
        engine: "liteparse",
        text: "",
        forcedEngine: "liteparse",
        fallbackReason: "quota_fallback_free",
      },
    };
  }
  const apiKey = masterKey(env, "LLAMA_CLOUD_API_KEY");
  if (!apiKey) return { status: 503, body: { error: "llamaparse_not_configured" } };

  let parsed;
  try {
    parsed = await invokeLlamaParse(
      {
        filename: args.filename,
        bytes: args.bytes,
        noOcr: args.noOcr,
        tier: args.tier,
        version: args.version,
      },
      apiKey,
      fetchImpl,
      deps.sleep,
      args.onProgress,
      deps.llamaWait,
    );
  } catch (err) {
    if (err instanceof LlamaParseTimeoutError) {
      return {
        status: 200,
        body: {
          engine: "liteparse",
          text: "",
          forcedEngine: "liteparse",
          fallbackReason: "llamaparse_timeout",
          error: err.message,
          jobId: err.jobId,
          lastStatus: err.lastStatus,
        },
      };
    }
    const message = err instanceof Error ? err.message : "parse_failed";
    return { status: 502, body: { error: message } };
  }

  try {
    await deps.convex.recordUsage({
      accountId: validated.accountId,
      kind: "parse",
      billable: true,
      usage: {
        provider: "llamaparse",
        engine: "llamaparse",
        pages: parsed.pageCount,
        bytes: args.bytes.byteLength,
        filename: args.filename,
        ...(parsed.jobId ? { jobId: parsed.jobId } : {}),
        ...(parsed.llamaCredits != null
          ? { llamaCredits: parsed.llamaCredits }
          : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "record_usage_failed";
    return { status: 502, body: { error: message } };
  }

  return {
    status: 200,
    body: {
      engine: "llamaparse",
      text: parsed.text,
      pages: parsed.pages.map((page) => ({
        pageNum: page.pageNum,
        markdown: page.markdown,
        text: page.markdown,
      })),
    },
  };
}

export async function handleOkf(
  deps: GatewayDeps,
  args: { token: string; input: OkfRequest; model?: string },
): Promise<GatewayResponse> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  let validated;
  try {
    validated = await deps.convex.validateKey(args.token, "okf");
  } catch {
    return { status: 503, body: { error: "convex_unavailable" } };
  }
  if (!validated.ok) {
    return { status: validated.status, body: { error: validated.error } };
  }
  if (!validated.billable || validated.fallback) {
    return {
      status: 402,
      body: {
        code: "okf_fallback_host_llm",
        error:
          "ZipWiki OKF unavailable (credits exhausted). Use host-LLM enrichment.",
      },
    };
  }
  const apiKey = masterKey(env, "ANTHROPIC_API_KEY");
  if (!apiKey) return { status: 503, body: { error: "anthropic_not_configured" } };

  let completion;
  try {
    completion = await invokeAnthropic(
      args.input,
      apiKey,
      fetchImpl,
      args.model,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "okf_failed";
    return { status: 502, body: { error: message } };
  }

  try {
    await deps.convex.recordUsage({
      accountId: validated.accountId,
      kind: "okf",
      billable: true,
      usage: {
        provider: "anthropic",
        model: completion.model,
        engine: "anthropic",
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "record_usage_failed";
    return { status: 502, body: { error: message } };
  }

  return { status: 200, body: completion.enrichment };
}

const QUERY_BODY_CHARS = 12_000;
const QUERY_QUESTION_CHARS = 2_000;

export type QueryExcerptInput = {
  path: string;
  title?: string;
  kind: "okf" | "parsed";
  text: string;
  documents?: string[];
};

/**
 * Answer a package question with the Fly-held Anthropic key.
 * Credit checks stay in Convex; this route only runs the model.
 */
export async function handleQueryAnswer(
  deps: GatewayDeps,
  args: {
    question: string;
    excerpts: QueryExcerptInput[];
    packageSkills?: string[];
  },
): Promise<GatewayResponse> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = masterKey(env, "ANTHROPIC_API_KEY");
  if (!apiKey) return { status: 503, body: { error: "anthropic_not_configured" } };

  const question = args.question.trim().slice(0, QUERY_QUESTION_CHARS);
  const excerpts = args.excerpts.slice(0, 3).map((excerpt) => ({
    path: excerpt.path.slice(0, 512),
    title: excerpt.title?.slice(0, 240),
    kind: excerpt.kind,
    text: excerpt.text.slice(0, QUERY_BODY_CHARS),
    documents: (excerpt.documents ?? [])
      .filter((path) => path.trim())
      .slice(0, 8)
      .map((path) => path.slice(0, 512)),
  }));
  if (!question || excerpts.every((excerpt) => !excerpt.text.trim())) {
    return { status: 400, body: { error: "invalid_request" } };
  }

  const packageSkills = (args.packageSkills ?? [])
    .filter((s) => typeof s === "string" && s.trim())
    .slice(0, 8)
    .map((s) => s.slice(0, 16_000));

  try {
    const completion = await invokeQueryAnswer(
      question,
      excerpts,
      apiKey,
      fetchImpl,
      undefined,
      packageSkills,
    );
    return { status: 200, body: completion };
  } catch (err) {
    const message = err instanceof Error ? err.message : "query_failed";
    return { status: 502, body: { error: message } };
  }
}
