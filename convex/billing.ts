import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { clampUsdCents, MAX_USD_CENTS } from "./lib/credits";

export const setAutoReload = mutation({
  args: {
    enabled: v.boolean(),
    thresholdCredits: v.number(),
    usdCents: v.number(),
  },
  handler: async (ctx, { enabled, thresholdCredits, usdCents }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("no_account");
    if (!Number.isFinite(thresholdCredits) || thresholdCredits < 0) {
      throw new Error("Threshold must be zero or more");
    }
    const threshold = Math.min(
      Math.round(thresholdCredits),
      (MAX_USD_CENTS / 100) * 100,
    );
    await ctx.db.patch(account._id, {
      autoReloadEnabled: enabled,
      autoReloadThresholdCredits: threshold,
      autoReloadUsdCents: clampUsdCents(usdCents),
    });
    return { ok: true as const };
  },
});
