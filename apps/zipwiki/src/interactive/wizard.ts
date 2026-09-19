import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import {
  buildEffectiveConfigView,
  formatNonInteractiveSetupError,
  formatZipwikiApiTarget,
  isOnboardingComplete,
  isSecretEnvConfigured,
  loadZipwikiConfig,
  loadZipwikiOnboarding,
  resolveOmitOriginalDocuments,
  resolveOkfCredentialSource,
  resolveParseCredentialSource,
  resolveZipwikiApiTarget,
  saveZipwikiHomeEnv,
  saveZipwikiOnboarding,
  shadowedHomeEnvKeys,
  zipwikiApiUrlForTarget,
  ZIPWIKI_API_PRESETS,
  type OkfCredentialSource,
  type ParseCredentialSource,
  type ZipwikiApiTarget,
} from "../lib/config/index.js";
import { isAiOkfConfigured } from "../lib/okf/index.js";
import { scaffoldProjectConfig, shellAtStartup } from "../config-cmd.js";
import {
  fetchZipWikiHealth,
  obtainZipwikiApiKey,
} from "../zipwiki-api.js";
import { isInteractiveTty } from "./tty.js";

function heading(label: string): string {
  return pc.bold(label);
}

export type WizardOptions = {
  /** When true, skip the re-init hub and walk configure steps immediately. */
  walkAllSteps?: boolean;
  quiet?: boolean;
  /**
   * Session pack input (file or directory). Usually from the CLI; not a
   * persisted setting. Defaults to cwd.
   */
  sourceDir?: string;
};

export type InitWizardResult = {
  packedNow: boolean;
  sourceDir: string;
  recurse: boolean;
  omitOriginalDocuments: boolean;
};

function cancelIf(value: unknown): asserts value is string | boolean {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
}

function resolveSourceDir(preferred?: string): string {
  const raw = preferred?.trim();
  if (raw) {
    const path = resolve(raw);
    if (!existsSync(path)) {
      throw new Error(`Source path does not exist: ${path}`);
    }
    return path;
  }
  return process.cwd();
}

function keyStatus(ok: boolean): string {
  return ok ? "ready" : "needs setup";
}

function labelParseSummary(input: {
  source: string;
  parser: string;
  parserMode: string;
  hasKey: boolean;
  apiUrl?: string;
}): string {
  const engine = `${input.parser}/${input.parserMode}`;
  switch (input.source) {
    case "zipwiki":
      return `${heading("Document parsing")}: ZipWiki API · ${formatZipwikiApiTarget(input.apiUrl)} · ${keyStatus(input.hasKey)}`;
    case "llama":
      return `${heading("Document parsing")}: LlamaParse · ${keyStatus(input.hasKey)}`;
    default:
      return `${heading("Document parsing")}: Local LiteParse · ${engine} · ${keyStatus(input.hasKey)}`;
  }
}

function labelOkfSummary(input: {
  source: string;
  useAi: boolean;
  hasKey: boolean;
  apiUrl?: string;
  provider?: string;
}): string {
  if (!input.useAi) return `${heading("OKF (AI enrichment)")}: off`;
  switch (input.source) {
    case "zipwiki":
      return `${heading("OKF (AI enrichment)")}: ZipWiki API · ${formatZipwikiApiTarget(input.apiUrl)} · ${keyStatus(input.hasKey)}`;
    case "anthropic":
      return `${heading("OKF (AI enrichment)")}: Anthropic · ${keyStatus(input.hasKey)}`;
    default: {
      const provider = input.provider?.trim() || "local";
      return `${heading("OKF (AI enrichment)")}: ${provider} · ${keyStatus(input.hasKey)}`;
    }
  }
}

/**
 * Prompt for a secret. When `alreadyConfigured`, only asks whether to keep the
 * existing value — never reads or returns the secret from env (presence is
 * checked via {@link isSecretEnvConfigured} elsewhere).
 * Returns `undefined` when the user keeps an existing secret (caller must not
 * overwrite). Returns the new value when entered.
 */
async function promptSecret(
  message: string,
  opts?: { alreadyConfigured?: boolean },
): Promise<string | undefined> {
  if (opts?.alreadyConfigured) {
    const keep = await p.confirm({
      message: `${message} — already configured. Keep existing value?`,
      initialValue: true,
    });
    cancelIf(keep);
    if (keep) return undefined;
  }
  const value = await p.password({
    message,
    validate: (v) => {
      if (!String(v ?? "").trim()) return "Required";
    },
  });
  cancelIf(value);
  return String(value).trim();
}

