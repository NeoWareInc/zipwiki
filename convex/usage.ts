import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { startOfMonthMs } from "./lib/crypto";
import {
  CREDIT_COST_LLM,
  CREDIT_COST_PARSE,
  creditSnapshot,
  zipwikiCreditsForLlamaCredits,
  crossedLowCreditThreshold,
  isLowCredits,
  remainingCredits,
  shouldStartAutoReload,
} from "./lib/credits";
import type { Id } from "./_generated/dataModel";

export const getOrCreatePeriod = internalMutation({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const periodStart = startOfMonthMs();
    const existing = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("usagePeriods", {
      accountId,
      periodStart,
      parseCount: 0,
      okfCount: 0,
      liteparseSuccessCount: 0,
      liteparseFailCount: 0,
    });
  },
});

/**
 * Soft-fallback entitlements based on prepaid credits:
 * - parse: remaining ≥ 1 (or unlimited) → llamaparse; else liteparse_fallback
 * - okf: remaining ≥ 1 (or unlimited) → okf_billable; else okf_fallback_host_llm
 * Hard fail only when account missing.
 */
export const checkQuota = internalQuery({
  args: {
    accountId: v.id("accounts"),
    kind: v.union(v.literal("parse"), v.literal("okf")),
  },
  handler: async (ctx, { accountId, kind }) => {
    const account = await ctx.db.get(accountId);
    if (!account) {
      return {
        ok: false as const,
        billable: false,
        fallback: true,
        entitlement: "missing_account" as const,
        used: 0,
        limit: 0,
      };
    }

    const cost = kind === "parse" ? CREDIT_COST_PARSE : CREDIT_COST_LLM;
    const remaining = remainingCredits(account);
    const billable =
      account.creditsUnlimited === true || remaining >= cost;

    const periodStart = startOfMonthMs();
    const period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();

    const used =
      kind === "parse" ? (period?.parseCount ?? 0) : (period?.okfCount ?? 0);
    const entitlement =
      kind === "parse"
        ? billable
          ? ("llamaparse" as const)
          : ("liteparse_fallback" as const)
        : billable
          ? ("okf_billable" as const)
          : ("okf_fallback_host_llm" as const);

    return {
      ok: true as const,
      billable,
      fallback: !billable,
      entitlement,
      used,
      limit: account.creditsUnlimited
        ? Number.MAX_SAFE_INTEGER
        : remaining,
      creditsRemaining: remaining,
      periodStart,
      liteparseSuccessCount: period?.liteparseSuccessCount ?? 0,
      liteparseFailCount: period?.liteparseFailCount ?? 0,
      parseCount: period?.parseCount ?? 0,
      okfCount: period?.okfCount ?? 0,
    };
  },
});

