import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { startOfMonthMs } from "./lib/crypto";
import {
  CREDIT_COST_LLM,
  CREDIT_COST_PARSE,
  creditSnapshot,
  isLowCredits,
  remainingCredits,
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
  },
  handler: async (ctx, { accountId, kind, engine, bytes, billable }) => {
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
      });
      period = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(period._id, {
        parseCount: period.parseCount + (kind === "parse" ? 1 : 0),
        okfCount: period.okfCount + (kind === "okf" ? 1 : 0),
      });
    }

    await ctx.db.insert("usageEvents", {
      accountId,
      type: kind,
      engine,
      bytes,
    });

    const shouldDebit = billable !== false;
    if (!shouldDebit) return;

    const account = await ctx.db.get(accountId);
    if (!account || account.creditsUnlimited) return;

    const cost = kind === "parse" ? CREDIT_COST_PARSE : CREDIT_COST_LLM;
    const remaining = remainingCredits(account);
    if (remaining < cost) return;

    await ctx.db.patch(accountId, {
      creditsSpent: (account.creditsSpent ?? 0) + cost,
    });
    await ctx.db.insert("creditLedger", {
      accountId,
      kind: kind === "parse" ? "spend_parse" : "spend_llm",
      credits: -cost,
      engine,
    });
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
    };
  },
});

/** Public-ish internal helper type for Fly worker JSON. */
export type UsageKind = "parse" | "okf";
export type AccountId = Id<"accounts">;