async function promptText(
  message: string,
  initialValue?: string,
): Promise<string> {
  const value = await p.text({
    message,
    initialValue: initialValue ?? "",
    validate: (v) => {
      if (!String(v ?? "").trim()) return "Required";
    },
  });
  cancelIf(value);
  return String(value).trim();
}

async function configureZipwikiApi(
  updates: Record<string, string | undefined>,
): Promise<void> {
  const existingUrl = process.env.ZIPWIKI_API_URL?.trim();
  const matched = resolveZipwikiApiTarget(existingUrl);
  const target = (await p.select({
    message: "ZipWiki API server",
    options: [
      {
        value: "dev",
        label: ZIPWIKI_API_PRESETS.dev.label,
        hint: ZIPWIKI_API_PRESETS.dev.hint,
      },
      {
        value: "production",
        label: ZIPWIKI_API_PRESETS.production.label,
        hint: ZIPWIKI_API_PRESETS.production.hint,
      },
    ],
    initialValue: matched === "production" ? "production" : "dev",
  })) as ZipwikiApiTarget;
  cancelIf(target);

  const url = zipwikiApiUrlForTarget(target);
  updates.ZIPWIKI_API_URL = url;
  p.log.message(`Using ${formatZipwikiApiTarget(url)}`);

  let health;
  try {
    health = await fetchZipWikiHealth(url);
  } catch (err) {
    p.log.warn(
      err instanceof Error ? err.message : "Could not reach ZipWiki API",
    );
    const keepGoing = await p.confirm({
      message: "Continue without contacting the server?",
      initialValue: false,
    });
    cancelIf(keepGoing);
    if (!keepGoing) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    return;
  }

  if (!health.apiKeysRequired) {
    p.log.success(
      "Server does not require an API key (open/dev mode). URL saved.",
    );
    return;
  }

  if (isSecretEnvConfigured("ZIPWIKI_API_KEY")) {
    const keep = await p.confirm({
      message: "ZipWiki API key — already configured. Keep existing value?",
      initialValue: true,
    });
    cancelIf(keep);
    if (keep) return;
  }

  const authMode = await p.select({
    message: "Get a ZipWiki API key from the server",
    options: [
      { value: "login", label: "Log in (existing account)" },
      { value: "signup", label: "Sign up (new account)" },
      {
        value: "paste",
        label: "Paste an existing API key",
        hint: "from the dashboard",
      },
    ],
    initialValue: "login",
  });
  cancelIf(authMode);

  if (authMode === "paste") {
    const key = await promptSecret("ZipWiki API key (zc_live_…)");
    if (key) updates.ZIPWIKI_API_KEY = key;
    return;
  }

  const email = await promptText(
    "Account email",
    process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim(),
  );
  const password = await promptSecret("Account password");
  if (!password) {
    throw new Error("Password required");
  }

  const spinner = p.spinner();
  spinner.start(
    authMode === "signup"
      ? "Creating account…"
      : "Logging in and creating API key…",
  );
  try {
    const { apiKey, email: resolvedEmail } = await obtainZipwikiApiKey({
      baseUrl: url,
      email,
      password,
      mode: authMode as "signup" | "login",
    });
    spinner.stop(`Authenticated as ${resolvedEmail}`);
    updates.ZIPWIKI_API_KEY = apiKey;
    updates.ZIPWIKI_ACCOUNT_EMAIL = resolvedEmail;
    p.log.success("API key obtained from ZipWiki server and saved locally.");
  } catch (err) {
    spinner.stop("Authentication failed");
    throw err;
  }
}

/** Collect keys for the chosen credential sources into `updates`. */
async function collectCredentialSecrets(input: {
  parseCredential: ParseCredentialSource;
  okfCredential: OkfCredentialSource;
  useAi: boolean;
  updates: Record<string, string | undefined>;
}): Promise<void> {
  const { parseCredential, okfCredential, useAi, updates } = input;
  const needZipWiki =
    parseCredential === "zipwiki" ||
    (useAi && okfCredential === "zipwiki");
  const needLlama = parseCredential === "llama";
  const needAnthropic = useAi && okfCredential === "anthropic";

  if (needZipWiki) {
    await configureZipwikiApi(updates);
  }

  if (needLlama) {
    const key = await promptSecret("LlamaCloud API key (LLAMA_CLOUD_API_KEY)", {
      alreadyConfigured: isSecretEnvConfigured("LLAMA_CLOUD_API_KEY"),
    });
    if (key) updates.LLAMA_CLOUD_API_KEY = key;
  }

  if (needAnthropic) {
    const key = await promptSecret("Anthropic API key (ANTHROPIC_API_KEY)", {
      alreadyConfigured: isSecretEnvConfigured("ANTHROPIC_API_KEY"),
    });
    if (key) {
      updates.ANTHROPIC_API_KEY = key;
      updates.ZIPWIKI_OKF_PROVIDER = "anthropic";
    }
  }
}

