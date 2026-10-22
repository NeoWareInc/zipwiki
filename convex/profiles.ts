import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import {
  bootstrapAdminEmails,
  isBootstrapAdminEmail,
} from "./lib/adminEmails";
import { denialForNewAccount } from "./lib/betaAccess";
import { creditsLockedFor } from "./lib/creditLock";
import { creditSnapshot, WELCOME_CREDITS } from "./lib/credits";

/** Create an account and record the welcome credit grant in the ledger. */
async function createAccountWithWelcomeCredits(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
) {
  const accountId = await ctx.db.insert("accounts", {
    userId,
    name,
    status: "active",
    disabled: false,
    creditsPurchased: WELCOME_CREDITS,
    creditsSpent: 0,
    creditsUnlimited: false,
  });
  await ctx.db.insert("creditLedger", {
    accountId,
    kind: "grant",
    credits: WELCOME_CREDITS,
  });
  return accountId;
}

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
      const denial = await denialForNewAccount(ctx, normalized);
      if (denial) {
        throw new ConvexError({
          code: denial.code,
          title: denial.title,
          message: denial.message,
        });
      }
      const accountId = await createAccountWithWelcomeCredits(
        ctx,
        userId,
        email.split("@")[0] || "My account",
      );
      account = (await ctx.db.get(accountId))!;
      const invite = await ctx.db
        .query("betaInvites")
        .withIndex("by_email", (q) => q.eq("email", normalized))
        .unique();
      if (invite && !invite.acceptedAt) {
        await ctx.db.patch(invite._id, { acceptedAt: Date.now() });
      }
    }

    return {
      profileId: profile._id,
      accountId: account._id,
      email: profile.email,
      role: profile.role,
    };
  },
});

/**
 * Create profile + account for an auth user that signed in but never finished
 * ensureProfileAndAccount (e.g. client error after OTP). Dashboard / CLI only.
 */
export const repairOrphanedAuthUser = internalMutation({
  args: { email: v.string() },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),
    accountId: v.optional(v.id("accounts")),
  }),
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .unique();
    if (!user) return { ok: false, reason: "user_not_found" };

    let profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) {
      const admin = isBootstrapAdminEmail(normalized);
      const profileId = await ctx.db.insert("profiles", {
        userId: user._id,
        email: normalized,
        role: admin ? "admin" : "customer",
      });
      profile = (await ctx.db.get(profileId))!;
    }

    let account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!account) {
      const denial = await denialForNewAccount(ctx, normalized);
      if (denial) {
        return { ok: false, reason: denial.code };
      }
      const accountId = await createAccountWithWelcomeCredits(
        ctx,
        user._id,
        normalized.split("@")[0] || "My account",
      );
      account = (await ctx.db.get(accountId))!;
      const invite = await ctx.db
        .query("betaInvites")
        .withIndex("by_email", (q) => q.eq("email", normalized))
        .unique();
      if (invite && !invite.acceptedAt) {
        await ctx.db.patch(invite._id, { acceptedAt: Date.now() });
      }
    }

    return {
      ok: true,
      profileId: profile._id,
      accountId: account._id,
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

    const credits = creditSnapshot(account);
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
        creditsLocked: await creditsLockedFor(ctx, account),
        stripeCustomerId: account.stripeCustomerId ?? null,
        stripeSubscriptionId: account.stripeSubscriptionId ?? null,
        creditsRemaining: credits.creditsRemaining,
        creditsUnlimited: credits.creditsUnlimited,
      },
      plan: credits.plan,
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
      await createAccountWithWelcomeCredits(
        ctx,
        user._id,
        email.split("@")[0] || "My account",
      );
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
