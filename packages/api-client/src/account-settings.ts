import { z } from "zod";

export const ParseCredentialSchema = z.enum(["zipwiki", "llama", "local"]);
export const OkfCredentialSchema = z.enum(["zipwiki", "anthropic", "local"]);
export const ParseEngineSchema = z.enum(["liteparse", "llamaparse"]);
export const ParserModeSchema = z.enum(["fixed", "auto"]);
export const CompressionSchema = z.enum(["zstd", "deflate", "store"]);

export const AccountLiteParseSchema = z
  .object({
    ocrEnabled: z.boolean().optional(),
    maxPages: z.number().int().positive().optional(),
    dpi: z.number().positive().optional(),
    includeComplexity: z.boolean().optional(),
    ocrLanguage: z.string().optional(),
  })
  .strict();

export const AccountLlamaParseSchema = z
  .object({
    tier: z.string().optional(),
    version: z.string().optional(),
    expand: z.array(z.string()).optional(),
    region: z.string().nullable().optional(),
  })
  .strict();

export const AccountEscalateSchema = z
  .object({
    enabled: z.boolean().optional(),
    minNeedsOcrRatio: z.number().min(0).max(1).optional(),
    minLayoutComplexRatio: z.number().min(0).max(1).optional(),
    onMissingApiKey: z.enum(["fallback", "error"]).optional(),
  })
  .strict();

export const AccountParserSchema = z
  .object({
    engine: ParseEngineSchema.optional(),
    mode: ParserModeSchema.optional(),
    liteparse: AccountLiteParseSchema.optional(),
    llamaparse: AccountLlamaParseSchema.optional(),
    escalate: AccountEscalateSchema.optional(),
  })
  .strict();

export const AccountOkfSchema = z
  .object({
    useAi: z.boolean().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
  })
  .strict();

/** Which bring-your-own providers are configured on this machine. Secrets stay off the account. */
export const AccountByoSchema = z
  .object({
    llama: z.boolean().optional(),
    anthropic: z.boolean().optional(),
  })
  .strict();

export const AccountPackSchema = z
  .object({
    noOcr: z.boolean().optional(),
    omitOriginalDocuments: z.boolean().optional(),
    compression: CompressionSchema.optional(),
    level: z.number().int().min(0).max(9).optional(),
    recurse: z.boolean().optional(),
    storeSuffixes: z.array(z.string()).optional(),
  })
  .strict();

/** Non-secret account preferences synced to zipwiki. */
export const AccountSettingsBodySchema = z
  .object({
    version: z.literal(1).default(1),
    parseCredential: ParseCredentialSchema.default("local"),
    okfCredential: OkfCredentialSchema.default("local"),
    parser: AccountParserSchema.default({}),
    okf: AccountOkfSchema.default({}),
    pack: AccountPackSchema.default({}),
    byo: AccountByoSchema.optional(),
  })
  .strict();

export type AccountSettingsBody = z.infer<typeof AccountSettingsBodySchema>;
export type AccountSettingsBodyInput = z.input<typeof AccountSettingsBodySchema>;

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettingsBody =
  AccountSettingsBodySchema.parse({
    version: 1,
    parseCredential: "local",
    okfCredential: "local",
    parser: {
      engine: "liteparse",
      mode: "fixed",
      liteparse: {
        ocrEnabled: true,
        maxPages: 1000,
        dpi: 150,
        includeComplexity: true,
      },
      llamaparse: {
        tier: "agentic",
        version: "latest",
        expand: ["markdown"],
        region: null,
      },
      escalate: {
        enabled: false,
        minNeedsOcrRatio: 0.25,
        minLayoutComplexRatio: 0.5,
        onMissingApiKey: "fallback",
      },
    },
    okf: {
      useAi: false,
      provider: "anthropic",
      model: "claude-haiku-4-5",
    },
    pack: {
      noOcr: false,
      omitOriginalDocuments: true,
      compression: "zstd",
      level: 7,
      recurse: false,
      storeSuffixes: [
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".zip",
        ".nzip",
        ".gz",
        ".zst",
      ],
    },
  });

export const AccountSettingsResponseSchema = z.object({
  settings: AccountSettingsBodySchema,
  setupComplete: z.boolean(),
  setupCompletedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  setupUrl: z.string().nullable().optional(),
});

export type AccountSettingsResponse = z.infer<
  typeof AccountSettingsResponseSchema
>;

export function mergeAccountSettings(
  base: AccountSettingsBody,
  patch: AccountSettingsBodyInput,
): AccountSettingsBody {
  const parsedPatch = AccountSettingsBodySchema.partial().parse(patch);
  return AccountSettingsBodySchema.parse({
    version: 1,
    parseCredential: parsedPatch.parseCredential ?? base.parseCredential,
    okfCredential: parsedPatch.okfCredential ?? base.okfCredential,
    parser: {
      ...base.parser,
      ...parsedPatch.parser,
      liteparse: {
        ...base.parser.liteparse,
        ...parsedPatch.parser?.liteparse,
      },
      llamaparse: {
        ...base.parser.llamaparse,
        ...parsedPatch.parser?.llamaparse,
      },
      escalate: {
        ...base.parser.escalate,
        ...parsedPatch.parser?.escalate,
      },
    },
    okf: { ...base.okf, ...parsedPatch.okf },
    pack: { ...base.pack, ...parsedPatch.pack },
    byo:
      base.byo || parsedPatch.byo
        ? { ...base.byo, ...parsedPatch.byo }
        : undefined,
  });
}