/** Persisted pack defaults (source directory is session-only — not included). */
export function formatInitSettingsSummary(
  startDir: string = process.cwd(),
): string {
  const { config } = loadZipwikiConfig({}, startDir);
  const view = buildEffectiveConfigView({ config, startDir });
  const onboarding = view.onboarding;

  const parser =
    view.project?.parserEngine ??
    view.env.ZIPWIKI_PARSER ??
    "(default liteparse)";
  const parserMode =
    view.project?.parserMode ??
    view.env.ZIPWIKI_PARSER_MODE ??
    "(default)";
  const compression =
    view.project?.packCompression ??
    onboarding.compression ??
    "zstd";
  const level =
    view.project?.packLevel ?? onboarding.level ?? 7;
  const recurse = onboarding.recurse === true;
  const omitOriginal = resolveOmitOriginalDocuments({
    onboarding,
    pack:
      view.project?.omitOriginalDocuments !== undefined
        ? { omitOriginalDocuments: view.project.omitOriginalDocuments }
        : undefined,
  });
  const parseCredential = view.credentials.parseCredential;
  const okfCredential = view.credentials.okfCredential;
  const apiUrl = view.env.ZIPWIKI_API_URL;

  return [
    labelParseSummary({
      source: parseCredential,
      parser,
      parserMode,
      hasKey: view.credentials.hasParseKey,
      apiUrl,
    }),
    labelOkfSummary({
      source: okfCredential,
      useAi: view.credentials.useAi,
      hasKey: view.credentials.hasOkfKey,
      apiUrl,
      provider: view.credentials.okfProvider,
    }),
    `${heading("Archive contents")}: ${omitOriginal ? "parsed text only" : "parsed text + original files"}`,
    `${heading("Zip compression")}: ${compression} ${level} · recurse ${recurse ? "yes" : "no"}`,
  ].join("\n");
}

async function promptSourceDir(current: string): Promise<string> {
  const sourceRaw = await p.text({
    message: "Source directory (file or directory to pack)",
    initialValue: current,
    validate: (v) => {
      const path = resolve(String(v).trim());
      if (!existsSync(path)) return "Path does not exist";
    },
  });
  cancelIf(sourceRaw);
  return resolve(String(sourceRaw).trim());
}

