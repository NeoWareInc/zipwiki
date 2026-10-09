import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { startOfMonthMs } from "./lib/crypto";
import {
  CREDIT_COST_PARSE,
  CREDIT_COST_LLM,
  creditSnapshot,
  zipwikiCreditsForLlamaCredits,
  zipwikiCreditsForAnthropicTokens,
  crossedLowCreditThreshold,
  isLowCredits,
  remainingCredits,
  shouldStartAutoReload,
} from "./lib/credits";
import { creditsLockedFor } from "./lib/creditLock";
import { activityEventFields, type ActivityInput } from "./lib/activityEvent";
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
    const locked = await creditsLockedFor(ctx, account);
    const billable =
      !locked && (account.creditsUnlimited === true || remaining >= cost);

    const periodStart = startOfMonthMs();
    const period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();

    const used =
      kind === "parse" ? (period?.parseCount ?? 0) : (period?.okfCount ?? 0);
    const entitlement = locked
      ? ("credits_locked" as const)
      : kind === "parse"
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
    /**
     * The job used the account's LlamaParse key. Record it apart from hosted
     * parse and do not debit ZipWiki credits.
     */
    userKey: v.optional(v.boolean()),
    /** Create ZipWiki session id; links this step to pack_start / pack_end. */
    createId: v.optional(v.string()),
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
      userKey,
      createId,
    } = args;
    const ownKey = userKey === true && kind === "parse";
    const safeFilename =
      typeof filename === "string" && filename.trim()
        ? filename.trim().slice(0, 512)
        : undefined;
    const safeJobId =
      typeof jobId === "string" && jobId.trim()
        ? jobId.trim().slice(0, 128)
        : undefined;
    const creditCost = ownKey
      ? 0
      : kind === "parse"
        ? llamaCredits != null
          ? zipwikiCreditsForLlamaCredits(llamaCredits)
          : CREDIT_COST_PARSE
        : zipwikiCreditsForAnthropicTokens({
            model,
            inputTokens,
            outputTokens,
          });
    const hostedParse = ownKey ? 0 : kind === "parse" ? 1 : 0;
    const hostedLlama = ownKey ? 0 : kind === "parse" ? (llamaCredits ?? 0) : 0;
    const hostedParseCredits = ownKey ? 0 : kind === "parse" ? creditCost : 0;
    const hostedPages = ownKey ? 0 : kind === "parse" ? (pages ?? 0) : 0;
    const byoCount = ownKey ? 1 : 0;
    const byoCredits = ownKey ? (llamaCredits ?? 0) : 0;
    const periodStart = startOfMonthMs();
    let period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();

    const okfIn = kind === "okf" ? (inputTokens ?? 0) : 0;
    const okfOut = kind === "okf" ? (outputTokens ?? 0) : 0;
    const okfCredits = kind === "okf" ? creditCost : 0;

    if (!period) {
      const id = await ctx.db.insert("usagePeriods", {
        accountId,
        periodStart,
        parseCount: hostedParse,
        okfCount: kind === "okf" ? 1 : 0,
        liteparseSuccessCount: 0,
        liteparseFailCount: 0,
        llamaCredits: hostedLlama,
        parseCreditsSpent: hostedParseCredits,
        pages: hostedPages,
        byoLlamaCount: byoCount,
        byoLlamaCredits: byoCredits,
        okfInputTokens: okfIn,
        okfOutputTokens: okfOut,
        okfCreditsSpent: okfCredits,
        packCount: 0,
        queryCount: 0,
      });
      period = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(period._id, {
        parseCount: period.parseCount + hostedParse,
        okfCount: period.okfCount + (kind === "okf" ? 1 : 0),
        llamaCredits: (period.llamaCredits ?? 0) + hostedLlama,
        parseCreditsSpent: (period.parseCreditsSpent ?? 0) + hostedParseCredits,
        pages: (period.pages ?? 0) + hostedPages,
        byoLlamaCount: (period.byoLlamaCount ?? 0) + byoCount,
        byoLlamaCredits: (period.byoLlamaCredits ?? 0) + byoCredits,
        okfInputTokens: (period.okfInputTokens ?? 0) + okfIn,
        okfOutputTokens: (period.okfOutputTokens ?? 0) + okfOut,
        okfCreditsSpent: (period.okfCreditsSpent ?? 0) + okfCredits,
      });
    }

    const safeCreateId =
      typeof createId === "string" && createId.trim()
        ? createId.trim().slice(0, 128)
        : "orphan";
    await ctx.db.insert("usageStepEvents", {
      accountId,
      createId: safeCreateId,
      type: ownKey ? "llamaparse_byo" : kind,
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
    const providerAccount = ownKey
      ? null
      : await ctx.db
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

    const account = await ctx.db.get(accountId);
    const locked = account ? await creditsLockedFor(ctx, account) : false;
    const shouldDebit = billable !== false && !locked;
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

/** Credits for a CLI or MCP ask, resolved from the API key's account. */
export const billingForAccount = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    return {
      disabled: account.disabled === true,
      creditsRemaining: remainingCredits(account),
      creditsUnlimited: account.creditsUnlimited === true,
      creditsLocked: await creditsLockedFor(ctx, account),
    };
  },
});

