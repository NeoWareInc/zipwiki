import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAdmin } from "./lib/admin";
import { globalCreditsLocked } from "./lib/creditLock";
import { startOfMonthMs } from "./lib/crypto";
import { creditSnapshot } from "./lib/credits";
import { revokeLoginSessions } from "./lib/loginSessions";

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
      const credits = creditSnapshot(account);
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
        creditsLocked: account.creditsLocked === true,
        createdAt: new Date(account._creationTime).toISOString(),
        usage: {
          parseCount: period?.parseCount ?? 0,
          okfCount: period?.okfCount ?? 0,
        },
        creditsRemaining: credits.creditsRemaining,
        creditsUnlimited: credits.creditsUnlimited,
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
    const credits = creditSnapshot(account);
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
        creditsLocked: account.creditsLocked === true,
        stripeCustomerId: account.stripeCustomerId ?? null,
        createdAt: new Date(account._creationTime).toISOString(),
        creditsPurchased: credits.creditsPurchased,
        creditsSpent: credits.creditsSpent,
        creditsRemaining: credits.creditsRemaining,
        creditsUnlimited: credits.creditsUnlimited,
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
        llamaCredits: p.llamaCredits ?? 0,
        parseCreditsSpent: p.parseCreditsSpent ?? 0,
        pages: p.pages ?? 0,
        okfInputTokens: p.okfInputTokens ?? 0,
        okfOutputTokens: p.okfOutputTokens ?? 0,
        okfCreditsSpent: p.okfCreditsSpent ?? 0,
        packCount: p.packCount ?? 0,
        queryCount: p.queryCount ?? 0,
      })),
      events: events.map((e) => ({
        type: e.type,
        engine: e.engine ?? null,
        model: e.model ?? null,
        status: e.status ?? null,
        bytes: e.bytes ?? null,
        pages: e.pages ?? null,
        inputTokens: e.inputTokens ?? null,
        outputTokens: e.outputTokens ?? null,
        llamaCredits: e.llamaCredits ?? null,
        creditCost: e.creditCost ?? null,
        filename: e.filename ?? null,
        createId: e.createId ?? null,
        createdAt: new Date(e._creationTime).toISOString(),
      })),
    };
  },
});

/** Admin usage overview: current period aggregates per account. */
export const usageOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const accounts = await ctx.db.query("accounts").collect();
    const periodStart = startOfMonthMs();
    const rows = [];
    for (const account of accounts) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (qq) => qq.eq("userId", account.userId))
        .unique();
      if (!profile) continue;
      const credits = creditSnapshot(account);
      const period = await ctx.db
        .query("usagePeriods")
        .withIndex("by_account_period", (qq) =>
          qq.eq("accountId", account._id).eq("periodStart", periodStart),
        )
        .unique();
      rows.push({
        id: account._id,
        email: profile.email,
        name: account.name,
        disabled: account.disabled,
        creditsLocked: account.creditsLocked === true,
        creditsRemaining: credits.creditsRemaining,
        creditsUnlimited: credits.creditsUnlimited,
        parseCount: period?.parseCount ?? 0,
        parsePages: period?.pages ?? 0,
        llamaCredits: period?.llamaCredits ?? 0,
        parseCreditsSpent: period?.parseCreditsSpent ?? 0,
        okfCount: period?.okfCount ?? 0,
        okfInputTokens: period?.okfInputTokens ?? 0,
        okfOutputTokens: period?.okfOutputTokens ?? 0,
        okfCreditsSpent: period?.okfCreditsSpent ?? 0,
        packCount: period?.packCount ?? 0,
        queryCount: period?.queryCount ?? 0,
      });
    }
    rows.sort((a, b) => a.email.localeCompare(b.email));
    return {
      periodStart: new Date(periodStart).toISOString(),
      accounts: rows,
    };
  },
});

const PAGE_SIZE = 100;

/** Types shown in the Admin event log (all usageEvents writers). */
const ALL_LOG_TYPES = new Set([
  "pack_start",
  "pack_end",
  "pack",
  "query",
  "parse",
  "okf",
  "liteparse",
  "llamaparse_byo",
]);

function serializeUsageEvent(
  row: {
    _id: Id<"usageEvents">;
    _creationTime: number;
    accountId: Id<"accounts">;
    type: string;
    engine?: string;
    status?: string;
    provider?: string;
    model?: string;
    pages?: number;
    bytes?: number;
    llamaCredits?: number;
    creditCost?: number;
    filename?: string;
    jobId?: string;
    inputTokens?: number;
    outputTokens?: number;
    createId?: string;
    okfCount?: number;
    parseCount?: number;
  },
  email: string,
) {
  const type = row.type === "pack" ? "pack_end" : row.type;
  return {
    id: row._id,
    createdAt: row._creationTime,
    accountId: row.accountId,
    email,
    type,
    engine: row.engine ?? null,
    status: row.status ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    pages: row.pages ?? null,
    bytes: row.bytes ?? null,
    llamaCredits: row.llamaCredits ?? null,
    creditCost: row.creditCost ?? null,
    filename: row.filename ?? null,
    jobId: row.jobId ?? null,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    createId: row.createId ?? null,
    okfCount: row.okfCount ?? null,
    parseCount: row.parseCount ?? null,
  };
}

