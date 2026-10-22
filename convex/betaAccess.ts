import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { recordAdminAudit, requireAdmin } from "./lib/admin";
import {
  accountCountForLimit,
  capacityMessage,
  CAPACITY_TITLE,
  INVITE_ONLY_MESSAGE,
  INVITE_ONLY_TITLE,
  resolveBetaAccessMode,
  resolveBetaUserLimit,
} from "./lib/betaAccess";
import {
  CONTACT_MAX_PER_EMAIL,
  CONTACT_MAX_PER_HOUR,
  contactRateLimited,
  normalizeContact,
} from "./lib/contactForm";

/** Public beta gate status for login / signup UI. */
export const status = query({
  args: {},
  returns: v.object({
    mode: v.union(v.literal("invite"), v.literal("open")),
    canJoin: v.boolean(),
    limit: v.union(v.number(), v.null()),
    accountCount: v.union(v.number(), v.null()),
    title: v.union(v.string(), v.null()),
    message: v.union(v.string(), v.null()),
    requestEnabled: v.boolean(),
  }),
  handler: async (ctx) => {
    const mode = resolveBetaAccessMode();
    if (mode === "invite") {
      return {
        mode: "invite" as const,
        canJoin: false,
        limit: null,
        accountCount: null,
        title: INVITE_ONLY_TITLE,
        message: INVITE_ONLY_MESSAGE,
        requestEnabled: true,
      };
    }
    const limit = resolveBetaUserLimit();
    if (limit <= 0) {
      return {
        mode: "open" as const,
        canJoin: true,
        limit: null,
        accountCount: null,
        title: null,
        message: null,
        requestEnabled: false,
      };
    }
    const accountCount = await accountCountForLimit(ctx, limit);
    const canJoin = accountCount < limit;
    // Do not expose numeric seat counts on the public status API.
    return {
      mode: "open" as const,
      canJoin,
      limit: null,
      accountCount: null,
      title: canJoin ? null : CAPACITY_TITLE,
      message: canJoin ? null : capacityMessage(),
      requestEnabled: !canJoin,
    };
  },
});

export const accountCount = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const limit = resolveBetaUserLimit();
    return await accountCountForLimit(
      ctx,
      limit > 0 ? limit : Number.MAX_SAFE_INTEGER,
    );
  },
});

/**
 * Admin-only seat snapshot. Public `status` deliberately omits numeric counts.
 */
export const adminSeatStatus = query({
  args: {},
  returns: v.object({
    mode: v.union(v.literal("invite"), v.literal("open")),
    canJoin: v.boolean(),
    limit: v.union(v.number(), v.null()),
    accountCount: v.number(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const mode = resolveBetaAccessMode();
    const accounts = await ctx.db.query("accounts").collect();
    const accountCount = accounts.length;
    if (mode === "invite") {
      return {
        mode: "invite" as const,
        canJoin: false,
        limit: null,
        accountCount,
      };
    }
    const limit = resolveBetaUserLimit();
    if (limit <= 0) {
      return {
        mode: "open" as const,
        canJoin: true,
        limit: null,
        accountCount,
      };
    }
    return {
      mode: "open" as const,
      canJoin: accountCount < limit,
      limit,
      accountCount,
    };
  },
});

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("betaInvites").collect();
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_email", (q) => q.eq("email", row.email))
          .unique();
        return {
          id: row._id,
          email: row.email,
          note: row.note ?? null,
          invitedByEmail: row.invitedByEmail ?? null,
          createdAt: row._creationTime,
          sentAt: row.sentAt ?? null,
          acceptedAt: row.acceptedAt ?? null,
          hasAccount: Boolean(profile),
        };
      }),
    );
    return enriched.sort((a, b) => a.email.localeCompare(b.email));
  },
});

export const listRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("betaAccessRequests").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => {
        const status = row.status ?? "pending";
        const invite = await ctx.db
          .query("betaInvites")
          .withIndex("by_email", (q) => q.eq("email", row.email))
          .unique();
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_email", (q) => q.eq("email", row.email))
          .unique();
        return {
          id: row._id,
          name: row.name,
          email: row.email,
          message: row.message,
          reason: row.reason,
          status,
          createdAt: row._creationTime,
          reviewedAt: row.reviewedAt ?? null,
          reviewedByEmail: row.reviewedByEmail ?? null,
          hasInvite: Boolean(invite),
          hasAccount: Boolean(profile),
        };
      }),
    );
  },
});

async function markRequestsApproved(
  ctx: MutationCtx,
  email: string,
  reviewedByEmail: string,
) {
  const rows = await ctx.db
    .query("betaAccessRequests")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  const now = Date.now();
  for (const row of rows) {
    const status = row.status ?? "pending";
    if (status !== "pending") continue;
    await ctx.db.patch(row._id, {
      status: "approved",
      reviewedAt: now,
      reviewedByEmail,
    });
  }
}

