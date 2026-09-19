import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Ensure profile + free account exist for the signed-in auth user. */
export const ensureProfileAndAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User missing");

    const email =
      (typeof user.email === "string" && user.email) ||
      `user-${userId}@unknown.local`;

    let profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!profile) {
      const profileId = await ctx.db.insert("profiles", {
        userId,
        email: email.toLowerCase(),
        role: "customer",
      });
      profile = (await ctx.db.get(profileId))!;
    }

    let account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!account) {
      const free = await ctx.db
        .query("plans")
        .withIndex("by_slug", (q) => q.eq("slug", "free"))
        .unique();
      if (!free) throw new Error("Plans not seeded — run seedPlans");

      const accountId = await ctx.db.insert("accounts", {
        userId,
        name: email.split("@")[0] || "My account",
        planId: free._id,
        status: "active",
        disabled: false,
      });
      account = (await ctx.db.get(accountId))!;
    }

    return {
      profileId: profile._id,
      accountId: account._id,
      email: profile.email,
      role: profile.role,
    };
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return null;

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;

    const plan = await ctx.db.get(account.planId);
    return {
      user: {
        id: userId,
        email: profile.email,
        role: profile.role,
      },
      account: {
        id: account._id,
        name: account.name,
        status: account.status,
        disabled: account.disabled,
        stripeCustomerId: account.stripeCustomerId ?? null,
        stripeSubscriptionId: account.stripeSubscriptionId ?? null,
      },
      plan: plan
        ? {
            slug: plan.slug,
            name: plan.name,
            maxParsesPerMonth: plan.maxParsesPerMonth,
            maxOkfPerMonth: plan.maxOkfPerMonth,
            maxPagesPerDocument: plan.maxPagesPerDocument,
          }
        : null,
    };
  },
});

export const setRole = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("customer")),
  },
  handler: async (ctx, { email, role }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const self = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!self || self.role !== "admin") throw new Error("Admin only");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!profile) throw new Error("User not found");
    await ctx.db.patch(profile._id, { role });
    return { ok: true };
  },
});

/** Bootstrap first admin by email (internal / dashboard once). */
export const bootstrapAdminByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!profile) return { ok: false, reason: "not_found" };
    await ctx.db.patch(profile._id, { role: "admin" });
    return { ok: true, profileId: profile._id };
  },
});
