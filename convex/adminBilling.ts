import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { creditSnapshot } from "./lib/credits";

const PROVIDERS = [
  {
    slug: "llamaparse",
    displayName: "LlamaParse",
    secretEnv: "LLAMA_CLOUD_API_KEY",
  },
  {
    slug: "anthropic",
    displayName: "Anthropic",
    secretEnv: "ANTHROPIC_API_KEY",
  },
] as const;

export const ensureProviders = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    for (const provider of PROVIDERS) {
      const existing = await ctx.db
        .query("providerAccounts")
        .withIndex("by_slug", (q) => q.eq("slug", provider.slug))
        .unique();
      if (!existing) {
        await ctx.db.insert("providerAccounts", {
          ...provider,
          floatUsdCents: 0,
          lowFloatUsdCents: 0,
        });
      }
    }
    return { ok: true as const };
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const providers = await ctx.db.query("providerAccounts").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const ledger = await ctx.db.query("creditLedger").order("desc").take(40);

    const providerRows = [];
    for (const provider of providers) {
      const rows = await ctx.db
        .query("providerFloatLedger")
        .withIndex("by_provider", (q) => q.eq("providerAccountId", provider._id))
        .collect();
      const lastTopup = rows
        .filter((row) => row.kind === "topup")
        .sort((a, b) => b._creationTime - a._creationTime)[0];
      const since = lastTopup?._creationTime ?? 0;
      const usage = rows.filter(
        (row) => row.kind === "usage" && row._creationTime >= since,
      );
      providerRows.push({
        slug: provider.slug,
        displayName: provider.displayName,
        secretEnv: provider.secretEnv,
        floatUsdCents: provider.floatUsdCents,
        lowFloatUsdCents: provider.lowFloatUsdCents,
        lowFloat:
          provider.lowFloatUsdCents > 0 &&
          provider.floatUsdCents <= provider.lowFloatUsdCents,
        calls: usage.reduce((sum, row) => sum + (row.calls ?? 0), 0),
        pages: usage.reduce((sum, row) => sum + (row.pages ?? 0), 0),
        inputTokens: usage.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
        outputTokens: usage.reduce(
          (sum, row) => sum + (row.outputTokens ?? 0),
          0,
        ),
      });
    }

    const accountRows = [];
    for (const account of accounts) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", account.userId))
        .unique();
      const credits = creditSnapshot(account);
      accountRows.push({
        id: account._id,
        email: profile?.email ?? "",
        name: account.name,
        creditsPurchased: credits.creditsPurchased,
        creditsSpent: credits.creditsSpent,
        creditsRemaining: credits.creditsRemaining,
        creditsUnlimited: credits.creditsUnlimited,
        autoReloadEnabled: account.autoReloadEnabled === true,
        autoReloadLastError: account.autoReloadLastError || null,
      });
    }

    const recent = [];
    for (const row of ledger) {
      const account = accounts.find((item) => item._id === row.accountId);
      const profile = account
        ? await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", account.userId))
            .unique()
        : null;
      recent.push({
        id: row._id,
        email: profile?.email ?? "",
        kind: row.kind,
        credits: row.credits,
        usdCents: row.usdCents ?? null,
        provider: row.provider ?? null,
        model: row.model ?? null,
        pages: row.pages ?? null,
        inputTokens: row.inputTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        createdAt: new Date(row._creationTime).toISOString(),
      });
    }

    return { providers: providerRows, accounts: accountRows, recent };
  },
});

export const restock = mutation({
  args: {
    slug: v.string(),
    usdCents: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { slug, usdCents, note }) => {
    await requireAdmin(ctx);
    if (!Number.isFinite(usdCents) || usdCents <= 0) {
      throw new Error("Amount must be a positive number of cents");
    }
    const provider = await ctx.db
      .query("providerAccounts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!provider) throw new Error("Unknown provider");
    const cents = Math.round(usdCents);
    await ctx.db.patch(provider._id, {
      floatUsdCents: provider.floatUsdCents + cents,
    });
    await ctx.db.insert("providerFloatLedger", {
      providerAccountId: provider._id,
      kind: "topup",
      usdCents: cents,
      note: note?.trim() || undefined,
    });
    return { ok: true as const, floatUsdCents: provider.floatUsdCents + cents };
  },
});

export const setLowFloat = mutation({
  args: { slug: v.string(), usdCents: v.number() },
  handler: async (ctx, { slug, usdCents }) => {
    await requireAdmin(ctx);
    if (!Number.isFinite(usdCents) || usdCents < 0) {
      throw new Error("Threshold must be zero or more");
    }
    const provider = await ctx.db
      .query("providerAccounts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!provider) throw new Error("Unknown provider");
    await ctx.db.patch(provider._id, {
      lowFloatUsdCents: Math.round(usdCents),
    });
    return { ok: true as const };
  },
});
