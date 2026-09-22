import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AccountSettingsBodySchema,
  DEFAULT_ACCOUNT_SETTINGS,
  fetchAccountSettings,
  type AccountSettingsBody,
  type AccountSettingsResponse,
} from "@zipwiki/api-client";
import {
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
} from "./api.js";
import { zipwikiHomeDir } from "./home.js";
import { isSecretEnvConfigured } from "./home.js";

export function zipwikiSettingsCachePath(): string {
  return join(zipwikiHomeDir(), "settings.json");
}

export type CachedAccountSettings = AccountSettingsResponse & {
  cachedAt: string;
};

export function loadCachedAccountSettings(): CachedAccountSettings | null {
  const path = zipwikiSettingsCachePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as CachedAccountSettings;
    AccountSettingsBodySchema.parse(raw.settings);
    return raw;
  } catch {
    return null;
  }
}

export function saveCachedAccountSettings(
  payload: AccountSettingsResponse,
): string {
  const dir = zipwikiHomeDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = zipwikiSettingsCachePath();
  const out: CachedAccountSettings = {
    ...payload,
    cachedAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  return path;
}

/** Apply credential prefs into process.env (BYO secrets stay local). */
export function applyAccountSettingsToEnv(
  settings: AccountSettingsBody,
): void {
  process.env.ZIPWIKI_PARSE_CREDENTIAL = settings.parseCredential;
  process.env.ZIPWIKI_OKF_CREDENTIAL =
    settings.okfCredential === "local" ? "local" : settings.okfCredential;
}

export function warnMissingByoSecrets(settings: AccountSettingsBody): void {
  if (
    settings.parseCredential === "llama" &&
    !isSecretEnvConfigured("LLAMA_CLOUD_API_KEY")
  ) {
    console.error(
      "[zipwiki] Account prefers Llama BYO — set key:\n" +
        "  zipwiki config api-key llama <LLAMA_CLOUD_API_KEY>",
    );
  }
  if (
    settings.okfCredential === "anthropic" &&
    !isSecretEnvConfigured("ANTHROPIC_API_KEY")
  ) {
    console.error(
      "[zipwiki] Account prefers Anthropic BYO — set key:\n" +
        "  zipwiki config api-key anthropic <ANTHROPIC_API_KEY>",
    );
  }
}

/** Pull settings from API and cache. Throws on auth/network errors. */
export async function pullAccountSettings(opts?: {
  quiet?: boolean;
}): Promise<AccountSettingsResponse> {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) {
    throw new Error("Not connected — run: zipwiki auth login");
  }
  const payload = await fetchAccountSettings(url, key);
  const path = saveCachedAccountSettings(payload);
  if (!opts?.quiet) {
    console.error(`[zipwiki] settings synced → ${path}`);
  }
  applyAccountSettingsToEnv(payload.settings);
  warnMissingByoSecrets(payload.settings);
  return payload;
}

/** True when both API URL and API key are configured (post `auth login`). */
export function isZipwikiAccountConnected(): boolean {
  return Boolean(resolveZipwikiApiUrl() && resolveZipwikiApiKey());
}

function offlineLocalSettingsResponse(): AccountSettingsResponse {
  return {
    settings: structuredClone(DEFAULT_ACCOUNT_SETTINGS),
    setupComplete: true,
    setupCompletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    setupUrl: null,
  };
}

/**
 * Account required for hosted parse/OKF, dashboard settings, and account sync.
 * Local LiteParse pack (no AI OKF) works without login.
 */
export function requireAccountConnected(opts?: {
  /** Short reason shown before the login hint. */
  forFeature?: string;
}): void {
  if (isZipwikiAccountConnected()) return;
  const reason = opts?.forFeature?.trim();
  throw new Error(
    (reason ? `${reason}\n` : "") +
      "ZipWiki account required (verified email via login). Run: zipwiki auth login\n" +
      "Local pack with LiteParse and --no-ai-okf works without an account.",
  );
}

/**
 * Hosted ZipWiki parse/OKF need a logged-in account (API key from device login).
 * BYO Llama/Anthropic keys are machine-local and do not require ZipWiki login.
 */
export function requireAccountForHostedCredential(input: {
  parseCredential?: string;
  okfCredential?: string;
  remoteParse?: boolean;
  remoteOkf?: boolean;
}): void {
  const wantsHostedParse =
    input.remoteParse === true || input.parseCredential === "zipwiki";
  const wantsHostedOkf =
    input.remoteOkf === true || input.okfCredential === "zipwiki";
  if (!wantsHostedParse && !wantsHostedOkf) return;
  requireAccountConnected({
    forFeature: wantsHostedParse
      ? "Hosted ZipWiki parse requires a logged-in account."
      : "Hosted ZipWiki OKF requires a logged-in account.",
  });
}

export function requireSetupComplete(
  cached?: CachedAccountSettings | null,
): void {
  const c = cached ?? loadCachedAccountSettings();
  if (c && !c.setupComplete) {
    const url =
      c.setupUrl ?? "Open Settings in the dashboard after zipwiki auth login.";
    throw new Error(
      `Finish account setup in the browser, then: zipwiki settings pull\n  ${url}`,
    );
  }
  if (!c) {
    throw new Error(
      "No account settings cache — run: zipwiki auth login  or  zipwiki settings pull",
    );
  }
}

/**
 * Sync account settings before pack/stage.
 * No login → local LiteParse defaults (pack still works).
 * Logged in → live API; on network failure falls back to cache, then defaults.
 */
export async function syncAccountSettingsForPack(opts?: {
  quiet?: boolean;
}): Promise<AccountSettingsResponse> {
  if (!isZipwikiAccountConnected()) {
    if (!opts?.quiet) {
      console.error(
        "[zipwiki] No ZipWiki account — dashboard parser settings are not loaded.\n" +
          "  Hosted parse/OKF and website settings: zipwiki auth login",
      );
    }
    return offlineLocalSettingsResponse();
  }

  try {
    const payload = await pullAccountSettings({ quiet: opts?.quiet });
    if (!payload.setupComplete) {
      const url =
        payload.setupUrl ??
        "Finish Settings in the dashboard (same account as this API key).";
      throw new Error(
        `Account setup incomplete. Complete the settings wizard, then retry.\n  ${url}`,
      );
    }
    return payload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Incomplete setup from a successful pull should still hard-fail.
    if (/Account setup incomplete/i.test(msg)) throw err;

    const cached = loadCachedAccountSettings();
    if (cached?.setupComplete) {
      if (!opts?.quiet) {
        console.error(
          `[zipwiki] settings sync failed (${msg}); using cached settings`,
        );
      }
      applyAccountSettingsToEnv(cached.settings);
      warnMissingByoSecrets(cached.settings);
      return {
        settings: cached.settings,
        setupComplete: cached.setupComplete,
        setupCompletedAt: cached.setupCompletedAt,
        updatedAt: cached.updatedAt,
        setupUrl: cached.setupUrl ?? null,
      };
    }

    if (!opts?.quiet) {
      console.error(
        `[zipwiki] settings sync failed (${msg}); packing with local defaults (LiteParse). Run: pnpm zipwiki -- settings pull`,
      );
    }
    const fallback = offlineLocalSettingsResponse();
    applyAccountSettingsToEnv(fallback.settings);
    return fallback;
  }
}