async function runConfigureSteps(): Promise<{
  recurse: boolean;
  omitOriginalDocuments: boolean;
}> {
  const onboarding = loadZipwikiOnboarding();
  const updates: Record<string, string | undefined> = {};

  const parseInitial = resolveParseCredentialSource();
  const parseCredential = (await p.select({
    message: "Parse credentials",
    options: [
      {
        value: "zipwiki",
        label: "ZipWiki API (login/signup against the server)",
        hint: "default when API URL is set",
      },
      {
        value: "llama",
        label: "LlamaParse — your LLAMA_CLOUD_API_KEY",
      },
      {
        value: "local",
        label: "Local LiteParse only (no cloud parse key)",
      },
    ],
    initialValue: parseInitial,
  })) as ParseCredentialSource;
  cancelIf(parseCredential);
  updates.ZIPWIKI_PARSE_CREDENTIAL = parseCredential;

  if (parseCredential === "llama") {
    updates.ZIPWIKI_PARSER = "llamaparse";
    updates.ZIPWIKI_PARSER_MODE = "fixed";
  } else if (parseCredential === "local") {
    const existingParser = process.env.ZIPWIKI_PARSER?.trim() || "liteparse";
    const existingMode = process.env.ZIPWIKI_PARSER_MODE?.trim();
    const parserInitial =
      existingMode === "auto" ? "auto" : existingParser === "llamaparse"
        ? "liteparse"
        : existingParser;

    const parser = await p.select({
      message: "Local document parser",
      options: [
        { value: "liteparse", label: "LiteParse (local)" },
        {
          value: "auto",
          label: "Auto (LiteParse → LlamaParse when complex)",
          hint: "needs LLAMA_CLOUD_API_KEY for escalation",
        },
      ],
      initialValue: parserInitial === "auto" ? "auto" : "liteparse",
    });
    cancelIf(parser);
    if (parser === "auto") {
      updates.ZIPWIKI_PARSER = "liteparse";
      updates.ZIPWIKI_PARSER_MODE = "auto";
    } else {
      updates.ZIPWIKI_PARSER = String(parser);
      updates.ZIPWIKI_PARSER_MODE = "fixed";
    }
  } else {
    // Hosted ZipWiki parse — keep a sensible local fallback engine.
    updates.ZIPWIKI_PARSER =
      process.env.ZIPWIKI_PARSER?.trim() || "liteparse";
    updates.ZIPWIKI_PARSER_MODE =
      process.env.ZIPWIKI_PARSER_MODE?.trim() || "fixed";
  }

  const resolvedOkf = resolveOkfCredentialSource();
  const okfInitial =
    onboarding.useAi === false
      ? "skip"
      : resolvedOkf === "anthropic"
        ? "anthropic"
        : "zipwiki";
  const okfChoice = await p.select({
    message: "OKF (AI enrichment) credentials",
    options: [
      {
        value: "zipwiki",
        label: "ZipWiki API (same account as hosted parse)",
      },
      {
        value: "anthropic",
        label: "Anthropic — your ANTHROPIC_API_KEY (Claude)",
      },
      {
        value: "skip",
        label: "Skip AI OKF (deterministic metadata only)",
      },
    ],
    initialValue: okfInitial,
  });
  cancelIf(okfChoice);

  const useAi = okfChoice !== "skip";
  const okfCredential: OkfCredentialSource =
    okfChoice === "skip" ? "local" : (okfChoice as OkfCredentialSource);
  updates.ZIPWIKI_OKF_CREDENTIAL = okfCredential;

  await collectCredentialSecrets({
    parseCredential,
    okfCredential,
    useAi,
    updates,
  }).catch((err) => {
    p.log.error(err instanceof Error ? err.message : String(err));
    p.cancel("Credential setup failed.");
    process.exit(1);
  });

  const compression = await p.select({
    message: "Default ZIP compression",
    options: [
      { value: "zstd", label: "zstd (default, NeoZip)" },
      { value: "deflate", label: "deflate (Info-ZIP compatible)" },
      { value: "store", label: "store (no compression)" },
    ],
    initialValue: onboarding.compression ?? "zstd",
  });
  cancelIf(compression);

  const levelRaw = await p.text({
    message: "Compression level (0–9, 0=store; default 7)",
    initialValue: String(onboarding.level ?? 7),
    validate: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 9) return "Enter 0–9";
    },
  });
  cancelIf(levelRaw);
  const level = Number(levelRaw);

  const archiveContents = await p.select({
    message: "PDF/DOCX/etc in the archive",
    options: [
      {
        value: "extract",
        label: "Parsed text only",
        hint: "smaller archive; originals stay on disk",
      },
      {
        value: "both",
        label: "Parsed text and original file",
      },
    ],
    initialValue:
      (onboarding.omitOriginalDocuments ?? true) ? "extract" : "both",
  });
  cancelIf(archiveContents);
  const omitOriginalDocuments = archiveContents === "extract";

  const recurseAns = await p.confirm({
    message: "Recurse into subdirectories when packing a directory?",
    initialValue: onboarding.recurse === true,
  });
  cancelIf(recurseAns);
  const recurse = recurseAns === true;

  if (Object.keys(updates).length > 0) {
    const shadowed = shadowedHomeEnvKeys(shellAtStartup, updates);
    const path = saveZipwikiHomeEnv(updates);
    p.log.success(`Saved credentials & pack defaults → ${path}`);
    if (shadowed.length > 0) {
      p.log.warn(
        `Shell env still shadows: ${shadowed.join(", ")} (unset to use saved values)`,
      );
    }
    for (const [k, v] of Object.entries(updates)) {
      if (v) process.env[k] = v;
      else delete process.env[k];
    }
  }

  saveZipwikiOnboarding({
    completedAt: new Date().toISOString(),
    useAi,
    compression: compression as "zstd" | "deflate" | "store",
    level,
    aiRoot: "wiki",
    recurse,
    omitOriginalDocuments,
  });

  const scaffold = await p.confirm({
    message: "Write zipwiki.config.json in this directory if missing?",
    initialValue: true,
  });
  cancelIf(scaffold);
  if (scaffold) {
    const path = scaffoldProjectConfig();
    if (path) p.log.success(`Created ${path}`);
    else p.log.message("Project config already present.");
  }

  return { recurse, omitOriginalDocuments };
}

