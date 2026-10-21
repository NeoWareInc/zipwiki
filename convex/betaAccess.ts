import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAdmin } from "./lib/admin";
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

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("betaInvites").collect();
    return rows
      .map((row) => ({
        id: row._id,
        email: row.email,
        note: row.note ?? null,
        invitedByEmail: row.invitedByEmail ?? null,
        createdAt: row._creationTime,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
});

export const addInvite = mutation({
  args: {
    email: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { email, note }) => {
    const admin = await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) throw new Error("Enter a valid email.");
    const existing = await ctx.db
      .query("betaInvites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (existing) return { id: existing._id, created: false };
    const id = await ctx.db.insert("betaInvites", {
      email: normalized,
      note: note?.trim() || undefined,
      invitedByEmail: admin.adminEmail,
    });
    return { id, created: true };
  },
});

export const removeInvite = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await requireAdmin(ctx);
    const normalized = email.trim().toLowerCase();
    const existing = await ctx.db
      .query("betaInvites")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (!existing) return { removed: false };
    await ctx.db.delete(existing._id);
    return { removed: true };
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
    });
    return parsed.value;
  },
});
