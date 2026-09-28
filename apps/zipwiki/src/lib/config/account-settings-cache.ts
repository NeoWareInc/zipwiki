import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AccountSettingsBodySchema,
  DEFAULT_ACCOUNT_SETTINGS,
  ZipwikiApiError,
  fetchAccountSettings,
  type AccountSettingsBody,
  type AccountSettingsResponse,
} from "@zipwiki/api-client";
import {
  resolveZipwikiApiKey,
  resolveZipwikiApiTarget,
  resolveZipwikiApiUrl,
  zipwikiDeviceAuthUrl,
} from "./api.js";
import { saveZipwikiHomeEnv, zipwikiHomeDir } from "./home.js";
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
  opts?: { persist?: boolean },
): void {
  process.env.ZIPWIKI_PARSE_CREDENTIAL = settings.parseCredential;
  process.env.ZIPWIKI_OKF_CREDENTIAL =
    settings.okfCredential === "local" ? "local" : settings.okfCredential;
  if (opts?.persist !== false) {
    // Portal settings must survive the next CLI process — not only this one.
    saveZipwikiHomeEnv({
      ZIPWIKI_PARSE_CREDENTIAL: settings.parseCredential,
      ZIPWIKI_OKF_CREDENTIAL:
        settings.okfCredential === "local" ? "local" : settings.okfCredential,
    });
  }
}

/**
 * Load the last pulled portal settings into process.env (and home .env).
 * Call before config show / pack so signed-in defaults match the dashboard.
 */
export function applyCachedAccountSettingsToEnv(opts?: {
  persist?: boolean;
}): AccountSettingsBody | null {
  const cached = loadCachedAccountSettings();
  if (!cached?.setupComplete) return null;
  applyAccountSettingsToEnv(cached.settings, { persist: opts?.persist });
  return cached.settings;
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

/** The API key belongs to a different account than the one saved at login. */
export class AccountMismatchError extends Error {
  constructor(savedEmail?: string) {
    const who = savedEmail?.trim();
    super(
      `This API key belongs to a different ZipWiki account than this CLI login${who ? ` (${who})` : ""}.\nRun: zipwiki login`,
    );
    this.name = "AccountMismatchError";
  }
}

/**
 * True when a saved account id and a returned account id are both set and differ.
 * A missing stamp is not a conflict; the caller may record the returned id.
 */
export function accountStampConflicts(
  savedAccountId: string | undefined,
  returnedAccountId: string | undefined,
): boolean {
  const saved = savedAccountId?.trim();
  const got = returnedAccountId?.trim();
  return Boolean(saved && got && saved !== got);
}

function enforceAccountStamp(payload: AccountSettingsResponse): void {
  const saved = process.env.ZIPWIKI_ACCOUNT_ID?.trim();
  const got = payload.accountId?.trim();
  if (accountStampConflicts(saved, got)) {
    throw new AccountMismatchError(process.env.ZIPWIKI_ACCOUNT_EMAIL);
  }
  if (!saved && got) {
    saveZipwikiHomeEnv({ ZIPWIKI_ACCOUNT_ID: got });
    process.env.ZIPWIKI_ACCOUNT_ID = got;
  }
}

/** Pull settings from API and cache. Throws on auth/network errors. */
export async function pullAccountSettings(opts?: {
  quiet?: boolean;
}): Promise<AccountSettingsResponse> {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) {
    throw new Error("Not connected — run: zipwiki login");
  }

  let payload: AccountSettingsResponse;
  try {
    payload = await fetchAccountSettings(url, key);
  } catch (err) {
    // Fly often returns 404+unauthorized when CONVEX_SITE_URL is wrong.
    // Fall back to the Convex HTTP host used for device login.
    const target = resolveZipwikiApiTarget(url) ?? "dev";
    const convexSite = zipwikiDeviceAuthUrl(target);
    if (
      err instanceof ZipwikiApiError &&
      (err.status === 404 || err.status === 401 || err.status === 502) &&
      convexSite.replace(/\/+$/, "") !== url.replace(/\/+$/, "")
    ) {
      if (!opts?.quiet) {
        console.error(
          `[zipwiki] ${url} failed (${err.message}); trying ${convexSite}…`,
        );
      }
      payload = await fetchAccountSettings(convexSite, key);
    } else {
      throw err;
    }
  }

  enforceAccountStamp(payload);
  const path = saveCachedAccountSettings(payload);
  if (!opts?.quiet) {
    console.error(`[zipwiki] settings synced → ${path}`);
  }
  applyAccountSettingsToEnv(payload.settings);
  warnMissingByoSecrets(payload.settings);
  return payload;
}

/** True when both API URL and API key are configured (post `zipwiki login`). */
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
      "ZipWiki account required (verified email via login). Run: zipwiki login\n" +
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
      c.setupUrl ?? "Open Settings in the dashboard after zipwiki login.";
    throw new Error(
      `Finish account setup in the browser, then: zipwiki settings pull\n  ${url}`,
    );
  }
  if (!c) {
    throw new Error(
      "No account settings cache — run: zipwiki login  or  zipwiki settings pull",
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
        "[zipwiki] CLI is not signed in, so portal parser and OKF settings were not loaded.\n" +
          "  Run: zipwiki login",
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
    // Incomplete setup and a different account must not fall back to cache.
    if (err instanceof AccountMismatchError) throw err;
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
