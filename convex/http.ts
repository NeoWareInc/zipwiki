import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { canonicalPublicApiUrl } from "./publicApiUrl";

const http = httpRouter();

auth.addHttpRoutes(http);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-ZipWiki-Worker-Secret",
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-ZipWiki-Worker-Secret",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function workerAuthorized(req: Request): boolean {
  const expected = process.env.ZIPWIKI_WORKER_SECRET?.trim();
  if (!expected) return true;
  const got = req.headers.get("x-zipwiki-worker-secret")?.trim();
  return Boolean(got && got === expected);
}

function publicApiUrl(): string {
  return canonicalPublicApiUrl();
}

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () =>
    json({ ok: true, service: "zipwiki-convex" }),
  ),
});

http.route({
  path: "/auth/device/code",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

http.route({
  path: "/auth/device/code",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let clientName = "zipwiki";
    try {
      const body = (await req.json()) as { client?: string; client_name?: string };
      clientName =
        body.client?.trim() || body.client_name?.trim() || "zipwiki";
    } catch {
      /* empty body ok */
    }
    const result = await ctx.runMutation(internal.deviceAuthHttp.requestCode, {
      clientName,
    });
    return json(result);
  }),
});

http.route({
  path: "/auth/device/token",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

http.route({
  path: "/auth/device/token",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let deviceCode = "";
    try {
      const body = (await req.json()) as { device_code?: string };
      deviceCode = body.device_code?.trim() ?? "";
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (!deviceCode) return json({ error: "device_code required" }, 400);

    const result = await ctx.runMutation(internal.deviceAuthHttp.pollToken, {
      deviceCode,
    });

    if (result.status === "pending") {
      return json({ error: "authorization_pending" }, 400);
    }
    if (result.status === "expired") {
      return json({ error: "expired_token" }, 400);
    }
    if (result.status === "denied") {
      return json({ error: "access_denied" }, 400);
    }
    return json({
      api_key: result.access_token,
      key_prefix: result.key_prefix,
      api_url: publicApiUrl(),
      account_id: result.accountId,
      ...(result.email ? { email: result.email } : {}),
    });
  }),
});

http.route({
  path: "/auth/whoami",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

http.route({
  path: "/auth/whoami",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let token = "";
    const header = req.headers.get("authorization") ?? "";
    const bearer = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? "";
    try {
      const body = (await req.json()) as { api_key?: unknown };
      if (typeof body.api_key === "string") token = body.api_key.trim();
    } catch {
      token = "";
    }
    token = token || bearer;
    if (!token) return json({ error: "unauthorized" }, 401);
    const keyCtx = await ctx.runQuery(internal.apiKeys.resolveByToken, {
      token,
    });
    if (!keyCtx?.email) return json({ error: "unauthorized" }, 401);
    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: keyCtx.apiKeyId,
    });
    return json({ email: keyCtx.email });
  }),
});

function bearerFrom(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? "";
}

/** CLI can call Convex directly for settings (Fly may be misconfigured). */
http.route({
  path: "/api/settings",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

http.route({
  path: "/api/settings",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const token = bearerFrom(req);
    if (!token) return json({ error: "unauthorized" }, 401);
    const keyCtx = await ctx.runQuery(internal.apiKeys.resolveByToken, {
      token,
    });
    if (!keyCtx) return json({ error: "unauthorized" }, 401);
    if (keyCtx.accountDisabled || keyCtx.accountStatus === "suspended") {
      return json({ error: "account_disabled" }, 403);
    }
    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: keyCtx.apiKeyId,
    });
    const row = await ctx.runQuery(internal.settings.getByAccountId, {
      accountId: keyCtx.accountId,
    });
    return json({
      settings: row.settings,
      setupComplete: row.setupComplete,
      setupCompletedAt: row.setupCompletedAt,
      updatedAt: row.updatedAt,
      setupUrl: row.setupUrl,
      accountId: keyCtx.accountId,
      ...(keyCtx.email ? { email: keyCtx.email } : {}),
    });
  }),
});

http.route({
  path: "/api/client-config",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

http.route({
  path: "/api/client-config",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const token = bearerFrom(req);
    if (!token) return json({ error: "unauthorized" }, 401);
    const config = await ctx.runQuery(internal.clientConfig.forApiKey, {
      token,
    });
    if (!config) return json({ error: "unauthorized" }, 401);
    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: config.apiKeyId,
    });
    const { accountId: _a, apiKeyId: _k, ...publicConfig } = config;
    return json(publicConfig);
  }),
});

