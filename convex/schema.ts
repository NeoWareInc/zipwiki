import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * ZipWiki SaaS schema (replaces Neon product tables).
 * Auth tables come from @convex-dev/auth; app tables hold accounts/plans/keys/usage.
 */
export default defineSchema({
  ...authTables,

  /** App profile linked 1:1 to Convex Auth user (`users` from authTables). */
  profiles: defineTable({
    userId: v.id("users"),
    email: v.string(),
    role: v.union(v.literal("customer"), v.literal("admin")),
    googleId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_googleId", ["googleId"]),

  plans: defineTable({
    slug: v.string(),
    name: v.string(),
    maxParsesPerMonth: v.number(),
    maxOkfPerMonth: v.number(),
    maxPagesPerDocument: v.union(v.number(), v.null()),
    stripePriceId: v.optional(v.union(v.string(), v.null())),
  }).index("by_slug", ["slug"]),

  accounts: defineTable({
    userId: v.id("users"),
    name: v.string(),
    planId: v.id("plans"),
    stripeCustomerId: v.optional(v.union(v.string(), v.null())),
    stripeSubscriptionId: v.optional(v.union(v.string(), v.null())),
    status: v.string(), // active | past_due | canceled
    disabled: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"]),

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
  }).index("by_account_period", ["accountId", "periodStart"]),

  usageEvents: defineTable({
    accountId: v.id("accounts"),
    type: v.string(), // parse | okf | liteparse
    engine: v.optional(v.string()),
    bytes: v.optional(v.number()),
    status: v.optional(v.string()),
  }).index("by_accountId", ["accountId"]),

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
