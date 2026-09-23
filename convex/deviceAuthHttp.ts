/**
 * Device auth HTTP helpers as internal mutations (HTTP actions cannot call public
 * mutations that use getAuthUserId in the same way; keep HTTP path internal).
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { firstWebOrigin } from "./authRedirects";
import {
  generateApiKey,
  generateDeviceCodes,
  hashApiKey,
  hashDeviceCode,
} from "./lib/crypto";

const DEVICE_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_SEC = 5;

export const requestCode = internalMutation({
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

export const pollToken = internalMutation({
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

    let email: string | undefined;
    if (row.accountId) {
      const account = await ctx.db.get(row.accountId);
      if (account) {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", account.userId))
          .unique();
        const user = await ctx.db.get(account.userId);
        email =
          profile?.email ||
          (user && "email" in user && typeof user.email === "string"
            ? user.email
            : undefined);
      }
    }
    await ctx.db.delete(row._id);
    return {
      status: "approved" as const,
      access_token: apiKey,
      token_type: "bearer" as const,
      key_prefix: row.keyPrefix,
      email,
    };
  },
});