export const recordUsage = internalMutation({
  args: {
    accountId: v.id("accounts"),
    kind: v.union(v.literal("parse"), v.literal("okf")),
    engine: v.optional(v.string()),
    bytes: v.optional(v.number()),
    /** When true (default for hosted), debit prepaid credits. */
    billable: v.optional(v.boolean()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    pages: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    /** LlamaParse `job.usage.credits` for this document. */
    llamaCredits: v.optional(v.number()),
    filename: v.optional(v.string()),
    jobId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const {
      accountId,
      kind,
      engine,
      bytes,
      billable,
      provider,
      model,
      pages,
      inputTokens,
      outputTokens,
      llamaCredits,
      filename,
      jobId,
    } = args;
    const safeFilename =
      typeof filename === "string" && filename.trim()
        ? filename.trim().slice(0, 512)
        : undefined;
    const safeJobId =
      typeof jobId === "string" && jobId.trim()
        ? jobId.trim().slice(0, 128)
        : undefined;
    const creditCost =
      kind === "parse"
        ? llamaCredits != null
          ? zipwikiCreditsForLlamaCredits(llamaCredits)
          : CREDIT_COST_PARSE
        : CREDIT_COST_LLM;
    const periodStart = startOfMonthMs();
    let period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();

    if (!period) {
      const id = await ctx.db.insert("usagePeriods", {
        accountId,
        periodStart,
        parseCount: kind === "parse" ? 1 : 0,
        okfCount: kind === "okf" ? 1 : 0,
        liteparseSuccessCount: 0,
        liteparseFailCount: 0,
        llamaCredits: kind === "parse" ? (llamaCredits ?? 0) : 0,
        parseCreditsSpent: kind === "parse" ? creditCost : 0,
        pages: kind === "parse" ? (pages ?? 0) : 0,
      });
      period = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(period._id, {
        parseCount: period.parseCount + (kind === "parse" ? 1 : 0),
        okfCount: period.okfCount + (kind === "okf" ? 1 : 0),
        llamaCredits:
          (period.llamaCredits ?? 0) +
          (kind === "parse" ? (llamaCredits ?? 0) : 0),
        parseCreditsSpent:
          (period.parseCreditsSpent ?? 0) +
          (kind === "parse" ? creditCost : 0),
        pages:
          (period.pages ?? 0) + (kind === "parse" ? (pages ?? 0) : 0),
      });
    }

    await ctx.db.insert("usageEvents", {
      accountId,
      type: kind,
      engine,
      bytes,
      provider,
      model,
      pages,
      inputTokens,
      outputTokens,
      llamaCredits,
      creditCost,
      filename: safeFilename,
      jobId: safeJobId,
    });

    const providerSlug =
      provider ?? (kind === "parse" ? "llamaparse" : "anthropic");
    const providerAccount = await ctx.db
      .query("providerAccounts")
      .withIndex("by_slug", (q) => q.eq("slug", providerSlug))
      .unique();
    if (providerAccount) {
      await ctx.db.insert("providerFloatLedger", {
        providerAccountId: providerAccount._id,
        kind: "usage",
        pages,
        inputTokens,
        outputTokens,
        calls: 1,
        accountId,
      });
    }

    const shouldDebit = billable !== false;
    const account = await ctx.db.get(accountId);
    if (!shouldDebit || !account) {
      const remaining = account ? remainingCredits(account) : 0;
      return {
        creditsRemaining: remaining,
        lowCredits: account
          ? isLowCredits(remaining, account.creditsUnlimited)
          : false,
        autoReload: false,
      };
    }
    if (account.creditsUnlimited) {
      return {
        creditsRemaining: remainingCredits(account),
        lowCredits: false,
        autoReload: false,
      };
    }

    const cost = creditCost;
    if (cost <= 0) {
      return {
        creditsRemaining: remainingCredits(account),
        lowCredits: isLowCredits(
          remainingCredits(account),
          account.creditsUnlimited,
        ),
        autoReload: false,
      };
    }
    const before = remainingCredits(account);

    const spent = (account.creditsSpent ?? 0) + cost;
    const after = Math.max(0, (account.creditsPurchased ?? 0) - spent);
    const notify = crossedLowCreditThreshold({
      before,
      after,
      notifiedAt: account.lowCreditNotifiedAt,
    });
    const now = Date.now();
    const reload = shouldStartAutoReload({
      enabled: account.autoReloadEnabled,
      remaining: after,
      threshold: account.autoReloadThresholdCredits,
      pending: account.autoReloadPending,
      pendingAt: account.autoReloadPendingAt,
      hasPaymentMethod: Boolean(account.stripePaymentMethodId),
      now,
    });

    await ctx.db.patch(accountId, {
      creditsSpent: spent,
      ...(notify ? { lowCreditNotifiedAt: now } : {}),
      ...(reload
        ? {
            autoReloadPending: true,
            autoReloadPendingAt: now,
            autoReloadLastError: "",
          }
        : {}),
    });
    await ctx.db.insert("creditLedger", {
      accountId,
      kind: kind === "parse" ? "spend_parse" : "spend_llm",
      credits: -cost,
      engine,
      provider: providerSlug,
      model,
      pages,
      inputTokens,
      outputTokens,
      llamaCredits,
      filename: safeFilename,
      jobId: safeJobId,
    });

    if (notify) {
      await ctx.scheduler.runAfter(0, internal.mail.sendLowCredit, {
        accountId,
      });
    }
    if (reload) {
      await ctx.scheduler.runAfter(0, internal.stripe.maybeAutoReload, {
        accountId,
      });
    }

    return {
      creditsRemaining: after,
      lowCredits: isLowCredits(after, false),
      autoReload: reload,
    };
  },
});

export const recordLiteparse = internalMutation({
  args: {
    accountId: v.id("accounts"),
    success: v.boolean(),
    bytes: v.optional(v.number()),
  },
  handler: async (ctx, { accountId, success, bytes }) => {
    const periodStart = startOfMonthMs();
    let period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();

    if (!period) {
      await ctx.db.insert("usagePeriods", {
        accountId,
        periodStart,
        parseCount: 0,
        okfCount: 0,
        liteparseSuccessCount: success ? 1 : 0,
        liteparseFailCount: success ? 0 : 1,
      });
    } else {
      await ctx.db.patch(period._id, {
        liteparseSuccessCount:
          period.liteparseSuccessCount + (success ? 1 : 0),
        liteparseFailCount: period.liteparseFailCount + (success ? 0 : 1),
      });
    }

    await ctx.db.insert("usageEvents", {
      accountId,
      type: "liteparse",
      status: success ? "success" : "fail",
      bytes,
    });
  },
});

/**
 * Soft activity log for pack / open / search / query (no credit debit).
 * `engine` holds the action subtype for query events (open|search|query|…).
 */
export const recordActivity = internalMutation({
  args: {
    accountId: v.id("accounts"),
    type: v.union(v.literal("pack"), v.literal("query")),
    engine: v.optional(v.string()),
    status: v.optional(v.string()),
    filename: v.optional(v.string()),
    bytes: v.optional(v.number()),
    pages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const safeFilename =
      typeof args.filename === "string" && args.filename.trim()
        ? args.filename.trim().slice(0, 512)
        : undefined;
    const safeEngine =
      typeof args.engine === "string" && args.engine.trim()
        ? args.engine.trim().slice(0, 64)
        : undefined;
    await ctx.db.insert("usageEvents", {
      accountId: args.accountId,
      type: args.type,
      engine: safeEngine,
      status: args.status ?? "success",
      filename: safeFilename,
      bytes: args.bytes,
      pages: args.pages,
    });
  },
});

export const myUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;
    const credits = creditSnapshot(account);
    const periodStart = startOfMonthMs();
    const period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", account._id).eq("periodStart", periodStart),
      )
      .unique();

    return {
      parseCount: period?.parseCount ?? 0,
      okfCount: period?.okfCount ?? 0,
      parseCreditsSpent: period?.parseCreditsSpent ?? 0,
      parsePages: period?.pages ?? 0,
      liteparseSuccessCount: period?.liteparseSuccessCount ?? 0,
      liteparseFailCount: period?.liteparseFailCount ?? 0,
      maxParses: credits.plan.maxParsesPerMonth,
      maxOkf: credits.plan.maxOkfPerMonth,
      maxPagesPerDocument: null,
      periodStart: new Date(periodStart).toISOString(),
      creditsPurchased: credits.creditsPurchased,
      creditsSpent: credits.creditsSpent,
      creditsRemaining: credits.creditsRemaining,
      creditsUnlimited: credits.creditsUnlimited,
      lowCredits: isLowCredits(
        credits.creditsRemaining,
        credits.creditsUnlimited,
      ),
      plan: credits.plan,
      autoReloadEnabled: account.autoReloadEnabled === true,
      autoReloadThresholdCredits: account.autoReloadThresholdCredits ?? 100,
      autoReloadUsdCents: account.autoReloadUsdCents ?? 1000,
      autoReloadLastError: account.autoReloadLastError || null,
      hasPaymentMethod: Boolean(account.stripePaymentMethodId),
    };
  },
});

/** Recent usage events for the signed-in account (portal activity log). */
export const myUsageLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;
    const take = Math.min(100, Math.max(1, Math.floor(limit ?? 40)));
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .order("desc")
      .take(take);
    return rows.map((row) => ({
      id: row._id,
      createdAt: row._creationTime,
      type: row.type,
      engine: row.engine ?? null,
      status: row.status ?? null,
      provider: row.provider ?? null,
      pages: row.pages ?? null,
      bytes: row.bytes ?? null,
      llamaCredits: row.llamaCredits ?? null,
      creditCost: row.creditCost ?? null,
      filename: row.filename ?? null,
      jobId: row.jobId ?? null,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
    }));
  },
});

/** Public-ish internal helper type for Fly worker JSON. */
export type UsageKind = "parse" | "okf";
export type AccountId = Id<"accounts">;
