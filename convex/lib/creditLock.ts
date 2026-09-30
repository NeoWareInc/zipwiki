import type { MutationCtx, QueryCtx } from "../_generated/server";
import { creditsSpendBlocked } from "./credits";

type DbCtx = QueryCtx | MutationCtx;

export async function globalCreditsLocked(ctx: DbCtx): Promise<boolean> {
  const row = await ctx.db.query("platformControls").first();
  return row?.creditsLocked === true;
}

export async function creditsLockedFor(
  ctx: DbCtx,
  account: { creditsLocked?: boolean },
): Promise<boolean> {
  return creditsSpendBlocked({
    accountLocked: account.creditsLocked,
    globalLocked: await globalCreditsLocked(ctx),
  });
}
