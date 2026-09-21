import { z } from "zod";

export const ClientConfigSchema = z.object({
  packageSpecVersion: z.string(),
  apiKeysRequired: z.boolean(),
  plan: z.object({
    slug: z.string(),
    maxParsesPerMonth: z.number(),
    maxOkfPerMonth: z.number(),
    maxPagesPerDocument: z.number().nullable(),
  }),
  usage: z
    .object({
      parseCount: z.number(),
      okfCount: z.number(),
      liteparseSuccessCount: z.number().default(0),
      liteparseFailCount: z.number().default(0),
      periodStart: z.string(),
      periodEnd: z.string(),
    })
    .nullable(),
  entitlements: z
    .object({
      llamaParse: z.object({
        billable: z.boolean(),
        remaining: z.number(),
        fallback: z.boolean(),
      }),
      zipwikiOkf: z.object({
        billable: z.boolean(),
        remaining: z.number(),
        fallback: z.boolean(),
      }),
    })
    .optional(),
  creditsRemaining: z.number().optional(),
  creditsUnlimited: z.boolean().optional(),
  settings: z.unknown().nullable().optional(),
  setupComplete: z.boolean().optional(),
  setupUrl: z.string().nullable().optional(),
  parse: z.object({
    engines: z.array(z.string()),
    modes: z.array(z.string()),
    defaults: z.object({
      engine: z.string(),
      mode: z.string(),
      compression: z.string().optional(),
    }),
    parserReady: z.boolean(),
    llamaparseConfigured: z.boolean(),
    maxUploadBytes: z.number().nullable(),
    supportedExtensions: z.array(z.string()),
  }),
  okf: z.object({
    provider: z.string(),
    model: z.string(),
    configured: z.boolean(),
  }),
  features: z.object({
    mcp: z.boolean(),
    packages: z.boolean(),
  }),
});

export type ClientConfig = z.infer<typeof ClientConfigSchema>;

export const DeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string().optional(),
  interval: z.number(),
  expires_in: z.number(),
});

export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;

export type DeviceTokenPending = {
  status: "authorization_pending" | "slow_down";
  interval?: number;
};

export type DeviceTokenSuccess = {
  status: "approved";
  api_key: string;
  key_prefix: string;
  api_url: string;
};

export type DeviceTokenDenied = {
  status: "expired_token" | "access_denied" | "error";
  error?: string;
};

export type DeviceTokenResult =
  | DeviceTokenPending
  | DeviceTokenSuccess
  | DeviceTokenDenied;
