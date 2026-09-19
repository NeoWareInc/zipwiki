import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** maxParsesPerMonth = billable hosted LlamaParse docs; LiteParse is never billed. */
const PLAN_DEFS = [
  {
    slug: "free",
    name: "Free",
    maxParsesPerMonth: 0,
    maxOkfPerMonth: 0,
    maxPagesPerDocument: null as number | null,
  },
  {
    slug: "standard",
    name: "Standard",
    maxParsesPerMonth: 2_000,
    maxOkfPerMonth: 2_000,
    maxPagesPerDocument: 100 as number | null,
  },
  {
    slug: "pro",
    name: "Pro",
    maxParsesPerMonth: 20_000,
    maxOkfPerMonth: 20_000,
    maxPagesPerDocument: 1_000 as number | null,
  },
  {
    slug: "custom",
    name: "Unlimited",
    // Admin/sales assigned — practically unlimited hosted LlamaParse + OKF.
    maxParsesPerMonth: Number.MAX_SAFE_INTEGER,
    maxOkfPerMonth: Number.MAX_SAFE_INTEGER,
    maxPagesPerDocument: null as number | null,
  },
] as const;

/** Idempotent plan seed — call after deploy / from dashboard. */
export const seedPlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stripeStandard = process.env.STRIPE_PRICE_STANDARD?.trim() || null;
    const stripePro = process.env.STRIPE_PRICE_PRO?.trim() || null;

    for (const def of PLAN_DEFS) {
      const existing = await ctx.db
        .query("plans")
        .withIndex("by_slug", (q) => q.eq("slug", def.slug))
        .unique();
      const stripePriceId =
        def.slug === "standard"
          ? stripeStandard
          : def.slug === "pro"
            ? stripePro
            : null;
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: def.name,
          maxParsesPerMonth: def.maxParsesPerMonth,
          maxOkfPerMonth: def.maxOkfPerMonth,
          maxPagesPerDocument: def.maxPagesPerDocument,
          stripePriceId,
        });
      } else {
        await ctx.db.insert("plans", {
          slug: def.slug,
          name: def.name,
          maxParsesPerMonth: def.maxParsesPerMonth,
          maxOkfPerMonth: def.maxOkfPerMonth,
          maxPagesPerDocument: def.maxPagesPerDocument,
          stripePriceId,
        });
      }
    }
    return { ok: true, count: PLAN_DEFS.length };
  },
});

/** Public seed when no plans exist (greenfield bootstrap). */
export const seedPlansIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("plans").take(1);
    if (existing.length > 0) return { ok: true, seeded: false };
    // Inline same defs as seedPlans
    const stripeStandard = process.env.STRIPE_PRICE_STANDARD?.trim() || null;
    const stripePro = process.env.STRIPE_PRICE_PRO?.trim() || null;
    for (const def of PLAN_DEFS) {
      const stripePriceId =
        def.slug === "standard"
          ? stripeStandard
          : def.slug === "pro"
            ? stripePro
            : null;
      await ctx.db.insert("plans", {
        slug: def.slug,
        name: def.name,
        maxParsesPerMonth: def.maxParsesPerMonth,
        maxOkfPerMonth: def.maxOkfPerMonth,
        maxPagesPerDocument: def.maxPagesPerDocument,
        stripePriceId,
      });
    }
    return { ok: true, seeded: true, count: PLAN_DEFS.length };
  },
});

export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("plans").collect();
  },
});

export const getPlanBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});
