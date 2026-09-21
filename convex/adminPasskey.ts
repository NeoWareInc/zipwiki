import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const STEP_UP_MS = 8 * 60 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || profile.role !== "admin") {
      return {
        role: "customer" as const,
        hasPasskey: false,
        stepUpActive: false,
      };
    }
    const keys = await ctx.db
      .query("adminPasskeys")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return {
      role: "admin" as const,
      hasPasskey: keys.length > 0,
      stepUpActive: (profile.adminStepUpExpiresAt ?? 0) > Date.now(),
    };
  },
});

export const getAdmin = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || profile.role !== "admin") return null;
    const keys = await ctx.db
      .query("adminPasskeys")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return {
      email: profile.email,
      credentials: keys.map((key) => ({
        credentialId: key.credentialId,
        publicKey: key.publicKey,
        counter: key.counter,
        transports: key.transports ?? [],
      })),
    };
  },
});

export const takeChallenge = internalQuery({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("register"), v.literal("authenticate")),
  },
  handler: async (ctx, { userId, kind }) => {
    const rows = await ctx.db
      .query("adminPasskeyChallenges")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    return (
      rows
        .filter((row) => row.kind === kind && row.expiresAt > now)
        .sort((a, b) => b._creationTime - a._creationTime)[0]?.challenge ?? null
    );
  },
});

export const saveChallenge = internalMutation({
  args: {
    userId: v.id("users"),
    challenge: v.string(),
    kind: v.union(v.literal("register"), v.literal("authenticate")),
  },
  handler: async (ctx, { userId, challenge, kind }) => {
    const rows = await ctx.db
      .query("adminPasskeyChallenges")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      if (row.kind === kind) await ctx.db.delete(row._id);
    }
    await ctx.db.insert("adminPasskeyChallenges", {
      userId,
      challenge,
      kind,
      expiresAt: Date.now() + CHALLENGE_MS,
    });
  },
});

export const storePasskey = internalMutation({
  args: {
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("adminPasskeys")
      .withIndex("by_credentialId", (q) =>
        q.eq("credentialId", args.credentialId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("adminPasskeys", args);
    }
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile || profile.role !== "admin") throw new Error("Admin only");
    await ctx.db.patch(profile._id, {
      adminStepUpExpiresAt: Date.now() + STEP_UP_MS,
    });
  },
});

export const touchPasskey = internalMutation({
  args: {
    userId: v.id("users"),
    credentialId: v.string(),
    counter: v.number(),
  },
  handler: async (ctx, { userId, credentialId, counter }) => {
    const key = await ctx.db
      .query("adminPasskeys")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", credentialId))
      .unique();
    if (!key || key.userId !== userId) throw new Error("Unknown passkey");
    await ctx.db.patch(key._id, { counter });
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || profile.role !== "admin") throw new Error("Admin only");
    await ctx.db.patch(profile._id, {
      adminStepUpExpiresAt: Date.now() + STEP_UP_MS,
    });
  },
});