/** Fly worker: validate API key + optional quota check. */
http.route({
  path: "/internal/validate-key",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

http.route({
  path: "/internal/validate-key",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);

    let token = "";
    let kind: "parse" | "okf" | undefined;
    try {
      const body = (await req.json()) as {
        api_key?: string;
        kind?: "parse" | "okf";
      };
      token = body.api_key?.trim() ?? "";
      kind = body.kind;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (!token) return json({ error: "unauthorized" }, 401);

    const keyCtx = await ctx.runQuery(internal.apiKeys.resolveByToken, {
      token,
    });
    if (!keyCtx) return json({ error: "unauthorized" }, 401);
    if (keyCtx.accountDisabled || keyCtx.accountStatus === "suspended") {
      return json({ error: "account_disabled" }, 403);
    }

    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: keyCtx.apiKeyId,
    });

    let entitlement:
      | {
          kind: "parse" | "okf";
          billable: boolean;
          fallback: boolean;
          entitlement: string;
          used: number;
          limit: number;
        }
      | undefined;

    let periodUsage:
      | {
          parseCount: number;
          okfCount: number;
          liteparseSuccessCount: number;
          liteparseFailCount: number;
        }
      | undefined;

    if (kind) {
      const quota = await ctx.runQuery(internal.usage.checkQuota, {
        accountId: keyCtx.accountId,
        kind,
      });
      // Soft fallback: never 429 for exhausted LlamaParse/OKF quotas.
      if (!quota.ok) {
        return json({ error: "unauthorized" }, 401);
      }
      entitlement = {
        kind,
        billable: quota.billable,
        fallback: quota.fallback,
        entitlement: quota.entitlement,
        used: quota.used,
        limit: quota.limit,
      };
      periodUsage = {
        parseCount: quota.parseCount ?? 0,
        okfCount: quota.okfCount ?? 0,
        liteparseSuccessCount: quota.liteparseSuccessCount ?? 0,
        liteparseFailCount: quota.liteparseFailCount ?? 0,
      };
    }

    return json({
      ok: true,
      account_id: keyCtx.accountId,
      ...(keyCtx.email ? { email: keyCtx.email } : {}),
      plan: keyCtx.plan,
      credits_remaining: keyCtx.creditsRemaining,
      credits_unlimited: keyCtx.creditsUnlimited,
      account_status: keyCtx.accountStatus,
      account_disabled: keyCtx.accountDisabled,
      ...(entitlement
        ? {
            billable: entitlement.billable,
            fallback: entitlement.fallback,
            entitlement: entitlement.entitlement,
            used: entitlement.used,
            limit: entitlement.limit,
            kind: entitlement.kind,
          }
        : {}),
      ...(periodUsage ?? {}),
    });
  }),
});

http.route({
  path: "/internal/record-usage",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);

    try {
      const body = (await req.json()) as {
        account_id: string;
        kind: "parse" | "okf";
        engine?: string;
        bytes?: number;
        billable?: boolean;
        provider?: string;
        model?: string;
        pages?: number;
        input_tokens?: number;
        output_tokens?: number;
        llama_credits?: number;
        filename?: string;
        job_id?: string;
        user_key?: boolean;
        create_id?: string;
      };
      if (!body.account_id || !body.kind) {
        return json({ error: "invalid_request" }, 400);
      }
      const result = await ctx.runMutation(internal.usage.recordUsage, {
        accountId: body.account_id as never,
        kind: body.kind,
        engine: body.engine,
        bytes: body.bytes,
        billable: body.billable,
        provider: body.provider,
        model: body.model,
        pages: body.pages,
        inputTokens: body.input_tokens,
        outputTokens: body.output_tokens,
        llamaCredits: body.llama_credits,
        filename: body.filename,
        jobId: body.job_id,
        userKey: body.user_key === true,
        createId: body.create_id,
      });
      return json({ ok: true, ...result });
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
  }),
});

http.route({
  path: "/internal/record-liteparse",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);

    try {
      const body = (await req.json()) as {
        account_id: string;
        success: boolean;
        bytes?: number;
        create_id?: string;
      };
      if (!body.account_id || typeof body.success !== "boolean") {
        return json({ error: "invalid_request" }, 400);
      }
      await ctx.runMutation(internal.usage.recordLiteparse, {
        accountId: body.account_id as never,
        success: body.success,
        bytes: body.bytes,
        createId: body.create_id,
      });
      return json({ ok: true });
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
  }),
});

