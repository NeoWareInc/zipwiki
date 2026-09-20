import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import {
  bootstrapAdminEmails,
  isBootstrapAdminEmail,
} from "./lib/adminEmails";

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

    const normalized = email.toLowerCase();
    const admin = isBootstrapAdminEmail(normalized);

    if (!profile) {
      const profileId = await ctx.db.insert("profiles", {
        userId,
        email: normalized,
        role: admin ? "admin" : "customer",
      });
      profile = (await ctx.db.get(profileId))!;
    } else if (admin && profile.role !== "admin") {
      await ctx.db.patch(profile._id, { role: "admin" });
      profile = (await ctx.db.get(profile._id))!;
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
        creditsPurchased: 0,
        creditsSpent: 0,
        creditsUnlimited: false,
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

const grantResult = v.object({
  email: v.string(),
  ok: v.boolean(),
  reason: v.optional(v.string()),
  profileId: v.optional(v.id("profiles")),
});

type GrantAdminResult = {
  email: string;
  ok: boolean;
  reason?: string;
  profileId?: Id<"profiles">;
};

async function grantAdminForEmail(
  ctx: MutationCtx,
  rawEmail: string,
): Promise<GrantAdminResult> {
  const email = rawEmail.toLowerCase();
  let profile = await ctx.db
    .query("profiles")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!profile) {
    const candidates = await ctx.db.query("profiles").take(200);
    profile =
      candidates.find((p) => p.email.toLowerCase() === email) ?? null;
  }

  if (!profile) {
    let user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      const candidates = await ctx.db.query("users").take(200);
      user =
        candidates.find((u) => u.email?.toLowerCase() === email) ?? null;
    }
    if (!user) {
      return { email, ok: false, reason: "pending_signup" };
    }

    const profileId = await ctx.db.insert("profiles", {
      userId: user._id,
      email,
      role: "admin",
    });
    profile = await ctx.db.get(profileId);

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!account) {
      const free = await ctx.db
        .query("plans")
        .withIndex("by_slug", (q) => q.eq("slug", "free"))
        .unique();
      if (free) {
        await ctx.db.insert("accounts", {
          userId: user._id,
          name: email.split("@")[0] || "My account",
          planId: free._id,
          status: "active",
          disabled: false,
          creditsPurchased: 0,
          creditsSpent: 0,
          creditsUnlimited: false,
        });
      }
    }
    return { email, ok: true, profileId: profile!._id };
  }

  if (profile.role !== "admin") {
    await ctx.db.patch(profile._id, { role: "admin" });
  }
  return { email, ok: true, profileId: profile._id };
}

/** Bootstrap first admin by email (internal / dashboard once). */
export const bootstrapAdminByEmail = internalMutation({
  args: { email: v.string() },
  returns: grantResult,
  handler: async (ctx, { email }) => grantAdminForEmail(ctx, email),
});

/** Promote the configured bootstrap admin emails (existing users only). */
export const grantBootstrapAdmins = internalMutation({
  args: {},
  returns: v.object({ results: v.array(grantResult) }),
  handler: async (ctx) => {
    const results = [];
    for (const email of bootstrapAdminEmails()) {
      results.push(await grantAdminForEmail(ctx, email));
    }
    return { results };
  },
});