/**
 * Add (or keep) an invite, approve matching access requests, optionally email.
 */
export const addInvite = mutation({
  args: {
    email: v.string(),
    note: v.optional(v.string()),
    sendEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, { email, note, sendEmail }) => {
    const admin = await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) throw new Error("Enter a valid email.");
    const shouldEmail = sendEmail !== false;

    let existing = await ctx.db
      .query("betaInvites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    let created = false;
    if (!existing) {
      const id = await ctx.db.insert("betaInvites", {
        email: normalized,
        note: note?.trim() || undefined,
        invitedByEmail: admin.adminEmail,
      });
      existing = (await ctx.db.get(id))!;
      created = true;
    } else if (note?.trim()) {
      await ctx.db.patch(existing._id, { note: note.trim() });
      existing = (await ctx.db.get(existing._id))!;
    }

    await markRequestsApproved(ctx, normalized, admin.adminEmail);
    await recordAdminAudit(ctx, {
      adminUserId: admin.userId,
      adminEmail: admin.adminEmail,
      action: created ? "beta_invite_add" : "beta_invite_refresh",
      detail: normalized,
    });

    if (shouldEmail) {
      await ctx.scheduler.runAfter(0, internal.mail.sendBetaInvite, {
        email: normalized,
      });
    }

    return { id: existing._id, created, emailed: shouldEmail };
  },
});

export const resendInvite = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const admin = await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    const existing = await ctx.db
      .query("betaInvites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (!existing) throw new Error("Invite not found.");
    await ctx.scheduler.runAfter(0, internal.mail.sendBetaInvite, {
      email: normalized,
    });
    await recordAdminAudit(ctx, {
      adminUserId: admin.userId,
      adminEmail: admin.adminEmail,
      action: "beta_invite_resend",
      detail: normalized,
    });
    return { ok: true as const };
  },
});

export const declineRequest = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const admin = await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    const rows = await ctx.db
      .query("betaAccessRequests")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .collect();
    const now = Date.now();
    let declined = 0;
    for (const row of rows) {
      const status = row.status ?? "pending";
      if (status !== "pending") continue;
      await ctx.db.patch(row._id, {
        status: "declined",
        reviewedAt: now,
        reviewedByEmail: admin.adminEmail,
      });
      declined += 1;
    }
    if (declined > 0) {
      await recordAdminAudit(ctx, {
        adminUserId: admin.userId,
        adminEmail: admin.adminEmail,
        action: "beta_request_decline",
        detail: normalized,
      });
    }
    return { declined };
  },
});

export const removeInvite = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const admin = await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    const existing = await ctx.db
      .query("betaInvites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (!existing) return { removed: false };
    await ctx.db.delete(existing._id);
    await recordAdminAudit(ctx, {
      adminUserId: admin.userId,
      adminEmail: admin.adminEmail,
      action: "beta_invite_remove",
      detail: normalized,
    });
    return { removed: true };
  },
});

export const markInviteSent = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    const invite = await ctx.db
      .query("betaInvites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (invite) {
      await ctx.db.patch(invite._id, { sentAt: Date.now() });
    }
    return null;
  },
});

/** Store an access request after the hourly limits. */
export const recordAccessRequest = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    message: v.string(),
    reason: v.union(v.literal("invite_only"), v.literal("capacity")),
  },
  handler: async (ctx, args) => {
    const parsed = normalizeContact({
      name: args.name,
      email: args.email,
      subject:
        args.reason === "invite_only"
          ? "Beta invite request (dev)"
          : "Beta access request (capacity)",
      message: args.message,
    });
    if (!parsed.ok) throw new ConvexError(parsed.error);

    const emailRows = await ctx.db
      .query("betaAccessRequests")
      .withIndex("by_email", (q) => q.eq("email", parsed.value.email))
      .order("desc")
      .take(CONTACT_MAX_PER_EMAIL);
    const recentRows = await ctx.db
      .query("betaAccessRequests")
      .order("desc")
      .take(CONTACT_MAX_PER_HOUR);
    const limited = contactRateLimited({
      emailTimes: emailRows.map((row) => row._creationTime),
      recentTimes: recentRows.map((row) => row._creationTime),
      now: Date.now(),
    });
    if (limited) throw new ConvexError(limited);

    await ctx.db.insert("betaAccessRequests", {
      name: parsed.value.name,
      email: parsed.value.email,
      message: parsed.value.message,
      reason: args.reason,
      status: "pending",
    });
    return parsed.value;
  },
});