/** Credits and account id for a signed-in user about to ask a package question. */
export const queryBilling = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;
    return {
      accountId: account._id,
      disabled: account.disabled,
      creditsRemaining: remainingCredits(account),
      creditsUnlimited: account.creditsUnlimited === true,
      creditsLocked: await creditsLockedFor(ctx, account),
    };
  },
});

/**
 * Debit a hosted package question. Counts as query activity, not an OKF pack.
 * Unlimited accounts are logged and not charged.
 */
export const recordQueryDebit = internalMutation({
  args: {
    accountId: v.id("accounts"),
    model: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("No account");
    if (account.disabled) throw new Error("account_disabled");
    if (await creditsLockedFor(ctx, account)) {
      throw new Error("credits_locked");
    }
    const creditCost = zipwikiCreditsForAnthropicTokens({
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    });
    const safeFilename =
      typeof args.filename === "string" && args.filename.trim()
        ? args.filename.trim().slice(0, 512)
        : undefined;
    const periodStart = startOfMonthMs();
    let period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", args.accountId).eq("periodStart", periodStart),
      )
      .unique();
    if (!period) {
      const id = await ctx.db.insert("usagePeriods", {
        accountId: args.accountId,
        periodStart,
        parseCount: 0,
        okfCount: 0,
        liteparseSuccessCount: 0,
        liteparseFailCount: 0,
        queryCount: 1,
      });
      period = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(period._id, {
        queryCount: (period.queryCount ?? 0) + 1,
      });
    }

    const charged = account.creditsUnlimited ? 0 : creditCost;
    await ctx.db.insert("usageEvents", {
      accountId: args.accountId,
      type: "query",
      engine: "anthropic",
      status: "success",
      provider: "anthropic",
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      creditCost: charged,
      filename: safeFilename,
    });
    if (charged > 0) {
      await ctx.db.patch(period._id, {
        queryCreditsSpent: (period.queryCreditsSpent ?? 0) + charged,
      });
    }

    const providerAccount = await ctx.db
      .query("providerAccounts")
      .withIndex("by_slug", (q) => q.eq("slug", "anthropic"))
      .unique();
    if (providerAccount) {
      await ctx.db.insert("providerFloatLedger", {
        providerAccountId: providerAccount._id,
        kind: "usage",
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        calls: 1,
        accountId: args.accountId,
      });
    }

    if (account.creditsUnlimited) {
      return {
        creditsCharged: 0,
        creditsRemaining: account ? remainingCredits(account) : 0,
        creditsUnlimited: account?.creditsUnlimited === true,
      };
    }

    const before = remainingCredits(account);
    const spent = (account.creditsSpent ?? 0) + creditCost;
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
    await ctx.db.patch(args.accountId, {
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
      accountId: args.accountId,
      kind: "spend_llm",
      credits: -creditCost,
      engine: "anthropic",
      provider: "anthropic",
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      filename: safeFilename,
    });
    if (notify) {
      await ctx.scheduler.runAfter(0, internal.mail.sendLowCredit, {
        accountId: args.accountId,
      });
    }
    if (reload) {
      await ctx.scheduler.runAfter(0, internal.stripe.maybeAutoReload, {
        accountId: args.accountId,
      });
    }
    return {
      creditsCharged: creditCost,
      creditsRemaining: after,
      creditsUnlimited: false,
    };
  },
});