async function emailForAccount(
  ctx: { db: any },
  accountId: Id<"accounts">,
  cache: Map<Id<"accounts">, string>,
): Promise<string> {
  const hit = cache.get(accountId);
  if (hit !== undefined) return hit;
  const account = await ctx.db.get(accountId);
  if (!account) {
    cache.set(accountId, "—");
    return "—";
  }
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", account.userId))
    .unique();
  const email = profile?.email ?? account.name ?? "—";
  cache.set(accountId, email);
  return email;
}

function buildPrimaryEventsQuery(
  ctx: { db: any },
  args: {
    accountId?: Id<"accounts">;
    status?: string;
    engine?: string;
  },
) {
  const { accountId, status, engine } = args;
  // Current schema only indexes by_accountId. Type/status/engine filter in-memory.
  let base = accountId
    ? ctx.db
        .query("usageEvents")
        .withIndex("by_accountId", (q: any) => q.eq("accountId", accountId))
    : ctx.db.query("usageEvents");

  let filtered = base.order("desc");
  if (status) {
    filtered = filtered.filter((q: any) => q.eq(q.field("status"), status));
  }
  if (engine) {
    filtered = filtered.filter((q: any) => q.eq(q.field("engine"), engine));
  }
  return filtered;
}

/**
 * Full usage event log: parse / OKF / liteparse / pack / query (and anomalies).
 */
export const usageEventLog = query({
  args: {
    paginationOpts: paginationOptsValidator,
    accountId: v.optional(v.id("accounts")),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    engine: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const type = args.type?.trim() || undefined;
    const status = args.status?.trim() || undefined;
    const engine = args.engine?.trim() || undefined;
    const accountId = args.accountId;

    const filtered = buildPrimaryEventsQuery(ctx, {
      accountId,
      status,
      engine,
    });

    const result = await filtered.paginate({
      ...args.paginationOpts,
      numItems: Math.min(250, PAGE_SIZE * 2),
    });

    const emailByAccount = new Map<Id<"accounts">, string>();
    const page = [];
    for (const row of result.page) {
      if (!ALL_LOG_TYPES.has(row.type)) continue;
      if (type === "query" && row.type !== "query") continue;
      if (type === "okf" && row.type !== "okf") continue;
      if (
        type === "parse" &&
        row.type !== "parse" &&
        row.type !== "liteparse" &&
        row.type !== "llamaparse_byo"
      ) {
        continue;
      }
      if (
        type === "pack" &&
        row.type !== "pack" &&
        row.type !== "pack_start" &&
        row.type !== "pack_end"
      ) {
        continue;
      }
      if (type === "pack_start" && row.type !== "pack_start") continue;
      if (
        type === "pack_end" &&
        row.type !== "pack_end" &&
        row.type !== "pack"
      ) {
        continue;
      }
      const email = await emailForAccount(ctx, row.accountId, emailByAccount);
      page.push(serializeUsageEvent(row, email));
    }

    return {
      ...result,
      page: page.slice(0, PAGE_SIZE),
    };
  },
});

function serializeStepEvent(
  row: {
    _id: Id<"usageStepEvents">;
    _creationTime: number;
    accountId: Id<"accounts">;
    createId: string;
    type: string;
    engine?: string;
    status?: string;
    provider?: string;
    model?: string;
    pages?: number;
    bytes?: number;
    llamaCredits?: number;
    creditCost?: number;
    filename?: string;
    jobId?: string;
    inputTokens?: number;
    outputTokens?: number;
  },
  email: string,
) {
  return {
    id: row._id,
    createdAt: row._creationTime,
    accountId: row.accountId,
    email,
    createId: row.createId,
    type: row.type,
    engine: row.engine ?? null,
    status: row.status ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    pages: row.pages ?? null,
    bytes: row.bytes ?? null,
    llamaCredits: row.llamaCredits ?? null,
    creditCost: row.creditCost ?? null,
    filename: row.filename ?? null,
    jobId: row.jobId ?? null,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
  };
}

const STEP_TYPES = new Set([
  "parse",
  "okf",
  "liteparse",
  "llamaparse_byo",
]);

