import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { firstWebOrigin } from "./authRedirects";
import {
  generateApiKey,
  generateDeviceCodes,
  hashApiKey,
  hashDeviceCode,
} from "./lib/crypto";

const DEVICE_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_SEC = 5;

function normalizeUserCode(raw: string): string {
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (alnum.length === 8) {
    return `${alnum.slice(0, 4)}-${alnum.slice(4)}`;
  }
  return raw.trim().toUpperCase();
}

export const requestCode = mutation({
  args: { clientName: v.optional(v.string()) },
  handler: async (ctx, { clientName }) => {
    const { deviceCode, userCode } = generateDeviceCodes();
    const deviceCodeHash = await hashDeviceCode(deviceCode);
    const expiresAt = Date.now() + DEVICE_TTL_MS;

    await ctx.db.insert("deviceAuthCodes", {
      deviceCodeHash,
      userCode,
      clientName: clientName?.trim() || "zipwiki",
      status: "pending",
      expiresAt,
    });

    const webOrigin = firstWebOrigin();

    return {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${webOrigin}/cli/device`,
      verification_uri_complete: `${webOrigin}/cli/device?user_code=${encodeURIComponent(userCode)}`,
      expires_in: Math.floor(DEVICE_TTL_MS / 1000),
      interval: POLL_INTERVAL_SEC,
    };
  },
});

export const pollToken = mutation({
  args: { deviceCode: v.string() },
  handler: async (ctx, { deviceCode }) => {
    const deviceCodeHash = await hashDeviceCode(deviceCode);
    const row = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_deviceCodeHash", (q) =>
        q.eq("deviceCodeHash", deviceCodeHash),
      )
      .unique();

    if (!row) return { status: "expired" as const };
    if (row.expiresAt < Date.now()) {
      await ctx.db.delete(row._id);
      return { status: "expired" as const };
    }
    if (row.status === "pending") return { status: "pending" as const };
    if (row.status === "denied") {
      await ctx.db.delete(row._id);
      return { status: "denied" as const };
    }

    const apiKey = row.apiKeyOnce;
    if (!apiKey) return { status: "pending" as const };

    await ctx.db.delete(row._id);
    return {
      status: "approved" as const,
      access_token: apiKey,
      token_type: "bearer" as const,
      key_prefix: row.keyPrefix,
    };
  },
});

export const pendingByUserCode = query({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_userCode", (q) =>
        q.eq("userCode", normalizeUserCode(userCode)),
      )
      .unique();

    if (!row || row.expiresAt < Date.now()) return null;
    return {
      userCode: row.userCode,
      clientName: row.clientName,
      status: row.status,
      expiresAt: row.expiresAt,
    };
  },
});

export const approve = mutation({
  args: {
    userCode: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")),
  },
  handler: async (ctx, { userCode, decision }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const account = await ctx.db
      .query("accounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!account) throw new Error("No account — complete signup first");

    const row = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_userCode", (q) =>
        q.eq("userCode", normalizeUserCode(userCode)),
      )
      .unique();
    if (!row || row.expiresAt < Date.now()) throw new Error("Code expired");
    if (row.status !== "pending") throw new Error("Already decided");

    if (decision === "denied") {
      await ctx.db.patch(row._id, {
        status: "denied",
        userId,
        accountId: account._id,
        approvedAt: Date.now(),
      });
      return { ok: true, status: "denied" as const };
    }

    const { raw, prefix } = generateApiKey();
    const keyHash = await hashApiKey(raw);
    await ctx.db.insert("apiKeys", {
      accountId: account._id,
      name: `CLI ${row.clientName}`,
      keyHash,
      keyPrefix: prefix,
    });

    await ctx.db.patch(row._id, {
      status: "approved",
      userId,
      accountId: account._id,
      apiKeyOnce: raw,
      keyPrefix: prefix,
      approvedAt: Date.now(),
    });

    const settings = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .unique();
    const setupComplete = Boolean(settings?.setupCompletedAt);
    const webOrigin = firstWebOrigin();

    return {
      ok: true,
      status: "approved" as const,
      setup_required: !setupComplete,
      setup_url: setupComplete
        ? null
        : `${webOrigin}/cli/setup`,
    };
  },
});