export const recordLiteparse = internalMutation({
  args: {
    accountId: v.id("accounts"),
    success: v.boolean(),
    bytes: v.optional(v.number()),
    createId: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, success, bytes, createId }) => {
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

    const safeCreateId =
      typeof createId === "string" && createId.trim()
        ? createId.trim().slice(0, 128)
        : "orphan";
    await ctx.db.insert("usageStepEvents", {
      accountId,
      createId: safeCreateId,
      type: "liteparse",
      status: success ? "success" : "fail",
      bytes,
    });
  },
});

/**
 * Soft activity log for pack / open / search / query (no credit debit).
 * `engine` holds the action subtype for query events (open|search|query|…).
 * Ask anomalies use status "fail", engine = anomaly code, createId = askId.
 */
async function insertActivity(
  ctx: { db: any },
  args: ActivityInput & { accountId: Id<"accounts"> },
): Promise<void> {
  await ctx.db.insert("usageEvents", {
    accountId: args.accountId,
    ...activityEventFields(args),
  });

  const bumpPack = args.type === "pack" || args.type === "pack_end";
  const bumpQuery =
    args.type === "query" && (args.status ?? "success") === "success";

  const periodStart = startOfMonthMs();
  let period = await ctx.db
    .query("usagePeriods")
    .withIndex("by_account_period", (q: any) =>
      q.eq("accountId", args.accountId).eq("periodStart", periodStart),
    )
    .unique();
  if (!period) {
    await ctx.db.insert("usagePeriods", {
      accountId: args.accountId,
      periodStart,
      parseCount: 0,
      okfCount: 0,
      liteparseSuccessCount: 0,
      liteparseFailCount: 0,
      packCount: bumpPack ? 1 : 0,
      queryCount: bumpQuery ? 1 : 0,
    });
  } else if (bumpPack || bumpQuery) {
    await ctx.db.patch(period._id, {
      packCount: (period.packCount ?? 0) + (bumpPack ? 1 : 0),
      queryCount: (period.queryCount ?? 0) + (bumpQuery ? 1 : 0),
    });
  }
}

const activityTypeValidator = v.union(
  v.literal("pack"),
  v.literal("pack_start"),
  v.literal("pack_end"),
  v.literal("query"),
);

export const recordActivity = internalMutation({
  args: {
    accountId: v.id("accounts"),
    type: activityTypeValidator,
    engine: v.optional(v.string()),
    status: v.optional(v.string()),
    filename: v.optional(v.string()),
    bytes: v.optional(v.number()),
    pages: v.optional(v.number()),
    createId: v.optional(v.string()),
    creditCost: v.optional(v.number()),
    llamaCredits: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    okfCount: v.optional(v.number()),
    parseCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await insertActivity(ctx, {
      accountId: args.accountId,
      type: args.type,
      engine: args.engine,
      status: args.status,
      filename: args.filename,
      bytes: args.bytes,
      pages: args.pages,
      createId: args.createId,
      creditCost: args.creditCost,
      llamaCredits: args.llamaCredits,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      okfCount: args.okfCount,
    });
  },
});

/** Authenticated portal: report pack/query activity from the website. */
export const reportActivity = mutation({
  args: {
    type: activityTypeValidator,
    engine: v.optional(v.string()),
    status: v.optional(v.string()),
    filename: v.optional(v.string()),
    bytes: v.optional(v.number()),
    pages: v.optional(v.number()),
    createId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("No account");
    await insertActivity(ctx, {
      accountId: account._id,
      type: args.type,
      engine: args.engine,
      status: args.status,
      filename: args.filename,
      bytes: args.bytes,
      pages: args.pages,
      createId: args.createId,
    });
    return { ok: true as const };
  },
});

/** Portal Ask anomaly row (never debits). engine = anomaly code; createId = askId. */
export const reportQueryAnomaly = mutation({
  args: {
    engine: v.string(),
    createId: v.optional(v.string()),
    filename: v.optional(v.string()),
    pages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("No account");
    const code = args.engine.trim().slice(0, 64);
    if (!code) throw new Error("engine is required");
    await insertActivity(ctx, {
      accountId: account._id,
      type: "query",
      engine: code,
      status: "fail",
      filename: args.filename,
      pages: args.pages,
      createId: args.createId,
    });
    return { ok: true as const };
  },
});

