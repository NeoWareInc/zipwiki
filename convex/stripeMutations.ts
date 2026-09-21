import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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

/** Idempotent credit grant from Stripe Checkout (keyed by session id). */
export const grantCreditsFromCheckout = internalMutation({
  args: {
    accountId: v.id("accounts"),
    stripeSessionId: v.string(),
    usdCents: v.number(),
    credits: v.number(),
  },
  handler: async (ctx, { accountId, stripeSessionId, usdCents, credits }) => {
    if (!Number.isFinite(credits) || credits <= 0) {
      return { ok: false as const, reason: "invalid_credits" };
    }

    const existing = await ctx.db
      .query("creditLedger")
      .withIndex("by_stripeSessionId", (q) =>
        q.eq("stripeSessionId", stripeSessionId),
      )
      .unique();
    if (existing) {
      return { ok: true as const, duplicate: true };
    }

    const account = await ctx.db.get(accountId);
    if (!account) return { ok: false as const, reason: "no_account" };

    await ctx.db.patch(accountId, {
      creditsPurchased: (account.creditsPurchased ?? 0) + credits,
      status: "active",
    });
    await ctx.db.insert("creditLedger", {
      accountId,
      kind: "purchase",
      credits,
      usdCents,
      stripeSessionId,
    });
    return { ok: true as const, duplicate: false, credits };
  },
});