http.route({
  path: "/api/telemetry/activity",
  method: "OPTIONS",
  handler: httpAction(async () => corsPreflight()),
});

/** CLI / MCP: pack + query activity (Bearer API key; no credit debit). */
http.route({
  path: "/api/telemetry/activity",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const token = bearerFrom(req);
    if (!token) return json({ error: "unauthorized" }, 401);
    const keyCtx = await ctx.runQuery(internal.apiKeys.resolveByToken, {
      token,
    });
    if (!keyCtx) return json({ error: "unauthorized" }, 401);
    if (keyCtx.accountDisabled || keyCtx.accountStatus === "suspended") {
      return json({ error: "account_disabled" }, 403);
    }

    let body: {
      type?: string;
      engine?: string;
      status?: string;
      filename?: string;
      bytes?: number;
      pages?: number;
      create_id?: string;
      createId?: string;
      credit_cost?: number;
      creditCost?: number;
      llama_credits?: number;
      llamaCredits?: number;
      input_tokens?: number;
      inputTokens?: number;
      output_tokens?: number;
      outputTokens?: number;
      okf_count?: number;
      okfCount?: number;
      parse_count?: number;
      parseCount?: number;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const allowed = new Set(["pack_start", "pack_end", "pack", "query"]);
    if (typeof body.type !== "string" || !allowed.has(body.type)) {
      return json({ error: "invalid_request" }, 400);
    }
    const pickStr = (a?: string, b?: string) =>
      typeof a === "string" && a.trim()
        ? a.trim()
        : typeof b === "string" && b.trim()
          ? b.trim()
          : undefined;
    const pickNum = (a?: number, b?: number) =>
      typeof a === "number" && Number.isFinite(a)
        ? a
        : typeof b === "number" && Number.isFinite(b)
          ? b
          : undefined;

    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: keyCtx.apiKeyId,
    });
    await ctx.runMutation(internal.usage.recordActivity, {
      accountId: keyCtx.accountId,
      type: body.type as "pack_start" | "pack_end" | "pack" | "query",
      engine: body.engine,
      status: body.status,
      filename: body.filename,
      bytes: body.bytes,
      pages: body.pages,
      createId: pickStr(body.createId, body.create_id),
      creditCost: pickNum(body.creditCost, body.credit_cost),
      llamaCredits: pickNum(body.llamaCredits, body.llama_credits),
      inputTokens: pickNum(body.inputTokens, body.input_tokens),
      outputTokens: pickNum(body.outputTokens, body.output_tokens),
      okfCount: pickNum(body.okfCount, body.okf_count),
      parseCount: pickNum(body.parseCount, body.parse_count),
    });
    return json({ ok: true });
  }),
});

http.route({
  path: "/internal/query-billing",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);
    let token = "";
    try {
      const body = (await req.json()) as { api_key?: unknown };
      token = typeof body.api_key === "string" ? body.api_key.trim() : "";
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (!token) return json({ error: "unauthorized" }, 401);
    const keyCtx = await ctx.runQuery(internal.apiKeys.resolveByToken, { token });
    if (!keyCtx) return json({ error: "unauthorized" }, 401);
    if (keyCtx.accountDisabled || keyCtx.accountStatus === "suspended") {
      return json({ error: "account_disabled" }, 403);
    }
    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: keyCtx.apiKeyId,
    });
    const billing = await ctx.runQuery(internal.usage.billingForAccount, {
      accountId: keyCtx.accountId,
    });
    if (!billing) return json({ error: "unauthorized" }, 401);
    return json({
      ok: true,
      accountId: keyCtx.accountId,
      disabled: billing.disabled,
      creditsRemaining: billing.creditsRemaining,
      creditsUnlimited: billing.creditsUnlimited,
      creditsLocked: billing.creditsLocked,
    });
  }),
});

