import { writeFileSync } from "node:fs";
import pc from "picocolors";
import {
  CONFIG_FILENAME,
  MANAGED_HOME_ENV_KEYS,
  buildEffectiveConfigView,
  findConfigPath,
  loadZipwikiConfig,
  resolveZipwikiApiKey,
  resolveZipwikiApiTarget,
  saveZipwikiHomeEnv,
  shadowedHomeEnvKeys,
  snapshotShellEnv,
  zipwikiDeviceAuthUrl,
  zipwikiHomeDir,
  zipwikiHomeEnvPath,
  zipwikiOnboardingPath,
  type EffectiveConfigView,
  type ManagedHomeEnvKey,
} from "./lib/config/index.js";
import { OKF_PROVIDERS, isOkfProviderId } from "./lib/okf/index.js";

export type ConfigCommandOptions = {
  config?: string;
  format?: "text" | "json";
  quiet?: boolean;
};

const shellAtStartup = snapshotShellEnv();

function heading(label: string): string {
  return pc.bold(label);
}

function providerApiKeyEnv(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "openai-compatible":
      return "OPENAI_COMPATIBLE_API_KEY";
    case "ai-gateway":
      return "AI_GATEWAY_API_KEY";
    default:
      return "OPENAI_API_KEY";
  }
}

function keyStatus(ok: boolean): string {
  return ok ? "ready" : "needs setup";
}

function environmentName(url: string | undefined): string | undefined {
  const target = resolveZipwikiApiTarget(url);
  if (target === "production") return "Production";
  if (target === "dev" || target === "local") return "Dev";
  return undefined;
}

function formatParseConfigLine(view: EffectiveConfigView): string {
  const source = view.credentials.parseCredential;
  const key = keyStatus(view.credentials.hasParseKey);
  if (source === "zipwiki") {
    return `${heading("Document parsing")}: ZipWiki · ${key}`;
  }
  if (source === "llama") {
    return `${heading("Document parsing")}: LlamaParse · ${key}`;
  }
  return `${heading("Document parsing")}: Local LiteParse · ${key}`;
}

function formatOkfConfigLine(view: EffectiveConfigView): string {
  if (!view.credentials.useAi) return `${heading("OKF")}: off`;
  const source = view.credentials.okfCredential;
  const key = keyStatus(view.credentials.hasOkfKey);
  if (source === "zipwiki") {
    return `${heading("OKF")}: ZipWiki · ${key}`;
  }
  if (source === "anthropic") {
    return `${heading("OKF")}: Anthropic · ${key}`;
  }
  const provider = view.credentials.okfProvider ?? "local";
  return `${heading("OKF")}: ${provider} · ${key}`;
}

export function formatConfigShowText(
  view: EffectiveConfigView,
  email?: string,
): string {
  const signedIn = Boolean(view.env.ZIPWIKI_API_KEY);
  const account =
    email?.trim() || view.env.ZIPWIKI_ACCOUNT_EMAIL?.trim() || "";
  const lines = [
    `${heading("Account")}: ${
      account || (signedIn ? "signed in" : "not signed in")
    }`,
  ];
  const envName = environmentName(view.env.ZIPWIKI_API_URL);
  if (signedIn && envName) {
    lines.push(`${heading("Environment")}: ${envName}`);
  }
  lines.push(formatParseConfigLine(view), formatOkfConfigLine(view));
  if (view.project) {
    lines.push(
      `${heading("Archive")}: ${
        view.project.omitOriginalDocuments
          ? "parsed text only"
          : "parsed text and original files"
      }`,
      `${heading("Compression")}: ${view.project.packCompression} ${view.project.packLevel}`,
    );
  }
  return lines.join("\n");
}

