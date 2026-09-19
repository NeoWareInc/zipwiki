import { z } from "zod";

export const ParseEngineSchema = z.enum(["liteparse", "llamaparse"]);
export type ParseEngineId = z.infer<typeof ParseEngineSchema>;

export const ParserModeSchema = z.enum(["fixed", "auto"]);
export type ParserMode = z.infer<typeof ParserModeSchema>;

export const LiteParseConfigSchema = z
  .object({
    ocrEnabled: z.boolean().optional(),
    maxPages: z.number().int().positive().optional(),
    dpi: z.number().positive().optional(),
    includeComplexity: z.boolean().optional(),
    ocrLanguage: z.string().optional(),
    /** Path to a LiteParse-native JSON config file. */
    configFile: z.string().optional(),
  })
  .strict()
  .default({});

export const LlamaParseConfigSchema = z
  .object({
    tier: z.string().optional(),
    version: z.string().optional(),
    expand: z.array(z.string()).optional(),
    region: z.string().nullable().optional(),
  })
  .strict()
  .default({});

export const EscalateConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    minNeedsOcrRatio: z.number().min(0).max(1).optional(),
    minLayoutComplexRatio: z.number().min(0).max(1).optional(),
    onMissingApiKey: z.enum(["fallback", "error"]).optional(),
  })
  .strict()
  .default({});

export const ParserConfigSchema = z
  .object({
    engine: ParseEngineSchema.optional(),
    mode: ParserModeSchema.optional(),
    liteparse: LiteParseConfigSchema.optional(),
    llamaparse: LlamaParseConfigSchema.optional(),
    escalate: EscalateConfigSchema.optional(),
  })
  .strict()
  .default({});

export const OkfConfigSchema = z
  .object({
    useAi: z.boolean().optional(),
    /** LLM supplier: openai | anthropic | gemini | openrouter | openai-compatible | ai-gateway. */
    provider: z.string().optional(),
    model: z.string().optional(),
  })
  .strict()
  .default({});

export const PackConfigSchema = z
  .object({
    noOcr: z.boolean().optional(),
    /**
     * When true (default), parsed PDF/DOCX/images/… are stored in the .nzip as
     * extract only — original file bytes are not included. Source files on
     * disk are unchanged. Plain text and markdown are always stored as-is.
     * When false, both the original and the parsed extract are in the .nzip.
     */
    omitOriginalDocuments: z.boolean().optional(),
    /** ZIP compression algorithm for primaries / AI entries. */
    compression: z.enum(["zstd", "deflate", "store"]).optional(),
    /** Compression level 0–9 (0 = store). */
    level: z.number().int().min(0).max(9).optional(),
    /** Suffixes that should always be stored (e.g. `.pdf,.png`). */
    storeSuffixes: z.array(z.string()).optional(),
  })
  .strict()
  .default({});

/** Full ZipWiki project config. Reserved sections stay empty until later phases. */
export const ZipwikiConfigSchema = z
  .object({
    parser: ParserConfigSchema.optional(),
    okf: OkfConfigSchema.optional(),
    pack: PackConfigSchema.optional(),
    catalog: z.record(z.unknown()).optional(),
    compression: z.record(z.unknown()).optional(),
    agent: z.record(z.unknown()).optional(),
  })
  .strict();

export type ZipwikiConfigInput = z.input<typeof ZipwikiConfigSchema>;
export type ZipwikiConfig = z.output<typeof ZipwikiConfigSchema>;

/** Resolved runtime config with defaults applied. */
export type ResolvedZipwikiConfig = {
  parser: {
    engine: ParseEngineId;
    mode: ParserMode;
    liteparse: {
      ocrEnabled: boolean;
      maxPages: number;
      dpi: number;
      includeComplexity: boolean;
      ocrLanguage?: string;
      configFile?: string;
    };
    llamaparse: {
      tier: string;
      version: string;
      expand: string[];
      region: string | null;
    };
    escalate: {
      enabled: boolean;
      minNeedsOcrRatio: number;
      minLayoutComplexRatio: number;
      onMissingApiKey: "fallback" | "error";
    };
  };
  okf: {
    useAi: boolean;
    provider: string;
    model: string;
  };
  pack: {
    noOcr: boolean;
    omitOriginalDocuments: boolean;
    compression: "zstd" | "deflate" | "store";
    level: number;
    storeSuffixes: string[];
  };
  catalog: Record<string, unknown>;
  compression: Record<string, unknown>;
  agent: Record<string, unknown>;
};

export const DEFAULT_ZIPWIKI_CONFIG: ResolvedZipwikiConfig = {
  parser: {
    // Prefer LlamaParse when LLAMA_CLOUD_API_KEY is set; otherwise LiteParse.
    engine: "llamaparse",
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
    useAi: true,
    provider: "openai",
    model: "gpt-4o-mini",
  },
  pack: {
    noOcr: false,
    omitOriginalDocuments: true,
    compression: "zstd",
    level: 7,
    storeSuffixes: [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".zip",
      ".zipwiki",
      ".nzip",
      ".gz",
      ".zst",
    ],
  },
  catalog: {},
  compression: {},
  agent: {},
};

/** Resolve whether parsed document originals are excluded from the .nzip (default: true). */
export function resolveOmitOriginalDocuments(input?: {
  cli?: boolean | undefined;
  onboarding?: { omitOriginalDocuments?: boolean };
  pack?: { omitOriginalDocuments?: boolean };
}): boolean {
  if (input?.cli !== undefined) return input.cli;
  if (input?.onboarding?.omitOriginalDocuments !== undefined) {
    return input.onboarding.omitOriginalDocuments;
  }
  if (input?.pack?.omitOriginalDocuments !== undefined) {
    return input.pack.omitOriginalDocuments;
  }
  return DEFAULT_ZIPWIKI_CONFIG.pack.omitOriginalDocuments;
}
