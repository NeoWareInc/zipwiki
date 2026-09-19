import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin";
import { startOfMonthMs } from "./lib/crypto";

export const summary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const profiles = await ctx.db.query("profiles").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const periodStart = startOfMonthMs();
    const periods = await ctx.db.query("usagePeriods").collect();
    const thisMonth = periods.filter((p) => p.periodStart === periodStart);
    return {
      accounts: accounts.length,
      admins: profiles.filter((p) => p.role === "admin").length,
      totalParses: thisMonth.reduce((s, p) => s + p.parseCount, 0),
      totalOkf: thisMonth.reduce((s, p) => s + p.okfCount, 0),
      disabledAccounts: accounts.filter((a) => a.disabled).length,
    };
  },
});

export const listAccounts = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireAdmin(ctx);
    const accounts = await ctx.db.query("accounts").collect();
    const periodStart = startOfMonthMs();
    const q = search?.trim().toLowerCase();
    const out = [];
    for (const account of accounts) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (qq) => qq.eq("userId", account.userId))
        .unique();
      if (!profile) continue;
      if (
        q &&
        !profile.email.includes(q) &&
        !account.name.toLowerCase().includes(q)
      ) {
        continue;
      }
      const plan = await ctx.db.get(account.planId);
      const period = await ctx.db
        .query("usagePeriods")
        .withIndex("by_account_period", (qq) =>
          qq.eq("accountId", account._id).eq("periodStart", periodStart),
        )
        .unique();
      out.push({
        id: account._id,
        userId: account.userId,
        name: account.name,
        email: profile.email,
        role: profile.role,
        auth: "convex",
        status: account.status,
        disabled: account.disabled,
        createdAt: new Date(account._creationTime).toISOString(),
        plan: {
          slug: plan?.slug ?? "unknown",
          name: plan?.name ?? "Unknown",
        },
        usage: {
          parseCount: period?.parseCount ?? 0,
          okfCount: period?.okfCount ?? 0,
        },
      });
    }
    return out;
  },
});

export const accountDetail = query({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const account = await ctx.db.get(id);
    if (!account) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", account.userId))
      .unique();
    const plan = await ctx.db.get(account.planId);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .collect();
    const periods = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) => q.eq("accountId", id))
      .collect();
    const events = await ctx.db
      .query("usageEvents")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .order("desc")
      .take(50);

    return {
      account: {
        id: account._id,
        userId: account.userId,
        name: account.name,
        email: profile?.email ?? "",
        role: profile?.role ?? "customer",
        auth: "convex",
        status: account.status,
        disabled: account.disabled,
        stripeCustomerId: account.stripeCustomerId ?? null,
        createdAt: new Date(account._creationTime).toISOString(),
        plan: {
          slug: plan?.slug ?? "unknown",
          name: plan?.name ?? "Unknown",
          maxParses: plan?.maxParsesPerMonth ?? 0,
          maxOkf: plan?.maxOkfPerMonth ?? 0,
          maxPagesPerDocument: plan?.maxPagesPerDocument ?? null,
        },
      },
      keys: keys.map((k) => ({
        id: k._id,
        name: k.name,
        prefix: k.keyPrefix,
        revoked: Boolean(k.revokedAt),
        lastUsedAt: k.lastUsedAt
          ? new Date(k.lastUsedAt).toISOString()
          : null,
        createdAt: new Date(k._creationTime).toISOString(),
      })),
      periods: periods.map((p) => ({
        periodStart: new Date(p.periodStart).toISOString(),
        parseCount: p.parseCount,
        okfCount: p.okfCount,
      })),
      events: events.map((e) => ({
        type: e.type,
        engine: e.engine ?? null,
        bytes: e.bytes ?? null,
        createdAt: new Date(e._creationTime).toISOString(),
      })),
    };
  },
});

export const setDisabled = mutation({
  args: { id: v.id("accounts"), disabled: v.boolean() },
  handler: async (ctx, { id, disabled }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, { disabled });
    return { ok: true };
  },
});

export const setPlan = mutation({
  args: { id: v.id("accounts"), planSlug: v.string() },
  handler: async (ctx, { id, planSlug }) => {
    await requireAdmin(ctx);
    const plan = await ctx.db
      .query("plans")
      .withIndex("by_slug", (q) => q.eq("slug", planSlug))
      .unique();
    if (!plan) throw new Error("Unknown plan");
    await ctx.db.patch(id, { planId: plan._id });
    return { ok: true, plan: plan.slug };
  },
});

export const setRole = mutation({
  args: {
    id: v.id("accounts"),
    role: v.union(v.literal("admin"), v.literal("customer")),
  },
  handler: async (ctx, { id, role }) => {
    await requireAdmin(ctx);
    const account = await ctx.db.get(id);
    if (!account) throw new Error("Not found");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", account.userId))
      .unique();
    if (!profile) throw new Error("Profile missing");
    await ctx.db.patch(profile._id, { role });
    return { ok: true, role };
  },
});

export const revokeKeys = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .collect();
    const now = Date.now();
    for (const k of keys) {
      if (!k.revokedAt) await ctx.db.patch(k._id, { revokedAt: now });
    }
    return { ok: true };
  },
});

export const deleteAccount = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .collect();
    for (const k of keys) await ctx.db.delete(k._id);
    const periods = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) => q.eq("accountId", id))
      .collect();
    for (const p of periods) await ctx.db.delete(p._id);
    const events = await ctx.db
      .query("usageEvents")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .collect();
    for (const e of events) await ctx.db.delete(e._id);
    const settings = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .unique();
    if (settings) await ctx.db.delete(settings._id);
    await ctx.db.delete(id);
    return { ok: true };
  },
});