async function lookupAccountEmail(): Promise<string | undefined> {
  const saved = process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim();
  if (saved) return saved;
  const key = resolveZipwikiApiKey();
  if (!key) return undefined;
  const target = resolveZipwikiApiTarget() ?? "dev";
  const base =
    target === "production"
      ? undefined
      : zipwikiDeviceAuthUrl(target === "local" ? "dev" : target);
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}/auth/whoami`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: key }),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return undefined;
    saveZipwikiHomeEnv({ ZIPWIKI_ACCOUNT_EMAIL: email });
    process.env.ZIPWIKI_ACCOUNT_EMAIL = email;
    return email;
  } catch {
    return undefined;
  }
}

export function runConfigPathCommand(opts: ConfigCommandOptions = {}): void {
  const project = findConfigPath(process.cwd());
  const lines = [
    `ZIPWIKI_HOME=${zipwikiHomeDir()}`,
    `homeEnv=${zipwikiHomeEnvPath()}`,
    `onboarding=${zipwikiOnboardingPath()}`,
    `projectConfig=${project ?? "(none)"}`,
  ];
  if (opts.format === "json") {
    console.log(
      JSON.stringify(
        {
          homeDir: zipwikiHomeDir(),
          homeEnvPath: zipwikiHomeEnvPath(),
          onboardingPath: zipwikiOnboardingPath(),
          projectConfigPath: project,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(lines.join("\n"));
}

export async function runConfigShowCommand(
  opts: ConfigCommandOptions = {},
): Promise<void> {
  const { config, configPath } = loadZipwikiConfig({
    configPath: opts.config,
  });
  const view = buildEffectiveConfigView({
    config,
    startDir: process.cwd(),
  });
  if (configPath) view.projectConfigPath = configPath;

  if (opts.format === "json") {
    console.log(JSON.stringify(view, null, 2));
    return;
  }

  const email = await lookupAccountEmail();
  console.log(formatConfigShowText(view, email));
}

export function runConfigSetCommand(
  key: string,
  value: string,
  opts: ConfigCommandOptions = {},
): void {
  const managed = new Set<string>(MANAGED_HOME_ENV_KEYS);
  if (!managed.has(key)) {
    throw new Error(
      `Unknown managed key "${key}". Expected one of: ${MANAGED_HOME_ENV_KEYS.join(", ")}`,
    );
  }
  const updates = { [key]: value };
  const shadowed = shadowedHomeEnvKeys(shellAtStartup, updates);
  const path = saveZipwikiHomeEnv(updates);
  if (!opts.quiet) {
    console.error(`[zipwiki config] wrote ${key} → ${path}`);
    if (shadowed.length > 0) {
      console.error(
        `[zipwiki config] warning: shell env still shadows: ${shadowed.join(", ")}`,
      );
    }
  }
}

export function runConfigProviderCommand(
  provider: string,
  opts: ConfigCommandOptions = {},
): void {
  const id = provider.trim().toLowerCase();
  if (!isOkfProviderId(id)) {
    throw new Error(
      `Unknown provider "${provider}". Expected: ${OKF_PROVIDERS.join(", ")}`,
    );
  }
  runConfigSetCommand("ZIPWIKI_OKF_PROVIDER", id, opts);
}

export function runConfigModelCommand(
  model: string,
  opts: ConfigCommandOptions = {},
): void {
  runConfigSetCommand("ZIPWIKI_OKF_MODEL", model.trim(), opts);
}

export function runConfigApiKeyCommand(
  provider: string,
  apiKey: string,
  opts: ConfigCommandOptions = {},
): void {
  const id = provider.trim().toLowerCase();
  if (!isOkfProviderId(id)) {
    throw new Error(
      `Unknown provider "${provider}". Expected: ${OKF_PROVIDERS.join(", ")}`,
    );
  }
  const key = providerApiKeyEnv(id) as ManagedHomeEnvKey;
  runConfigSetCommand(key, apiKey, opts);
  runConfigSetCommand("ZIPWIKI_OKF_PROVIDER", id, { ...opts, quiet: true });
}

/** Scaffold a minimal project config when missing. */
export function scaffoldProjectConfig(
  startDir: string = process.cwd(),
): string | undefined {
  const existing = findConfigPath(startDir);
  if (existing) return undefined;
  const path = `${startDir}/${CONFIG_FILENAME}`;
  const body = {
    parser: {
      engine: "liteparse",
      mode: "fixed",
    },
    okf: {
      useAi: true,
    },
    pack: {
      compression: "zstd",
      level: 7,
    },
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
  return path;
}

export { shellAtStartup, providerApiKeyEnv };
