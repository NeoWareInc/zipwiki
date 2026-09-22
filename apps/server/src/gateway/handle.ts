import { invokeAnthropic, type OkfRequest } from "./anthropic.js";
import { invokeLlamaParse } from "./llamaparse.js";
import type { ConvexGateway, GatewayResponse } from "./types.js";

export type GatewayDeps = {
  convex: ConvexGateway;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  sleep?: (ms: number) => Promise<void>;
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
      { filename: args.filename, bytes: args.bytes, noOcr: args.noOcr },
      apiKey,
      fetchImpl,
      deps.sleep,
    );
  } catch (err) {
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
  args: { token: string; input: OkfRequest },
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
    completion = await invokeAnthropic(args.input, apiKey, fetchImpl);
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