/** Step details for one Create ZipWiki session (parse / OKF / LiteParse / BYO). */
export const usageStepLog = query({
  args: {
    createId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { createId, paginationOpts }) => {
    await requireAdmin(ctx);
    const id = createId.trim().slice(0, 128);
    if (!id) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("usageStepEvents")
      .withIndex("by_createId", (q) => q.eq("createId", id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(PAGE_SIZE, paginationOpts.numItems ?? PAGE_SIZE),
      });

    const emailByAccount = new Map<Id<"accounts">, string>();
    const page = [];
    for (const row of result.page) {
      const email = await emailForAccount(ctx, row.accountId, emailByAccount);
      page.push(serializeStepEvent(row, email));
    }

    const firstPage =
      paginationOpts.cursor == null || paginationOpts.cursor === "";

    // Legacy: steps written into usageEvents before the step-table split.
    if (page.length === 0 && firstPage) {
      const sessionRows = await ctx.db
        .query("usageEvents")
        .withIndex("by_createId", (q) => q.eq("createId", id))
        .order("desc")
        .take(PAGE_SIZE);
      for (const row of sessionRows) {
        if (!STEP_TYPES.has(row.type)) continue;
        const email = await emailForAccount(ctx, row.accountId, emailByAccount);
        page.push(
          serializeStepEvent(
            {
              _id: row._id as unknown as Id<"usageStepEvents">,
              _creationTime: row._creationTime,
              accountId: row.accountId,
              createId: id,
              type: row.type,
              engine: row.engine,
              status: row.status,
              provider: row.provider,
              model: row.model,
              pages: row.pages,
              bytes: row.bytes,
              llamaCredits: row.llamaCredits,
              creditCost: row.creditCost,
              filename: row.filename,
              jobId: row.jobId,
              inputTokens: row.inputTokens,
              outputTokens: row.outputTokens,
            },
            email,
          ),
        );
      }
    }

    // Orphan recovery: parse/OKF recorded without createId (multipart miss).
    if (page.length === 0 && firstPage) {
      const sessionRows = await ctx.db
        .query("usageEvents")
        .withIndex("by_createId", (q) => q.eq("createId", id))
        .order("asc")
        .take(40);
      const packRows = sessionRows.filter(
        (row) =>
          row.type === "pack_start" ||
          row.type === "pack_end" ||
          row.type === "pack",
      );
      if (packRows.length > 0) {
        const accountId = packRows[0]!.accountId;
        const times = packRows.map((row) => row._creationTime);
        const startMs = Math.min(...times) - 5_000;
        const endMs = Math.max(...times) + 120_000;
        const orphans = await ctx.db
          .query("usageStepEvents")
          .withIndex("by_accountId_and_createId", (q) =>
            q.eq("accountId", accountId).eq("createId", "orphan"),
          )
          .order("desc")
          .take(200);
        for (const row of orphans) {
          if (row._creationTime < startMs || row._creationTime > endMs) {
            continue;
          }
          const email = await emailForAccount(ctx, row.accountId, emailByAccount);
          page.push(serializeStepEvent(row, email));
          if (page.length >= PAGE_SIZE) break;
        }
      }
      return { page, isDone: true, continueCursor: "" };
    }

    return { ...result, page };
  },
});

export const creditControls = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { creditsLocked: await globalCreditsLocked(ctx) };
  },
});

export const setGlobalCreditsLocked = mutation({
  args: { locked: v.boolean() },
  handler: async (ctx, { locked }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.query("platformControls").first();
    if (row) {
      await ctx.db.patch(row._id, { creditsLocked: locked });
    } else {
      await ctx.db.insert("platformControls", { creditsLocked: locked });
    }
    return { creditsLocked: locked };
  },
});

export const setCreditsLocked = mutation({
  args: { id: v.id("accounts"), locked: v.boolean() },
  handler: async (ctx, { id, locked }) => {
    await requireAdmin(ctx);
    const account = await ctx.db.get(id);
    if (!account) throw new Error("Not found");
    await ctx.db.patch(id, { creditsLocked: locked });
    return { ok: true, creditsLocked: locked };
  },
});

export const setDisabled = mutation({
  args: { id: v.id("accounts"), disabled: v.boolean() },
  handler: async (ctx, { id, disabled }) => {
    const { userId } = await requireAdmin(ctx);
    const account = await ctx.db.get(id);
    if (!account) throw new Error("Not found");
    if (disabled && account.userId === userId) {
      throw new Error("You cannot disable your own login");
    }
    await ctx.db.patch(id, { disabled });
    if (disabled) {
      await revokeLoginSessions(ctx, account.userId);
    }
    return { ok: true };
  },
});

export const grantCredits = mutation({
  args: {
    id: v.id("accounts"),
    credits: v.number(),
  },
  handler: async (ctx, { id, credits }) => {
    await requireAdmin(ctx);
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new Error("credits must be a positive number");
    }
    const account = await ctx.db.get(id);
    if (!account) throw new Error("Not found");
    await ctx.db.patch(id, {
      creditsPurchased: (account.creditsPurchased ?? 0) + credits,
    });
    await ctx.db.insert("creditLedger", {
      accountId: id,
      kind: "grant",
      credits,
    });
    return {
      ok: true,
      creditsPurchased: (account.creditsPurchased ?? 0) + credits,
    };
  },
});

export const setCreditsUnlimited = mutation({
  args: { id: v.id("accounts"), unlimited: v.boolean() },
  handler: async (ctx, { id, unlimited }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(id, { creditsUnlimited: unlimited });
    return { ok: true, creditsUnlimited: unlimited };
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
    const ledger = await ctx.db
      .query("creditLedger")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .collect();
    for (const row of ledger) await ctx.db.delete(row._id);
    const settings = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", id))
      .unique();
    if (settings) await ctx.db.delete(settings._id);
    await ctx.db.delete(id);
    return { ok: true };
  },
});
