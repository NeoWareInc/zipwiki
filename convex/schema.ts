import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * ZipWiki SaaS schema (replaces Neon product tables).
 * Auth tables come from @convex-dev/auth; app tables hold accounts/keys/usage/credits.
 */
export default defineSchema({
  ...authTables,

  /** App profile linked 1:1 to Convex Auth user (`users` from authTables). */
  profiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    role: v.union(v.literal("customer"), v.literal("admin")),
    googleId: v.optional(v.string()),
    /** Unix ms. Admin queries require a passkey assertion newer than this. */
    adminStepUpExpiresAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_googleId", ["googleId"]),

  accounts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    stripeCustomerId: v.optional(v.union(v.string(), v.null())),
    stripeSubscriptionId: v.optional(v.union(v.string(), v.null())),
    status: v.string(), // active | past_due | canceled
    disabled: v.boolean(),
    /** Prepaid credits purchased (lifetime). */
    creditsPurchased: v.optional(v.number()),
    /** Prepaid credits spent on hosted parse / hosted LLM. */
    creditsSpent: v.optional(v.number()),
    /** Admin/sales: unlimited hosted usage (no credit debit). */
    creditsUnlimited: v.optional(v.boolean()),
    autoReloadEnabled: v.optional(v.boolean()),
    autoReloadThresholdCredits: v.optional(v.number()),
    autoReloadUsdCents: v.optional(v.number()),
    stripePaymentMethodId: v.optional(v.string()),
    /** Set when a debit email was sent so a pack does not mail once per file. */
    lowCreditNotifiedAt: v.optional(v.number()),
    autoReloadPending: v.optional(v.boolean()),
    autoReloadPendingAt: v.optional(v.number()),
    autoReloadLastError: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

  /** Append-only credit purchases and spends. */
  creditLedger: defineTable({
    accountId: v.id("accounts"),
    kind: v.union(
      v.literal("purchase"),
      v.literal("spend_parse"),
      v.literal("spend_llm"),
      v.literal("grant"),
    ),
    /** Signed: + for purchase/grant, − for spend. */
    credits: v.number(),
    usdCents: v.optional(v.number()),
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    engine: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    pages: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    llamaCredits: v.optional(v.number()),
  })
    .index("by_accountId", ["accountId"])
    .index("by_stripeSessionId", ["stripeSessionId"])
    .index("by_stripePaymentIntentId", ["stripePaymentIntentId"]),

  apiKeys: defineTable({
    accountId: v.id("accounts"),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_accountId", ["accountId"])
    .index("by_keyHash", ["keyHash"]),

  usagePeriods: defineTable({
    accountId: v.id("accounts"),
    periodStart: v.number(), // ms epoch start of calendar month UTC
    parseCount: v.number(),
    okfCount: v.number(),
    liteparseSuccessCount: v.number(),
    liteparseFailCount: v.number(),
    /** Sum of LlamaParse `job.usage.credits` this month. */
    llamaCredits: v.optional(v.number()),
    /** ZipWiki credits debited for those LlamaParse jobs. */
    parseCreditsSpent: v.optional(v.number()),
  }).index("by_account_period", ["accountId", "periodStart"]),

  usageEvents: defineTable({
    accountId: v.id("accounts"),
    type: v.string(), // parse | okf | liteparse
    engine: v.optional(v.string()),
    bytes: v.optional(v.number()),
    status: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    pages: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    /** LlamaParse credits billed for this job (`job.usage.credits`). */
    llamaCredits: v.optional(v.number()),
    /** ZipWiki credits debited for this event. */
    creditCost: v.optional(v.number()),
  }).index("by_accountId", ["accountId"]),

  /** Master vendor float. The API key itself stays a Fly secret named by `secretEnv`. */
  providerAccounts: defineTable({
    slug: v.string(),
    displayName: v.string(),
    secretEnv: v.string(),
    floatUsdCents: v.number(),
    lowFloatUsdCents: v.number(),
  }).index("by_slug", ["slug"]),

  providerFloatLedger: defineTable({
    providerAccountId: v.id("providerAccounts"),
    kind: v.union(v.literal("topup"), v.literal("usage")),
    usdCents: v.optional(v.number()),
    pages: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    calls: v.optional(v.number()),
    note: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
  }).index("by_provider", ["providerAccountId"]),

  adminPasskeys: defineTable({
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.optional(v.array(v.string())),
  })
    .index("by_userId", ["userId"])
    .index("by_credentialId", ["credentialId"]),

  adminPasskeyChallenges: defineTable({
    userId: v.id("users"),
    challenge: v.string(),
    kind: v.union(v.literal("register"), v.literal("authenticate")),
    expiresAt: v.number(),
  }).index("by_userId", ["userId"]),

  deviceAuthCodes: defineTable({
    deviceCodeHash: v.string(),
    userCode: v.string(),
    clientName: v.string(),
    status: v.string(), // pending | approved | denied
    userId: v.optional(v.id("users")),
    accountId: v.optional(v.id("accounts")),
    apiKeyOnce: v.optional(v.string()),
    keyPrefix: v.optional(v.string()),
    expiresAt: v.number(),
    approvedAt: v.optional(v.number()),
  })
    .index("by_deviceCodeHash", ["deviceCodeHash"])
    .index("by_userCode", ["userCode"]),

  accountSettings: defineTable({
    accountId: v.id("accounts"),
    settingsJson: v.string(),
    setupCompletedAt: v.optional(v.number()),
  }).index("by_accountId", ["accountId"]),
});
