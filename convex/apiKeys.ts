import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { generateApiKey, hashApiKey } from "./lib/crypto";
import { creditSnapshot } from "./lib/credits";
import type { Id } from "./_generated/dataModel";

export type ApiKeyContext = {
  apiKeyId: Id<"apiKeys">;
  accountId: Id<"accounts">;
  plan: {
    slug: string;
    maxParsesPerMonth: number;
    maxOkfPerMonth: number;
    maxPagesPerDocument: number | null;
  };
  accountStatus: string;
  creditsRemaining: number;
  creditsUnlimited: boolean;
  accountDisabled: boolean;
  email: string;
};

export const resolveByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<ApiKeyContext | null> => {
    const keyHash = await hashApiKey(token);
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!key || key.revokedAt) return null;

    const account = await ctx.db.get(key.accountId);
    if (!account) return null;
    const credits = creditSnapshot(account);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", account.userId))
      .unique();
    const user = await ctx.db.get(account.userId);
    const email =
      profile?.email ||
      (user && "email" in user && typeof user.email === "string"
        ? user.email
        : "");

    return {
      apiKeyId: key._id,
      accountId: account._id,
      plan: credits.plan,
      creditsRemaining: credits.creditsRemaining,
      creditsUnlimited: credits.creditsUnlimited,
      accountStatus: account.status,
      accountDisabled: account.disabled,
      email,
    };
  },
});

export const touchLastUsed = internalMutation({
  args: { apiKeyId: v.id("apiKeys") },
  handler: async (ctx, { apiKeyId }) => {
    await ctx.db.patch(apiKeyId, { lastUsedAt: Date.now() });
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) return [];
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .collect();
    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        id: k._id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt ?? null,
        createdAt: k._creationTime,
      }));
  },
});

export const createMine = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("No account");

    const { raw, prefix } = generateApiKey();
    const keyHash = await hashApiKey(raw);
    const id = await ctx.db.insert("apiKeys", {
      accountId: account._id,
      name: name?.trim() || "Default",
      keyHash,
      keyPrefix: prefix,
    });
    return { id, apiKey: raw, keyPrefix: prefix };
  },
});

export const revokeMine = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("No account");
    const key = await ctx.db.get(id);
    if (!key || key.accountId !== account._id) throw new Error("Not found");
    await ctx.db.patch(id, { revokedAt: Date.now() });
    return { ok: true };
  },
});