/** Internal: Ask anomaly for portal action / Fly Bearer path. */
export const recordQueryAnomaly = internalMutation({
  args: {
    accountId: v.id("accounts"),
    engine: v.string(),
    createId: v.optional(v.string()),
    filename: v.optional(v.string()),
    pages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const code = args.engine.trim().slice(0, 64);
    if (!code) return;
    await insertActivity(ctx, {
      accountId: args.accountId,
      type: "query",
      engine: code,
      status: "fail",
      filename: args.filename,
      pages: args.pages,
      createId: args.createId,
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
      llamaCredits: period?.llamaCredits ?? 0,
      byoLlamaCount: period?.byoLlamaCount ?? 0,
      byoLlamaCredits: period?.byoLlamaCredits ?? 0,
      okfInputTokens: period?.okfInputTokens ?? 0,
      okfOutputTokens: period?.okfOutputTokens ?? 0,
      okfCreditsSpent: period?.okfCreditsSpent ?? 0,
      // Prefer the period aggregate — scanning usageEvents here can blow the
      // read limit and crash every dashboard page via LowCreditsBanner.
      queryCreditsSpent: period?.queryCreditsSpent ?? 0,
      packCount: period?.packCount ?? 0,
      queryCount: period?.queryCount ?? 0,
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
      creditsLocked: await creditsLockedFor(ctx, account),
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

const ACTIVITY_PAGE_SIZE = 100;

const ACTIVITY_LOG_TYPES = new Set([
  "pack_start",
  "pack_end",
  "pack",
  "query",
  "parse",
  "okf",
  "liteparse",
  "llamaparse_byo",
]);

const STEP_TYPES = new Set(["parse", "okf", "liteparse", "llamaparse_byo"]);

function emptyActivityPage() {
  return { page: [], isDone: true as const, continueCursor: "" };
}

async function signedInAccount(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db
    .query("accounts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

function matchesActivityType(rowType: string, type: string | undefined): boolean {
  if (!ACTIVITY_LOG_TYPES.has(rowType)) return false;
  if (!type) return true;
  if (type === "query") return rowType === "query";
  if (type === "okf") return rowType === "okf";
  if (type === "parse") {
    return (
      rowType === "parse" ||
      rowType === "liteparse" ||
      rowType === "llamaparse_byo"
    );
  }
  if (type === "pack") {
    return rowType === "pack" || rowType === "pack_start" || rowType === "pack_end";
  }
  if (type === "pack_start") return rowType === "pack_start";
  if (type === "pack_end") return rowType === "pack_end" || rowType === "pack";
  return true;
}

function serializeActivityEvent(row: {
  _id: Id<"usageEvents">;
  _creationTime: number;
  accountId: Id<"accounts">;
  type: string;
  engine?: string;
  status?: string;
  provider?: string;
  model?: string;
  pages?: number;
  bytes?: number;
  llamaCredits?: number;
  creditCost?: number;
  filename?: string;
  jobId?: string;
  inputTokens?: number;
  outputTokens?: number;
  createId?: string;
  okfCount?: number;
  parseCount?: number;
}) {
  return {
    id: row._id,
    createdAt: row._creationTime,
    accountId: row.accountId,
    email: null as string | null,
    type: row.type === "pack" ? "pack_end" : row.type,
    engine: row.engine ?? null,
    status: row.status ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    pages: row.pages ?? null,
    bytes: row.bytes ?? null,
    llamaCredits: row.llamaCredits ?? null,
    creditCost: row.creditCost ?? null,
    filename: row.filename ?? null,
    jobId: row.jobId ?? null,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    createId: row.createId ?? null,
    okfCount: row.okfCount ?? null,
    parseCount: row.parseCount ?? null,
  };
}

function serializeActivityStep(row: {
  _id: string;
  _creationTime: number;
  type: string;
  engine?: string;
  status?: string;
  provider?: string;
  model?: string;
  pages?: number;
  bytes?: number;
  llamaCredits?: number;
  creditCost?: number;
  filename?: string;
  jobId?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  return {
    id: row._id,
    createdAt: row._creationTime,
    type: row.type,
    engine: row.engine ?? null,
    status: row.status ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    pages: row.pages ?? null,
    bytes: row.bytes ?? null,
    llamaCredits: row.llamaCredits ?? null,
    creditCost: row.creditCost ?? null,
    filename: row.filename ?? null,
    jobId: row.jobId ?? null,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
  };
}

/** Signed-in account event log. Same rows as the admin log, one account. */
export const myUsageEventLog = query({
  args: {
    paginationOpts: paginationOptsValidator,
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    engine: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await signedInAccount(ctx);
    if (!account) return emptyActivityPage();

    const type = args.type?.trim() || undefined;
    const status = args.status?.trim() || undefined;
    const engine = args.engine?.trim() || undefined;

    let filtered = ctx.db
      .query("usageEvents")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .order("desc");
    if (status) {
      filtered = filtered.filter((q) => q.eq(q.field("status"), status));
    }
    if (engine) {
      filtered = filtered.filter((q) => q.eq(q.field("engine"), engine));
    }

    const result = await filtered.paginate({
      ...args.paginationOpts,
      numItems: Math.min(250, ACTIVITY_PAGE_SIZE * 2),
    });

    const page = [];
    for (const row of result.page) {
      if (!matchesActivityType(row.type, type)) continue;
      page.push(serializeActivityEvent(row));
    }

    return {
      ...result,
      page: page.slice(0, ACTIVITY_PAGE_SIZE),
    };
  },
});

/** Parse / OKF / LiteParse steps for one of the signed-in account's creates. */
export const myUsageStepLog = query({
  args: {
    createId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { createId, paginationOpts }) => {
    const account = await signedInAccount(ctx);
    if (!account) return emptyActivityPage();
    const id = createId.trim().slice(0, 128);
    if (!id) return emptyActivityPage();

    const result = await ctx.db
      .query("usageStepEvents")
      .withIndex("by_accountId_and_createId", (q) =>
        q.eq("accountId", account._id).eq("createId", id),
      )
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(
          ACTIVITY_PAGE_SIZE,
          paginationOpts.numItems ?? ACTIVITY_PAGE_SIZE,
        ),
      });

    const page = result.page.map((row) => serializeActivityStep(row));
    const firstPage =
      paginationOpts.cursor == null || paginationOpts.cursor === "";

    if (page.length === 0 && firstPage) {
      const sessionRows = await ctx.db
        .query("usageEvents")
        .withIndex("by_accountId_and_createId", (q) =>
          q.eq("accountId", account._id).eq("createId", id),
        )
        .order("desc")
        .take(ACTIVITY_PAGE_SIZE);
      for (const row of sessionRows) {
        if (!STEP_TYPES.has(row.type)) continue;
        page.push(serializeActivityStep(row));
      }
    }

    if (page.length === 0 && firstPage) {
      const sessionRows = await ctx.db
        .query("usageEvents")
        .withIndex("by_accountId_and_createId", (q) =>
          q.eq("accountId", account._id).eq("createId", id),
        )
        .order("asc")
        .take(40);
      const packRows = sessionRows.filter(
        (row) =>
          row.type === "pack_start" ||
          row.type === "pack_end" ||
          row.type === "pack",
      );
      if (packRows.length > 0) {
        const times = packRows.map((row) => row._creationTime);
        const startMs = Math.min(...times) - 5_000;
        const endMs = Math.max(...times) + 120_000;
        const orphans = await ctx.db
          .query("usageStepEvents")
          .withIndex("by_accountId_and_createId", (q) =>
            q.eq("accountId", account._id).eq("createId", "orphan"),
          )
          .order("desc")
          .take(200);
        for (const row of orphans) {
          if (row._creationTime < startMs || row._creationTime > endMs) continue;
          page.push(serializeActivityStep(row));
          if (page.length >= ACTIVITY_PAGE_SIZE) break;
        }
      }
      return { page, isDone: true as const, continueCursor: "" };
    }

    return { ...result, page };
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
      model: row.model ?? null,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
    }));
  },
});

/** Public-ish internal helper type for Fly worker JSON. */
export type UsageKind = "parse" | "okf";
export type AccountId = Id<"accounts">;