async function promptPackNow(initialValue: "yes" | "no" = "yes"): Promise<
  "yes" | "no" | "exit"
> {
  const choice = await p.select({
    message: "Pack documents now?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "exit", label: "Exit" },
    ],
    initialValue,
  });
  cancelIf(choice);
  return choice as "yes" | "no" | "exit";
}

function showSettingsAndSource(sourceDir: string, title: string): void {
  p.note(formatInitSettingsSummary(), title);
  p.log.message(`Source directory: ${sourceDir}`);
}

/**
 * Interactive first-run wizard. Writes pack defaults and credential choices to
 * `~/.zipwiki` (parse/OKF source, optional API keys, parser, compression).
 *
 * Source directory is session-only (CLI arg or interactive change), not saved.
 * When settings already exist, prints settings then source and asks what next.
 */
export async function runInitWizard(
  opts: WizardOptions = {},
): Promise<InitWizardResult> {
  if (!isInteractiveTty()) {
    throw new Error(formatNonInteractiveSetupError());
  }

  const onboarding = loadZipwikiOnboarding();
  let sourceDir = resolveSourceDir(opts.sourceDir);
  let recurse = onboarding.recurse === true;
  let omitOriginalDocuments =
    onboarding.omitOriginalDocuments ?? true;

  p.intro("ZipWiki setup");

  if (isOnboardingComplete() && !opts.walkAllSteps) {
    for (;;) {
      showSettingsAndSource(sourceDir, "Current settings");
      const next = await p.select({
        message: "What next?",
        options: [
          { value: "pack", label: "Start zip packing" },
          { value: "change", label: "Change settings" },
          { value: "source", label: "Change source directory" },
          { value: "done", label: "Done / exit" },
        ],
        initialValue: "pack",
      });
      cancelIf(next);
      if (next === "done") {
        p.outro("Setup unchanged.");
        return { packedNow: false, sourceDir, recurse, omitOriginalDocuments };
      }
      if (next === "pack") {
        p.outro("Starting pack…");
        return { packedNow: true, sourceDir, recurse, omitOriginalDocuments };
      }
      if (next === "source") {
        sourceDir = await promptSourceDir(sourceDir);
        p.log.success(`Source directory → ${sourceDir}`);
        continue;
      }
      p.log.message(
        "Choose parse and OKF credentials (ZipWiki API, LlamaParse, or Anthropic), then pack defaults.",
      );
      ({ recurse, omitOriginalDocuments } = await runConfigureSteps());
      showSettingsAndSource(sourceDir, "Updated settings");
      const packNow = await promptPackNow("yes");
      if (packNow === "exit") {
        p.outro("Setup complete.");
        return {
          packedNow: false,
          sourceDir,
          recurse,
          omitOriginalDocuments,
        };
      }
      if (packNow === "yes") {
        p.outro("Setup complete.");
        return {
          packedNow: true,
          sourceDir,
          recurse,
          omitOriginalDocuments,
        };
      }
    }
  }

  p.log.message(
    "Choose parse and OKF credentials (ZipWiki API, LlamaParse, or Anthropic), then pack defaults.",
  );

  ({ recurse, omitOriginalDocuments } = await runConfigureSteps());
  showSettingsAndSource(sourceDir, "Saved settings");

  const packNow = await promptPackNow("no");
  if (packNow === "exit") {
    p.outro("Setup complete.");
    return {
      packedNow: false,
      sourceDir,
      recurse,
      omitOriginalDocuments,
    };
  }

  p.outro("Setup complete.");
  return {
    packedNow: packNow === "yes",
    sourceDir,
    recurse,
    omitOriginalDocuments,
  };
}

/**
 * If AI OKF is requested but no provider key is configured, fail with a clear
 * message. Does not open the interactive installer for credentials.
 */
export async function ensureCredentialsOrFail(input: {
  useAi: boolean;
  interactive: boolean;
}): Promise<void> {
  if (!input.useAi) return;
  if (isAiOkfConfigured()) return;
  void input.interactive;
  throw new Error(formatNonInteractiveSetupError());
}
