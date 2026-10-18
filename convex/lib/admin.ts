import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile || profile.role !== "admin") throw new Error("Admin only");
  if (
    !profile.adminStepUpExpiresAt ||
    profile.adminStepUpExpiresAt <= Date.now()
  ) {
    throw new Error("Admin step-up required");
  }
  return { userId, profile, adminEmail: profile.email };
}

/** Record who performed an admin change (account or platform control). */
export async function recordAdminAudit(
  ctx: MutationCtx,
  input: {
    adminUserId: Id<"users">;
    adminEmail: string;
    action: string;
    detail?: string;
    accountId?: Id<"accounts">;
  },
) {
  await ctx.db.insert("adminAuditLog", {
    accountId: input.accountId,
    adminUserId: input.adminUserId,
    adminEmail: input.adminEmail,
    action: input.action,
    detail: input.detail,
  });
}
