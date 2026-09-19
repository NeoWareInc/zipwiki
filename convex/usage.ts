import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { startOfMonthMs } from "./lib/crypto";
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
 * Soft-fallback entitlements:
 * - parse: limit 0 or used≥limit → liteparse_fallback (still ok; not billable)
 * - okf: limit 0 or used≥limit → okf_fallback_host_llm (still ok; not billable)
 * Hard fail only when account/plan missing.
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
    const plan = await ctx.db.get(account.planId);
    if (!plan) {
      return {
        ok: false as const,
        billable: false,
        fallback: true,
        entitlement: "missing_plan" as const,
        used: 0,
        limit: 0,
      };
    }

    const periodStart = startOfMonthMs();
    const period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", accountId).eq("periodStart", periodStart),
      )
      .unique();

    const used =
      kind === "parse" ? (period?.parseCount ?? 0) : (period?.okfCount ?? 0);
    const limit =
      kind === "parse" ? plan.maxParsesPerMonth : plan.maxOkfPerMonth;
    const billable = limit > 0 && used < limit;
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
      limit,
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
  },
  handler: async (ctx, { accountId, kind, engine, bytes }) => {
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
    const plan = await ctx.db.get(account.planId);
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
      maxParses: plan?.maxParsesPerMonth ?? 0,
      maxOkf: plan?.maxOkfPerMonth ?? 0,
      maxPagesPerDocument: plan?.maxPagesPerDocument ?? null,
      periodStart: new Date(periodStart).toISOString(),
      plan: plan
        ? {
            slug: plan.slug,
            maxParsesPerMonth: plan.maxParsesPerMonth,
            maxOkfPerMonth: plan.maxOkfPerMonth,
          }
        : null,
    };
  },
});

/** Public-ish internal helper type for Fly worker JSON. */
export type UsageKind = "parse" | "okf";
export type AccountId = Id<"accounts">;
