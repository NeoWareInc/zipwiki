import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/admin";
import { creditSnapshot } from "./lib/credits";
import { startOfMonthMs } from "./lib/crypto";

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

async function providerMonitorRows(ctx: QueryCtx) {
  const providers = await ctx.db.query("providerAccounts").collect();
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
      lowFloatNotifiedAt: provider.lowFloatNotifiedAt
        ? provider.lowFloatNotifiedAt
        : null,
      usedUsdCentsSinceRestock: usage.reduce(
        (sum, row) => sum + (row.usdCents ?? 0),
        0,
      ),
      calls: usage.reduce((sum, row) => sum + (row.calls ?? 0), 0),
      pages: usage.reduce((sum, row) => sum + (row.pages ?? 0), 0),
      inputTokens: usage.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
      outputTokens: usage.reduce(
        (sum, row) => sum + (row.outputTokens ?? 0),
        0,
      ),
    });
  }
  return providerRows;
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const providerRows = await providerMonitorRows(ctx);
    const accounts = await ctx.db.query("accounts").collect();

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
        creditsLocked: account.creditsLocked === true,
        autoReloadEnabled: account.autoReloadEnabled === true,
        autoReloadLastError: account.autoReloadLastError || null,
      });
    }

    return { providers: providerRows, accounts: accountRows };
  },
});

/** Vendor wallets + per-customer LlamaParse / Claude usage for /admin/credits. */
export const creditsMonitor = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const providers = await providerMonitorRows(ctx);
    const accounts = await ctx.db.query("accounts").collect();
    const periodStart = startOfMonthMs();
    const accountRows = [];
    for (const account of accounts) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", account.userId))
        .unique();
      if (!profile) continue;
      const credits = creditSnapshot(account);
      const period = await ctx.db
        .query("usagePeriods")
        .withIndex("by_account_period", (q) =>
          q.eq("accountId", account._id).eq("periodStart", periodStart),
        )
        .unique();
      accountRows.push({
        id: account._id,
        email: profile.email,
        name: account.name,
        disabled: account.disabled,
        creditsLocked: account.creditsLocked === true,
        creditsRemaining: credits.creditsRemaining,
        creditsSpent: credits.creditsSpent,
        creditsUnlimited: credits.creditsUnlimited,
        parseCount: period?.parseCount ?? 0,
        parsePages: period?.pages ?? 0,
        llamaCredits: period?.llamaCredits ?? 0,
        parseCreditsSpent: period?.parseCreditsSpent ?? 0,
        okfCount: period?.okfCount ?? 0,
        okfInputTokens: period?.okfInputTokens ?? 0,
        okfOutputTokens: period?.okfOutputTokens ?? 0,
        okfCreditsSpent: period?.okfCreditsSpent ?? 0,
        queryCount: period?.queryCount ?? 0,
        queryCreditsSpent: period?.queryCreditsSpent ?? 0,
      });
    }
    accountRows.sort((a, b) => a.email.localeCompare(b.email));
    return {
      periodStart: new Date(periodStart).toISOString(),
      providers,
      accounts: accountRows,
    };
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
    const nextFloat = provider.floatUsdCents + cents;
    const clearNotify =
      provider.lowFloatUsdCents <= 0 || nextFloat > provider.lowFloatUsdCents;
    await ctx.db.patch(provider._id, {
      floatUsdCents: nextFloat,
      ...(clearNotify ? { lowFloatNotifiedAt: 0 } : {}),
    });
    await ctx.db.insert("providerFloatLedger", {
      providerAccountId: provider._id,
      kind: "topup",
      usdCents: cents,
      note: note?.trim() || undefined,
    });
    return { ok: true as const, floatUsdCents: nextFloat };
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
    const threshold = Math.round(usdCents);
    const clearNotify = threshold <= 0 || provider.floatUsdCents > threshold;
    await ctx.db.patch(provider._id, {
      lowFloatUsdCents: threshold,
      ...(clearNotify ? { lowFloatNotifiedAt: 0 } : {}),
    });
    return { ok: true as const };
  },
});

export const getProviderForAlert = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const provider = await ctx.db
      .query("providerAccounts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!provider) return null;
    return {
      slug: provider.slug,
      displayName: provider.displayName,
      floatUsdCents: provider.floatUsdCents,
      lowFloatUsdCents: provider.lowFloatUsdCents,
      lowFloatNotifiedAt: provider.lowFloatNotifiedAt ?? null,
    };
  },
});

/**
 * Hourly safety net: email ops for providers already below threshold that were
 * never notified (e.g. threshold raised after float was low).
 */
export const checkLowFloatAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const providers = await ctx.db.query("providerAccounts").collect();
    let sent = 0;
    for (const provider of providers) {
      if (!(provider.lowFloatUsdCents > 0)) continue;
      if (provider.floatUsdCents > provider.lowFloatUsdCents) continue;
      if (provider.lowFloatNotifiedAt) continue;
      const now = Date.now();
      await ctx.db.patch(provider._id, { lowFloatNotifiedAt: now });
      await ctx.scheduler.runAfter(0, internal.mail.sendLowProviderFloat, {
        slug: provider.slug,
      });
      sent += 1;
    }
    return { sent };
  },
});
