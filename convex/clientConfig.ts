import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { creditSnapshot } from "./lib/credits";
import { startOfMonthMs } from "./lib/crypto";
import { hashApiKey } from "./lib/crypto";

const PACKAGE_SPEC_VERSION = "0.2";
const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".xlsx",
  ".xls",
  ".odt",
  ".ods",
  ".odp",
  ".rtf",
  ".txt",
  ".md",
  ".html",
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
  ".webp",
  ".gif",
];

/**
 * Build the hosted `/api/client-config` payload for a bearer API key.
 * Used by the Fly worker after validating the key.
 */
export const forApiKey = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const keyHash = await hashApiKey(token);
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();
    if (!key || key.revokedAt) return null;

    const account = await ctx.db.get(key.accountId);
    if (!account) return null;
    if (account.disabled || account.status === "suspended") return null;

    const credits = creditSnapshot(account);
    const periodStart = startOfMonthMs();
    const period = await ctx.db
      .query("usagePeriods")
      .withIndex("by_account_period", (q) =>
        q.eq("accountId", account._id).eq("periodStart", periodStart),
      )
      .unique();

    const settingsRow = await ctx.db
      .query("accountSettings")
      .withIndex("by_accountId", (q) => q.eq("accountId", account._id))
      .unique();
    let settings: unknown = null;
    if (settingsRow?.settingsJson) {
      try {
        settings = JSON.parse(settingsRow.settingsJson);
      } catch {
        settings = null;
      }
    }

    const webOrigin =
      process.env.WEB_ORIGIN?.trim().split(",")[0]?.trim() ||
      process.env.SITE_URL?.trim() ||
      "http://localhost:5173";
    const origin = webOrigin.replace(/\/$/, "");
    const setupComplete = Boolean(settingsRow?.setupCompletedAt);

    const remaining = credits.creditsRemaining;
    const unlimited = credits.creditsUnlimited;
    const billable = unlimited || remaining >= 1;
    const periodEndMs = Date.UTC(
      new Date(periodStart).getUTCFullYear(),
      new Date(periodStart).getUTCMonth() + 1,
      1,
    );

    return {
      packageSpecVersion: PACKAGE_SPEC_VERSION,
      apiKeysRequired: true,
      plan: credits.plan,
      usage: {
        parseCount: period?.parseCount ?? 0,
        okfCount: period?.okfCount ?? 0,
        liteparseSuccessCount: period?.liteparseSuccessCount ?? 0,
        liteparseFailCount: period?.liteparseFailCount ?? 0,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEndMs).toISOString(),
      },
      entitlements: {
        llamaParse: {
          billable,
          remaining: unlimited ? Number.MAX_SAFE_INTEGER : remaining,
          fallback: !billable,
        },
        zipwikiOkf: {
          billable,
          remaining: unlimited ? Number.MAX_SAFE_INTEGER : remaining,
          fallback: !billable,
        },
      },
      creditsRemaining: remaining,
      creditsUnlimited: unlimited,
      settings,
      setupComplete,
      setupUrl: setupComplete
        ? null
        : `${origin}/dashboard/settings?onboarding=1`,
      parse: {
        engines: ["liteparse", "llamaparse"],
        modes: ["fixed", "auto"],
        defaults: {
          engine: "liteparse",
          mode: "fixed",
          compression: "zstd",
        },
        parserReady: true,
        llamaparseConfigured: true,
        maxUploadBytes: 50 * 1024 * 1024,
        supportedExtensions: SUPPORTED_EXTENSIONS,
      },
      okf: {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        configured: true,
      },
      features: {
        mcp: true,
        packages: true,
      },
      accountId: account._id,
      apiKeyId: key._id,
    };
  },
});
