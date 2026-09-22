import type { ConvexGateway, RecordResult, UsageKind, ValidateResult } from "./types.js";

function siteUrl(env: NodeJS.ProcessEnv): string | null {
  const site = env.CONVEX_SITE_URL?.trim();
  if (site) return site.replace(/\/+$/, "");
  const cloud = env.CONVEX_URL?.trim();
  if (!cloud) return null;
  return cloud.replace(".convex.cloud", ".convex.site").replace(/\/+$/, "");
}

export function createConvexGateway(options?: {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}): ConvexGateway {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const env = options?.env ?? process.env;

  async function post(path: string, body: unknown): Promise<Response> {
    const base = siteUrl(env);
    if (!base) throw new Error("convex_not_configured");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = env.ZIPWIKI_WORKER_SECRET?.trim();
    if (secret) headers["X-ZipWiki-Worker-Secret"] = secret;
    return fetchImpl(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  return {
    async validateKey(token: string, kind: UsageKind): Promise<ValidateResult> {
      const res = await post("/internal/validate-key", {
        api_key: token,
        kind,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        account_id?: string;
        billable?: boolean;
        fallback?: boolean;
      };
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: data.error ?? "unauthorized",
        };
      }
      if (!data.account_id) {
        return { ok: false, status: 401, error: "unauthorized" };
      }
      return {
        ok: true,
        accountId: data.account_id,
        billable: data.billable !== false,
        fallback: data.fallback === true,
      };
    },

    async recordUsage(args): Promise<RecordResult> {
      const res = await post("/internal/record-usage", {
        account_id: args.accountId,
        kind: args.kind,
        billable: args.billable,
        provider: args.usage.provider,
        model: args.usage.model,
        pages: args.usage.pages,
        input_tokens: args.usage.inputTokens,
        output_tokens: args.usage.outputTokens,
        bytes: args.usage.bytes,
        engine: args.usage.engine,
        llama_credits: args.usage.llamaCredits,
      });
      const data = (await res.json().catch(() => ({}))) as RecordResult & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "record_usage_failed");
      }
      return {
        creditsRemaining: data.creditsRemaining ?? 0,
        lowCredits: data.lowCredits === true,
        autoReload: data.autoReload === true,
      };
    },
  };
}
