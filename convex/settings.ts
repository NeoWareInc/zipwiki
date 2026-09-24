import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const DEFAULT_SETTINGS = JSON.stringify({
  version: 1,
  parseCredential: "local",
  okfCredential: "local",
  parser: { engine: "liteparse", mode: "fixed" },
  pack: { compression: "deflate" },
  okf: { useAi: false, model: "claude-haiku-4-5" },
});

export const getByAccountId = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const row = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .unique();
    const settingsJson = row?.settingsJson ?? DEFAULT_SETTINGS;
    let settings: unknown = {};
    try {
      settings = JSON.parse(settingsJson);
    } catch {
      settings = {};
    }
    const webOrigin =
      process.env.WEB_ORIGIN?.trim().split(",")[0]?.trim() ||
      process.env.SITE_URL?.trim() ||
      "http://localhost:5173";
    const origin = webOrigin.replace(/\/$/, "");
    return {
      settingsJson,
      settings,
      setupComplete: Boolean(row?.setupCompletedAt),
      setupCompletedAt: row?.setupCompletedAt
        ? new Date(row.setupCompletedAt).toISOString()
        : null,
      updatedAt: row
        ? new Date(row._creationTime).toISOString()
        : null,
      setupUrl: row?.setupCompletedAt
        ? null
        : `${origin}/dashboard/settings?onboarding=1`,
    };
  },
});

export const putByAccountId = internalMutation({
  args: {
    accountId: v.id("accounts"),
    settingsJson: v.string(),
    markSetupComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, { accountId, settingsJson, markSetupComplete }) => {
    const existing = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .unique();
    const setupCompletedAt = markSetupComplete
      ? Date.now()
      : existing?.setupCompletedAt;
    if (existing) {
      await ctx.db.patch(existing._id, {
        settingsJson,
        setupCompletedAt,
      });
    } else {
      await ctx.db.insert("accountSettings", {
        accountId,
        settingsJson,
        setupCompletedAt,
      });
    }
    return {
      settingsJson,
      setupComplete: Boolean(setupCompletedAt),
      setupCompletedAt: setupCompletedAt ?? null,
      updatedAt: Date.now(),
    };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return null;
    const row = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .unique();
    const settingsJson = row?.settingsJson ?? DEFAULT_SETTINGS;
    let settings: unknown = {};
    try {
      settings = JSON.parse(settingsJson);
    } catch {
      settings = {};
    }
    const webOrigin =
      process.env.WEB_ORIGIN?.trim() || "http://localhost:5173";
    return {
      settings,
      setupComplete: Boolean(row?.setupCompletedAt),
      setupCompletedAt: row?.setupCompletedAt
        ? new Date(row.setupCompletedAt).toISOString()
        : null,
      updatedAt: row ? new Date(row._creationTime).toISOString() : null,
      setupUrl: row?.setupCompletedAt
        ? null
        : `${webOrigin}/dashboard/settings?onboarding=1`,
    };
  },
});

export const saveMine = mutation({
  args: {
    settings: v.any(),
    markSetupComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, { settings, markSetupComplete }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("No account");
    const settingsJson = JSON.stringify(settings ?? {});
    const existing = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .unique();
    const setupCompletedAt = markSetupComplete
      ? Date.now()
      : existing?.setupCompletedAt;
    if (existing) {
      await ctx.db.patch(existing._id, { settingsJson, setupCompletedAt });
    } else {
      await ctx.db.insert("accountSettings", {
        accountId: account._id,
        settingsJson,
        setupCompletedAt,
      });
    }
    return {
      settings,
      setupComplete: Boolean(setupCompletedAt),
      setupCompletedAt: setupCompletedAt
        ? new Date(setupCompletedAt).toISOString()
        : null,
      updatedAt: new Date().toISOString(),
    };
  },
});
