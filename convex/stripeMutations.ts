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
    priceId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId),
      )
      .unique();
    if (!account) return { ok: false };

    let planId = account.planId;
    if (args.priceId) {
      const plans = await ctx.db.query("plans").collect();
      const match = plans.find((p) => p.stripePriceId === args.priceId);
      if (match) planId = match._id;
    }

    const status =
      args.status === "active" || args.status === "trialing"
        ? "active"
        : args.status === "past_due"
          ? "past_due"
          : args.status === "canceled"
            ? "canceled"
            : account.status;

    await ctx.db.patch(account._id, {
      planId,
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
    const free = await ctx.db
      .query("plans")
      .withIndex("by_slug", (q) => q.eq("slug", "free"))
      .unique();
    if (!free) return { ok: false };
    await ctx.db.patch(account._id, {
      planId: free._id,
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
