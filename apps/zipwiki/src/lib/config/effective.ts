import { findConfigPath } from "./load.js";
import {
  MANAGED_HOME_ENV_KEYS,
  SECRET_HOME_ENV_KEYS,
  isSecretEnvConfigured,
  maskSecret,
  zipwikiHomeDir,
  zipwikiHomeEnvPath,
} from "./home.js";
import {
  isOnboardingComplete,
  loadZipwikiOnboarding,
  zipwikiOnboardingPath,
  type ZipwikiOnboarding,
} from "./onboarding.js";
import type { ResolvedZipwikiConfig } from "./schema.js";
import {
  resolveOkfCredentialSource,
  resolveParseCredentialSource,
} from "./api.js";

const OKF_KEY_ENVS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "AI_GATEWAY_API_KEY",
] as const;

export type CredentialSetupStatus = {
  useAi: boolean;
  hasOkfKey: boolean;
  hasParseKey: boolean;
  parseCredential: string;
  okfCredential: string;
  okfProvider?: string;
  okfModel?: string;
  needsSetup: boolean;
  missing: string[];
  onboardingComplete: boolean;
};

/** Credential requirements for pack (parse + optional OKF). */
export function needsCredentialSetup(input?: {
  useAi?: boolean;
  env?: NodeJS.ProcessEnv;
  onboarding?: ZipwikiOnboarding;
}): CredentialSetupStatus {
  const env = input?.env ?? process.env;
  const onboarding = input?.onboarding ?? loadZipwikiOnboarding();
  const useAi = input?.useAi ?? onboarding.useAi ?? true;

  const parseCredential = resolveParseCredentialSource(env);
  const okfCredential = resolveOkfCredentialSource(env);

  const missing: string[] = [];

  if (parseCredential === "zipwiki") {
    if (!env.ZIPWIKI_API_URL?.trim()) missing.push("ZIPWIKI_API_URL");
  } else if (parseCredential === "llama") {
    if (!isSecretEnvConfigured("LLAMA_CLOUD_API_KEY", env)) {
      missing.push("LLAMA_CLOUD_API_KEY");
    }
  }

  let hasOkfKey = false;
  if (useAi) {
    if (okfCredential === "zipwiki") {
      // Hosted OKF uses ZIPWIKI_API_URL; key optional for open/dev servers.
      hasOkfKey = Boolean(env.ZIPWIKI_API_URL?.trim());
      if (!env.ZIPWIKI_API_URL?.trim()) missing.push("ZIPWIKI_API_URL");
    } else if (okfCredential === "anthropic") {
      hasOkfKey = isSecretEnvConfigured("ANTHROPIC_API_KEY", env);
      if (!hasOkfKey) missing.push("ANTHROPIC_API_KEY");
    } else {
      hasOkfKey = OKF_KEY_ENVS.some((k) => isSecretEnvConfigured(k, env));
      if (!hasOkfKey) missing.push("OKF_API_KEY");
    }
  }

  // Presence-only for credential status (never expose secret values here).
  const hasParseKey =
    parseCredential === "zipwiki"
      ? Boolean(env.ZIPWIKI_API_URL?.trim())
      : parseCredential === "llama"
        ? isSecretEnvConfigured("LLAMA_CLOUD_API_KEY", env)
        : true;

  return {
    useAi,
    hasOkfKey,
    hasParseKey,
    parseCredential,
    okfCredential,
    okfProvider: env.ZIPWIKI_OKF_PROVIDER?.trim() || undefined,
    okfModel: env.ZIPWIKI_OKF_MODEL?.trim() || undefined,
    needsSetup: missing.length > 0,
    missing: [...new Set(missing)],
    onboardingComplete: isOnboardingComplete(onboarding),
  };
}

export type EffectiveConfigView = {
  homeDir: string;
  homeEnvPath: string;
  onboardingPath: string;
  projectConfigPath?: string;
  onboarding: ZipwikiOnboarding;
  credentials: CredentialSetupStatus;
  env: Record<string, string | undefined>;
  project?: {
    parserEngine: string;
    parserMode: string;
    okfUseAi: boolean;
    okfProvider: string;
    okfModel: string;
    packCompression: string;
    packLevel: number;
    omitOriginalDocuments: boolean;
  };
};

/** Redacted view for `zipwiki config show` (never prints raw secrets). */
export function buildEffectiveConfigView(input?: {
  config?: ResolvedZipwikiConfig;
  startDir?: string;
  env?: NodeJS.ProcessEnv;
}): EffectiveConfigView {
  const env = input?.env ?? process.env;
  const onboarding = loadZipwikiOnboarding();
  const credentials = needsCredentialSetup({
    useAi: input?.config?.okf.useAi ?? onboarding.useAi ?? true,
    env,
    onboarding,
  });

  const envView: Record<string, string | undefined> = {};
  for (const key of MANAGED_HOME_ENV_KEYS) {
    const raw = env[key]?.trim();
    if (!raw) {
      envView[key] = undefined;
      continue;
    }
    envView[key] = SECRET_HOME_ENV_KEYS.has(key) ? maskSecret(raw) : raw;
  }

  const project = input?.config
    ? {
        parserEngine: input.config.parser.engine,
        parserMode: input.config.parser.mode,
        okfUseAi: input.config.okf.useAi,
        okfProvider: input.config.okf.provider,
        okfModel: input.config.okf.model,
        packCompression: input.config.pack.compression,
        packLevel: input.config.pack.level,
        omitOriginalDocuments: input.config.pack.omitOriginalDocuments,
      }
    : undefined;

  return {
    homeDir: zipwikiHomeDir(),
    homeEnvPath: zipwikiHomeEnvPath(),
    onboardingPath: zipwikiOnboardingPath(),
    projectConfigPath: findConfigPath(input?.startDir),
    onboarding,
    credentials,
    env: envView,
    project,
  };
}

export function formatNonInteractiveSetupError(
  status: CredentialSetupStatus = needsCredentialSetup(),
): string {
  return [
    "OKF AI enrichment needs an API key, but none is configured.",
    "Set ANTHROPIC_API_KEY for local OKF, LLAMA_CLOUD_API_KEY for LlamaParse,",
    "or ZIPWIKI_API_URL for the hosted API (login via `zipwiki init` to get a key when required).",
    "Override with ZIPWIKI_PARSE_CREDENTIAL / ZIPWIKI_OKF_CREDENTIAL",
    "(llama | anthropic | local), or use `zipwiki config api-key`,",
    "or pass --no-ai-okf for deterministic OKF.",
    status.missing.length
      ? `Missing: ${status.missing.join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
