import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { LOW_CREDITS_THRESHOLD } from "./lib/credits";

export const getAccountForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      accountId: account._id,
      email: profile?.email ?? "",
      stripeCustomerId: account.stripeCustomerId ?? null,
      stripeSubscriptionId: account.stripeSubscriptionId ?? null,
      status: account.status,
    };
  },
});

export const setStripeCustomerId = internalMutation({
  args: {
    accountId: v.id("accounts"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, { accountId, stripeCustomerId }) => {
    await ctx.db.patch(accountId, { stripeCustomerId });
  },
});

export const syncFromSubscription = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId),
      )
      .unique();
    if (!account) return { ok: false };

    const status =
      args.status === "active" || args.status === "trialing"
        ? "active"
        : args.status === "past_due"
          ? "past_due"
          : args.status === "canceled"
            ? "canceled"
            : account.status;

    await ctx.db.patch(account._id, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      status,
    });
    return { ok: true };
  },
});

export const downgradeToFree = internalMutation({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", stripeCustomerId),
      )
      .unique();
    if (!account) return { ok: false };
    await ctx.db.patch(account._id, {
      stripeSubscriptionId: null,
      status: "canceled",
    });
    return { ok: true };
  },
});

export const markPastDue = internalMutation({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", stripeCustomerId),
      )
      .unique();
    if (!account) return { ok: false };
    await ctx.db.patch(account._id, { status: "past_due" });
    return { ok: true };
  },
});

export const getAccountBilling = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", account.userId))
      .unique();
    return {
      email: profile?.email ?? "",
      stripeCustomerId: account.stripeCustomerId ?? null,
      stripePaymentMethodId: account.stripePaymentMethodId ?? null,
      autoReloadUsdCents: account.autoReloadUsdCents ?? 1000,
      autoReloadPending: account.autoReloadPending === true,
      autoReloadPendingAt: account.autoReloadPendingAt ?? null,
    };
  },
});

export const setStripePaymentMethod = internalMutation({
  args: {
    accountId: v.id("accounts"),
    stripePaymentMethodId: v.string(),
  },
  handler: async (ctx, { accountId, stripePaymentMethodId }) => {
    await ctx.db.patch(accountId, { stripePaymentMethodId });
  },
});

export const markReloadFailed = internalMutation({
  args: {
    accountId: v.id("accounts"),
    error: v.string(),
  },
  handler: async (ctx, { accountId, error }) => {
    await ctx.db.patch(accountId, {
      autoReloadPending: false,
      autoReloadLastError: error.slice(0, 500),
    });
  },
});

/** Idempotent credit grant from Checkout or an off-session PaymentIntent. */
export const grantCreditsFromCheckout = internalMutation({
  args: {
    accountId: v.id("accounts"),
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    usdCents: v.number(),
    credits: v.number(),
    receiptUrl: v.optional(v.string()),
    clearReloadPending: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const {
      accountId,
      stripeSessionId,
      stripePaymentIntentId,
      usdCents,
      credits,
      receiptUrl,
      clearReloadPending,
    } = args;
    if (!stripeSessionId && !stripePaymentIntentId) {
      return { ok: false as const, reason: "missing_idempotency_key" };
    }
    if (!Number.isFinite(credits) || credits <= 0) {
      return { ok: false as const, reason: "invalid_credits" };
    }

    if (stripeSessionId) {
      const existing = await ctx.db
        .query("creditLedger")
        .withIndex("by_stripeSessionId", (q) =>
          q.eq("stripeSessionId", stripeSessionId),
        )
        .unique();
      if (existing) return { ok: true as const, duplicate: true };
    }
    if (stripePaymentIntentId) {
      const existing = await ctx.db
        .query("creditLedger")
        .withIndex("by_stripePaymentIntentId", (q) =>
          q.eq("stripePaymentIntentId", stripePaymentIntentId),
        )
        .unique();
      if (existing) return { ok: true as const, duplicate: true };
    }

    const account = await ctx.db.get(accountId);
    if (!account) return { ok: false as const, reason: "no_account" };

    const purchased = (account.creditsPurchased ?? 0) + credits;
    const remaining = Math.max(0, purchased - (account.creditsSpent ?? 0));
    await ctx.db.patch(accountId, {
      creditsPurchased: purchased,
      status: "active",
      ...(clearReloadPending ? { autoReloadPending: false, autoReloadLastError: "" } : {}),
      ...(remaining > LOW_CREDITS_THRESHOLD ? { lowCreditNotifiedAt: 0 } : {}),
    });
    await ctx.db.insert("creditLedger", {
      accountId,
      kind: "purchase",
      credits,
      usdCents,
      stripeSessionId,
      stripePaymentIntentId,
    });
    await ctx.scheduler.runAfter(0, internal.mail.sendReceipt, {
      accountId,
      credits,
      usdCents,
      creditsRemaining: remaining,
      receiptUrl,
    });
    return { ok: true as const, duplicate: false, credits };
  },
});
