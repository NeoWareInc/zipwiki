import type {
  AccountSettingsPayload,
  ConvexGateway,
  RecordResult,
  UsageKind,
  ValidateResult,
} from "./types.js";

function siteUrl(env: NodeJS.ProcessEnv): string | null {
  const raw =
    env.CONVEX_SITE_URL?.trim() || env.CONVEX_URL?.trim() || "";
  if (!raw) return null;
  // Always talk to the HTTP Actions host (*.convex.site), never *.convex.cloud.
  // Strip trailing dots/slashes — a trailing "." (e.g. from secrets paste) makes
  // every validate-key call 404 and surfaces as "unauthorized" to the CLI.
  return raw
    .replace(/\.convex\.cloud\b/i, ".convex.site")
    .replace(/[\.\/]+$/g, "");
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

  function settingsFromRow(data: {
    settings?: unknown;
    setupComplete?: boolean;
    setupCompletedAt?: string | number | null;
    updatedAt?: string | number | null;
    setupUrl?: string | null;
  }): AccountSettingsPayload {
    const completedAt = data.setupCompletedAt;
    const updatedAt = data.updatedAt;
    return {
      settings: data.settings ?? {},
      setupComplete: data.setupComplete === true,
      setupCompletedAt:
        completedAt == null
          ? null
          : typeof completedAt === "number"
            ? new Date(completedAt).toISOString()
            : completedAt,
      updatedAt:
        updatedAt == null
          ? null
          : typeof updatedAt === "number"
            ? new Date(updatedAt).toISOString()
            : updatedAt,
      setupUrl: data.setupUrl ?? null,
    };
  }

  return {
    async validateKey(token: string, kind?: UsageKind): Promise<ValidateResult> {
      const res = await post("/internal/validate-key", {
        api_key: token,
        ...(kind ? { kind } : {}),
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
        filename: args.usage.filename,
        job_id: args.usage.jobId,
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

    async getAccountSettings(accountId: string): Promise<AccountSettingsPayload> {
      const res = await post("/internal/account-settings", {
        account_id: accountId,
        action: "get",
      });
      const data = (await res.json().catch(() => ({}))) as AccountSettingsPayload & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "settings_get_failed");
      }
      return settingsFromRow(data);
    },

    async putAccountSettings(args: {
      accountId: string;
      settings: unknown;
      markSetupComplete?: boolean;
    }): Promise<AccountSettingsPayload> {
      const res = await post("/internal/account-settings", {
        account_id: args.accountId,
        action: "put",
        settings_json: JSON.stringify(args.settings ?? {}),
        mark_setup_complete: args.markSetupComplete === true,
      });
      const data = (await res.json().catch(() => ({}))) as AccountSettingsPayload & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "settings_put_failed");
      }
      return settingsFromRow(data);
    },

    async getClientConfig(token: string): Promise<unknown> {
      const res = await post("/internal/client-config", {
        api_key: token,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "client_config_failed");
      }
      return data;
    },

    async recordLiteparse(args: {
      accountId: string;
      success: boolean;
      bytes?: number;
    }): Promise<void> {
      const res = await post("/internal/record-liteparse", {
        account_id: args.accountId,
        success: args.success,
        bytes: args.bytes,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "liteparse_record_failed");
      }
    },

    async recordActivity(args: {
      accountId: string;
      type: "pack" | "query";
      engine?: string;
      status?: string;
      filename?: string;
      bytes?: number;
      pages?: number;
    }): Promise<void> {
      const res = await post("/internal/record-activity", {
        account_id: args.accountId,
        type: args.type,
        engine: args.engine,
        status: args.status,
        filename: args.filename,
        bytes: args.bytes,
        pages: args.pages,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "activity_record_failed");
      }
    },
  };
}
