import { writeFileSync } from "node:fs";
import pc from "picocolors";
import {
  CONFIG_FILENAME,
  MANAGED_HOME_ENV_KEYS,
  buildEffectiveConfigView,
  findConfigPath,
  formatZipwikiApiTarget,
  loadZipwikiConfig,
  saveZipwikiHomeEnv,
  shadowedHomeEnvKeys,
  snapshotShellEnv,
  zipwikiHomeDir,
  zipwikiHomeEnvPath,
  zipwikiOnboardingPath,
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

function formatParseConfigLine(view: ReturnType<typeof buildEffectiveConfigView>): string {
  const source = view.credentials.parseCredential;
  const engine = view.project
    ? `${view.project.parserEngine}/${view.project.parserMode}`
    : "default";
  const key = keyStatus(view.credentials.hasParseKey);
  if (source === "zipwiki") {
    return `${heading("Document parsing")}: ZipWiki API · ${formatZipwikiApiTarget(view.env.ZIPWIKI_API_URL)} · ${key}`;
  }
  if (source === "llama") {
    return `${heading("Document parsing")}: LlamaParse · ${key}`;
  }
  return `${heading("Document parsing")}: Local LiteParse · ${engine} · ${key}`;
}

function formatOkfConfigLine(view: ReturnType<typeof buildEffectiveConfigView>): string {
  if (!view.credentials.useAi) return `${heading("OKF (AI enrichment)")}: off`;
  const source = view.credentials.okfCredential;
  const key = keyStatus(view.credentials.hasOkfKey);
  if (source === "zipwiki") {
    return `${heading("OKF (AI enrichment)")}: ZipWiki API · ${formatZipwikiApiTarget(view.env.ZIPWIKI_API_URL)} · ${key}`;
  }
  if (source === "anthropic") {
    return `${heading("OKF (AI enrichment)")}: Anthropic · ${key}`;
  }
  const provider = view.credentials.okfProvider ?? "local";
  const model = view.credentials.okfModel ?? "default";
  return `${heading("OKF (AI enrichment)")}: ${provider}/${model} · ${key}`;
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

export function runConfigShowCommand(opts: ConfigCommandOptions = {}): void {
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

  const lines = [
    `Home: ${view.homeDir}`,
    `Env file: ${view.homeEnvPath}`,
    `Onboarding: ${view.onboardingPath}`,
    `Project config: ${view.projectConfigPath ?? "(none)"}`,
    `Onboarding complete: ${view.credentials.onboardingComplete}`,
    formatParseConfigLine(view),
    formatOkfConfigLine(view),
  ];
  if (view.project) {
    lines.push(
      `${heading("Archive contents")}: ${
        view.project.omitOriginalDocuments
          ? "parsed text only"
          : "parsed text + original files"
      }`,
      `${heading("Zip compression")}: ${view.project.packCompression} ${view.project.packLevel}`,
    );
  }
  lines.push("", "Managed env (redacted):");
  for (const [k, v] of Object.entries(view.env)) {
    if (v === undefined) continue;
    lines.push(`  ${k}=${v}`);
  }
  console.log(lines.join("\n"));
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