http.route({
  path: "/internal/record-query",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);
    try {
      const body = (await req.json()) as {
        account_id?: unknown;
        model?: unknown;
        input_tokens?: unknown;
        output_tokens?: unknown;
        filename?: unknown;
      };
      if (typeof body.account_id !== "string" || typeof body.model !== "string") {
        return json({ error: "invalid_request" }, 400);
      }
      const result = await ctx.runMutation(internal.usage.recordQueryDebit, {
        accountId: body.account_id as never,
        model: body.model,
        inputTokens: typeof body.input_tokens === "number" ? body.input_tokens : undefined,
        outputTokens: typeof body.output_tokens === "number" ? body.output_tokens : undefined,
        filename: typeof body.filename === "string" ? body.filename : undefined,
      });
      return json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "record_query_failed";
      const status = message === "credits_locked" || message === "account_disabled" ? 403 : 400;
      return json({ error: message }, status);
    }
  }),
});

http.route({
  path: "/internal/record-activity",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);
    try {
      const body = (await req.json()) as {
        account_id: string;
        type: "pack_start" | "pack_end" | "pack" | "query";
        engine?: string;
        status?: string;
        filename?: string;
        bytes?: number;
        pages?: number;
        create_id?: string;
        credit_cost?: number;
        llama_credits?: number;
        input_tokens?: number;
        output_tokens?: number;
        okf_count?: number;
        parse_count?: number;
      };
      const allowed = new Set(["pack_start", "pack_end", "pack", "query"]);
      if (!body.account_id || !allowed.has(body.type)) {
        return json({ error: "invalid_request" }, 400);
      }
      await ctx.runMutation(internal.usage.recordActivity, {
        accountId: body.account_id as never,
        type: body.type,
        engine: body.engine,
        status: body.status,
        filename: body.filename,
        bytes: body.bytes,
        pages: body.pages,
        createId: body.create_id,
        creditCost: body.credit_cost,
        llamaCredits: body.llama_credits,
        inputTokens: body.input_tokens,
        outputTokens: body.output_tokens,
        okfCount: body.okf_count,
        parseCount: body.parse_count,
      });
      return json({ ok: true });
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
  }),
});

http.route({
  path: "/internal/account-settings",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);
    try {
      const body = (await req.json()) as {
        account_id: string;
        action: "get" | "put";
        settings_json?: string;
        mark_setup_complete?: boolean;
      };
      if (!body.account_id || !body.action) {
        return json({ error: "invalid_request" }, 400);
      }
      if (body.action === "get") {
        const row = await ctx.runQuery(internal.settings.getByAccountId, {
          accountId: body.account_id as never,
        });
        return json({
          settings: row.settings,
          settings_json: row.settingsJson,
          setupComplete: row.setupComplete,
          setupCompletedAt: row.setupCompletedAt,
          updatedAt: row.updatedAt,
          setupUrl: row.setupUrl,
        });
      }
      const row = await ctx.runMutation(internal.settings.putByAccountId, {
        accountId: body.account_id as never,
        settingsJson: body.settings_json ?? "{}",
        markSetupComplete: body.mark_setup_complete === true,
      });
      let settings: unknown = {};
      try {
        settings = JSON.parse(row.settingsJson);
      } catch {
        settings = {};
      }
      return json({
        settings,
        settings_json: row.settingsJson,
        setupComplete: row.setupComplete,
        setupCompletedAt: row.setupCompletedAt
          ? new Date(row.setupCompletedAt).toISOString()
          : null,
        updatedAt: new Date(row.updatedAt).toISOString(),
        setupUrl: null,
      });
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "invalid_request" },
        400,
      );
    }
  }),
});

http.route({
  path: "/internal/client-config",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthorized(req)) return json({ error: "forbidden" }, 403);
    let token = "";
    try {
      const body = (await req.json()) as { api_key?: string };
      token = body.api_key?.trim() ?? "";
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (!token) return json({ error: "unauthorized" }, 401);

    const config = await ctx.runQuery(internal.clientConfig.forApiKey, {
      token,
    });
    if (!config) return json({ error: "unauthorized" }, 401);

    await ctx.runMutation(internal.apiKeys.touchLastUsed, {
      apiKeyId: config.apiKeyId,
    });

    const { accountId: _a, apiKeyId: _k, ...publicConfig } = config;
    return json(publicConfig);
  }),
});

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const result = await ctx.runAction(internal.stripe.handleWebhook, {
      rawBody: await req.text(),
      signature: req.headers.get("stripe-signature") ?? "",
    });
    if (!result.ok) {
      return json({ error: result.error }, result.status ?? 400);
    }
    return json({ received: true });
  }),
});

export default http;
