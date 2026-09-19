import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * LLM suppliers for OKF enrichment (OpenWiki-style registry, API-key auth).
 * OAuth / AWS / Vertex ADC providers are out of scope for ZipWiki OKF.
 */
export const OKF_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "openai-compatible",
  "ai-gateway",
] as const;

export type OkfProviderId = (typeof OKF_PROVIDERS)[number];

export type OkfProviderConfig = {
  label: string;
  apiKeyEnvKey: string;
  /** Extra env keys that also count as configured for this provider. */
  apiKeyEnvKeyAliases?: readonly string[];
  baseURL?: string;
  baseUrlEnvKey?: string;
  requiresBaseUrl?: boolean;
  defaultModel: string;
  /** Optional model ids shown in docs / help. */
  modelOptions?: readonly { id: string; label: string }[];
};

export const OKF_PROVIDER_CONFIGS: Record<OkfProviderId, OkfProviderConfig> = {
  openai: {
    label: "OpenAI",
    apiKeyEnvKey: "OPENAI_API_KEY",
    baseUrlEnvKey: "OPENAI_API_BASE",
    defaultModel: "gpt-4o-mini",
    modelOptions: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
  },
  anthropic: {
    label: "Anthropic",
    apiKeyEnvKey: "ANTHROPIC_API_KEY",
    baseUrlEnvKey: "ANTHROPIC_BASE_URL",
    defaultModel: "claude-haiku-4-5",
    modelOptions: [
      { id: "claude-haiku-4-5", label: "Claude Haiku" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet" },
      { id: "claude-opus-4-5", label: "Claude Opus" },
    ],
  },
  gemini: {
    label: "Gemini (AI Studio)",
    apiKeyEnvKey: "GEMINI_API_KEY",
    apiKeyEnvKeyAliases: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    defaultModel: "gemini-2.0-flash",
    modelOptions: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    apiKeyEnvKey: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    baseUrlEnvKey: "OPENROUTER_BASE_URL",
    defaultModel: "openai/gpt-4o-mini",
    modelOptions: [
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku" },
      { id: "google/gemini-2.0-flash-001", label: "Gemini Flash" },
    ],
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    apiKeyEnvKey: "OPENAI_COMPATIBLE_API_KEY",
    baseUrlEnvKey: "OPENAI_COMPATIBLE_BASE_URL",
    requiresBaseUrl: true,
    defaultModel: "gpt-4o-mini",
    modelOptions: [],
  },
  "ai-gateway": {
    label: "AI Gateway",
    apiKeyEnvKey: "AI_GATEWAY_API_KEY",
    baseUrlEnvKey: "AI_GATEWAY_URL",
    defaultModel: "gpt-4o-mini",
    modelOptions: [{ id: "gpt-4o-mini", label: "GPT-4o mini" }],
  },
};

export const DEFAULT_OKF_PROVIDER: OkfProviderId = "openai";

export function isOkfProviderId(value: string): value is OkfProviderId {
  return (OKF_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeOkfProvider(
  value: string | undefined | null,
): OkfProviderId | undefined {
  if (!value?.trim()) return undefined;
  const n = value.trim().toLowerCase();
  if (isOkfProviderId(n)) return n;
  return undefined;
}

function envNonEmpty(key: string, env: NodeJS.ProcessEnv): boolean {
  return Boolean(env[key]?.trim());
}

function providerHasKey(
  provider: OkfProviderId,
  env: NodeJS.ProcessEnv,
): boolean {
  const cfg = OKF_PROVIDER_CONFIGS[provider];
  if (envNonEmpty(cfg.apiKeyEnvKey, env)) return true;
  return (cfg.apiKeyEnvKeyAliases ?? []).some((k) => envNonEmpty(k, env));
}

/**
 * Resolve active provider: explicit override → ZIPWIKI_OKF_PROVIDER →
 * first configured API key (OpenWiki-style inference) → default openai.
 *
 * If an explicit/default provider has no API key, fall through to inference
 * so a bare config default of `openai` does not block Anthropic/Gemini keys.
 */
export function resolveOkfProvider(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): OkfProviderId {
  const fromEnv = normalizeOkfProvider(env.ZIPWIKI_OKF_PROVIDER);
  const fromOverride = normalizeOkfProvider(override);

  if (fromEnv && providerHasKey(fromEnv, env)) return fromEnv;
  if (fromOverride && providerHasKey(fromOverride, env)) return fromOverride;

  // Prefer Claude when its key is set (common ask), then OpenAI, then others.
  const inferOrder: OkfProviderId[] = [
    "anthropic",
    "openai",
    "gemini",
    "openrouter",
    "openai-compatible",
    "ai-gateway",
  ];
  for (const id of inferOrder) {
    if (providerHasKey(id, env)) return id;
  }

  // No keys: keep explicit preference so createOkfLanguageModel errors name it.
  return fromEnv ?? fromOverride ?? DEFAULT_OKF_PROVIDER;
}

export function isAiOkfConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return OKF_PROVIDERS.some((id) => providerHasKey(id, env));
}

export function resolveOkfModel(
  provider: OkfProviderId,
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.ZIPWIKI_OKF_MODEL?.trim();
  const fromOverride = override?.trim();
  const raw = fromOverride || fromEnv || "";
  if (!raw) return OKF_PROVIDER_CONFIGS[provider].defaultModel;

  const stripped = stripProviderPrefix(provider, raw);

  // Ignore the ZipWiki config default (`gpt-4o-mini`) when the active
  // supplier is not OpenAI — otherwise Anthropic/Gemini runs get the wrong id.
  const openaiConfigDefaults = new Set(["gpt-4o-mini", "gpt-4o"]);
  if (
    provider !== "openai" &&
    !fromEnv &&
    openaiConfigDefaults.has(stripped)
  ) {
    return OKF_PROVIDER_CONFIGS[provider].defaultModel;
  }

  return stripped;
}

/** Drop `anthropic/` prefix when the supplier is already Anthropic, etc. */
export function stripProviderPrefix(
  provider: OkfProviderId,
  modelId: string,
): string {
  const prefixes: Partial<Record<OkfProviderId, string[]>> = {
    anthropic: ["anthropic/"],
    openai: ["openai/"],
    gemini: ["google/", "gemini/"],
  };
  for (const p of prefixes[provider] ?? []) {
    if (modelId.startsWith(p)) return modelId.slice(p.length);
  }
  return modelId;
}

function resolveApiKey(
  provider: OkfProviderId,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const cfg = OKF_PROVIDER_CONFIGS[provider];
  const primary = env[cfg.apiKeyEnvKey]?.trim();
  if (primary) return primary;
  for (const alias of cfg.apiKeyEnvKeyAliases ?? []) {
    const v = env[alias]?.trim();
    if (v) return v;
  }
  return undefined;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveBaseUrl(
  provider: OkfProviderId,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const cfg = OKF_PROVIDER_CONFIGS[provider];
  if (cfg.baseUrlEnvKey) {
    const override = env[cfg.baseUrlEnvKey]?.trim();
    if (override) {
      const cleaned = override.replace(/\/$/, "");
      if (isAbsoluteHttpUrl(cleaned)) return cleaned;
      // Empty / relative / invalid values (common in .env templates) must not
      // become the SDK baseURL — that yields "Failed to parse URL from /messages".
    }
  }
  return cfg.baseURL;
}

export type OkfLanguageModelHandle = {
  provider: OkfProviderId;
  modelId: string;
  model: LanguageModel;
  /** Actor fragment for `generated.by` (e.g. `anthropic/claude-haiku-4-5`). */
  generatedByTag: string;
};

/**
 * Build a Vercel AI SDK language model for the resolved supplier.
 * Throws when credentials / base URL are missing.
 */
export function createOkfLanguageModel(input?: {
  provider?: string;
  model?: string;
  env?: NodeJS.ProcessEnv;
}): OkfLanguageModelHandle {
  const env = input?.env ?? process.env;
  const provider = resolveOkfProvider(input?.provider, env);
  const cfg = OKF_PROVIDER_CONFIGS[provider];
  const modelId = resolveOkfModel(provider, input?.model, env);
  const apiKey = resolveApiKey(provider, env);
  if (!apiKey) {
    throw new Error(
      `${cfg.apiKeyEnvKey} is required for OKF enrichment with ${cfg.label}.`,
    );
  }

  const baseURL = resolveBaseUrl(provider, env);
  if (cfg.requiresBaseUrl && !baseURL) {
    throw new Error(
      `${cfg.baseUrlEnvKey} is required for OKF enrichment with ${cfg.label}.`,
    );
  }

  let model: LanguageModel;
  switch (provider) {
    case "anthropic": {
      // Always pass an absolute baseURL. The AI SDK also reads ANTHROPIC_BASE_URL
      // from the environment; an empty template value would otherwise win and
      // produce requests to "/messages".
      const workspaceId = env.ANTHROPIC_WORKSPACE_ID?.trim();
      const anthropic = createAnthropic({
        apiKey,
        baseURL: baseURL ?? "https://api.anthropic.com/v1",
        ...(workspaceId
          ? { headers: { "anthropic-workspace-id": workspaceId } }
          : {}),
      });
      model = anthropic(modelId);
      break;
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({ apiKey });
      model = google(modelId);
      break;
    }
    case "openai":
    case "openrouter":
    case "openai-compatible":
    case "ai-gateway": {
      const openai = createOpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
      });
      model = openai(modelId);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported OKF provider: ${_exhaustive}`);
    }
  }

  return {
    provider,
    modelId,
    model,
    generatedByTag: `${provider}/${modelId}`,
  };
}
