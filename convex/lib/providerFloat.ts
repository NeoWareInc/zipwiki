import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { crossedLowFloatThreshold } from "./credits";

/**
 * Append a usage ledger row, decrement vendor float, and email ops once per dip.
 */
export async function applyProviderFloatUsage(
  ctx: MutationCtx,
  args: {
    providerAccount: Doc<"providerAccounts">;
    usdCents: number;
    pages?: number;
    inputTokens?: number;
    outputTokens?: number;
    accountId: Id<"accounts">;
  },
): Promise<void> {
  const usdCents = Math.max(0, Math.round(args.usdCents));
  await ctx.db.insert("providerFloatLedger", {
    providerAccountId: args.providerAccount._id,
    kind: "usage",
    usdCents: usdCents > 0 ? usdCents : undefined,
    pages: args.pages,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    calls: 1,
    accountId: args.accountId,
  });

  if (usdCents <= 0) return;

  const before = args.providerAccount.floatUsdCents;
  const after = Math.max(0, before - usdCents);
  const notify = crossedLowFloatThreshold({
    before,
    after,
    threshold: args.providerAccount.lowFloatUsdCents,
    notifiedAt: args.providerAccount.lowFloatNotifiedAt,
  });
  const now = Date.now();
  await ctx.db.patch(args.providerAccount._id, {
    floatUsdCents: after,
    ...(notify ? { lowFloatNotifiedAt: now } : {}),
  });
  if (notify) {
    await ctx.scheduler.runAfter(0, internal.mail.sendLowProviderFloat, {
      slug: args.providerAccount.slug,
    });
  }
}
