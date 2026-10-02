import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as p from "@clack/prompts";
import {
  fetchAccountSettings,
  fetchClientConfig,
  requestDeviceCode,
  waitForDeviceApproval,
  waitForSetupComplete,
  type ClientConfig,
} from "@zipwiki/api-client";
import {
  activateCliAccount,
  rememberCliAccount,
  seedCliAccountsFromEnv,
  type SavedCliAccount,
} from "./lib/config/accounts.js";
import {
  dashboardSettingsUrl,
  deviceApprovalPage,
  formatZipwikiApiTarget,
  loginApiUrlForTarget,
  resolveAuthLoginTarget,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
  saveZipwikiHomeEnv,
  zipwikiApiUrlForTarget,
  zipwikiDeviceAuthUrl,
  zipwikiHomeEnvPath,
} from "./lib/config/index.js";
import { isInteractiveTty } from "./interactive/tty.js";
import {
  applyAccountSettingsToEnv,
  saveCachedAccountSettings,
  warnMissingByoSecrets,
} from "./lib/config/account-settings-cache.js";
import { maybeMigrateLocalOnboarding } from "./lib/config/migrate-onboarding.js";

const execFileAsync = promisify(execFile);

async function openBrowser(url: string): Promise<void> {
  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
    } else if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url]);
    } else {
      await execFileAsync("xdg-open", [url]);
    }
  } catch {
    console.error(`[zipwiki] Open this URL in a browser:\n  ${url}`);
  }
}

function applyConnectionToProcess(url: string, key: string): void {
  process.env.ZIPWIKI_API_URL = url;
  process.env.ZIPWIKI_API_KEY = key;
}

type LoginAccountChoice =
  | { action: "keep" }
  | { action: "activate"; email: string }
  | { action: "browser" }
  | { action: "cancel" };

const OTHER_ACCOUNT = "__other__";

/**
 * Map a picker selection to a login action.
 * When `forceRefresh` is set (rejected API key), selecting the active account
 * starts a browser login instead of keeping the rejected key.
 */
export function resolveCliLoginAccountChoice(input: {
  selected: string;
  active?: string | null;
  forceRefresh?: boolean;
}): LoginAccountChoice {
  const active = input.active?.trim().toLowerCase() || undefined;
  const selected = input.selected.trim().toLowerCase();
  if (selected === OTHER_ACCOUNT) return { action: "browser" };
  if (active && selected === active) {
    return input.forceRefresh ? { action: "browser" } : { action: "keep" };
  }
  return { action: "activate", email: selected };
}

/** When this CLI already has a saved login, ask which email to use. */
export async function chooseCliLoginAccount(opts?: {
  /** Rejected API key — picking the current account must re-auth, not keep. */
  forceRefresh?: boolean;
}): Promise<LoginAccountChoice> {
  const accounts = seedCliAccountsFromEnv();
  if (!isInteractiveTty() || accounts.length === 0) {
    return { action: "browser" };
  }
  const active = process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim().toLowerCase();
  const forceRefresh = opts?.forceRefresh === true;
  const choice = await p.select({
    message: forceRefresh
      ? "Your API key was rejected. Which account should this CLI re-authenticate?"
      : active
        ? `This CLI is signed in as ${active}. Which account should it use?`
        : "Which account should this CLI use?",
    options: [
      ...accounts.map((account) => ({
        value: account.email,
        label:
          account.email === active
            ? forceRefresh
              ? `${account.email} (get a new API key)`
              : `${account.email} (signed in)`
            : account.email,
      })),
      {
        value: OTHER_ACCOUNT,
        label: "Sign in as a different user",
      },
    ],
  });
  if (p.isCancel(choice)) return { action: "cancel" };
  return resolveCliLoginAccountChoice({
    selected: String(choice),
    active,
    forceRefresh,
  });
}

function printActiveAccount(account: SavedCliAccount): void {
  console.error(`[zipwiki] This CLI is signed in as ${account.email}`);
  console.error(`[zipwiki] Saved in ${zipwikiHomeEnvPath()}`);
}

export async function runAuthLogin(opts: {
  env?: string;
  noBrowser?: boolean;
  /**
   * When true (unauthorized API key), selecting the current account starts a
   * fresh browser login for a new key instead of keeping the rejected one.
   */
  forceRefresh?: boolean;
}): Promise<void> {
  const choice = await chooseCliLoginAccount({
    forceRefresh: opts.forceRefresh === true,
  });
  if (choice.action === "cancel") {
    console.error("[zipwiki] Login cancelled.");
    process.exitCode = 1;
    return;
  }
  if (choice.action === "keep") {
    const current = seedCliAccountsFromEnv().find(
      (account) =>
        account.email ===
        process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim().toLowerCase(),
    );
    if (current) printActiveAccount(current);
    return;
  }
  if (choice.action === "activate") {
    printActiveAccount(activateCliAccount(choice.email));
    return;
  }

  const target = resolveAuthLoginTarget(opts.env);
  const apiUrl = zipwikiApiUrlForTarget(target);
  const deviceAuthUrl = zipwikiDeviceAuthUrl(target);

  console.error(`[zipwiki] Logging in to ${formatZipwikiApiTarget(apiUrl)}…`);
  console.error(
    "[zipwiki] Approve in the browser as the account this CLI should use. On that page, choose Log in as a different user to switch.",
  );

  const device = await requestDeviceCode(deviceAuthUrl);
  const openUrl = deviceApprovalPage({
    verificationUri: device.verification_uri,
    verificationUriComplete: device.verification_uri_complete,
    userCode: device.user_code,
  });

  console.error("");
  console.error(`  User code:  ${device.user_code}`);
  console.error(`  Open:       ${openUrl}`);
  console.error("");
  console.error("Waiting for browser approval…");

  if (!opts.noBrowser) {
    await openBrowser(openUrl);
  }

  const approved = await waitForDeviceApproval(deviceAuthUrl, device.device_code, {
    intervalSec: device.interval,
    expiresInSec: device.expires_in,
  });

  const url = loginApiUrlForTarget(approved.api_url, target);
  const accountId = approved.account_id.trim();
  let email = approved.email?.trim().toLowerCase();
  if (!email) {
    try {
      const settings = await fetchAccountSettings(deviceAuthUrl, approved.api_key);
      email = settings.email?.trim().toLowerCase();
    } catch {
      try {
        const settings = await fetchAccountSettings(url, approved.api_key);
        email = settings.email?.trim().toLowerCase();
      } catch {
        email = undefined;
      }
    }
  }
  const path = saveZipwikiHomeEnv({
    ZIPWIKI_API_URL: url,
    ZIPWIKI_API_KEY: approved.api_key,
    ZIPWIKI_ACCOUNT_ID: accountId,
    ...(email ? { ZIPWIKI_ACCOUNT_EMAIL: email } : {}),
  });
  applyConnectionToProcess(url, approved.api_key);
  process.env.ZIPWIKI_ACCOUNT_ID = accountId;
  if (email) {
    process.env.ZIPWIKI_ACCOUNT_EMAIL = email;
    rememberCliAccount({
      email,
      accountId,
      apiUrl: url,
      apiKey: approved.api_key,
    });
  }

  console.error(`[zipwiki] Saved connection to ${path}`);
  if (email) {
    console.error(`[zipwiki] Account email ${email}`);
  } else {
    console.error(
      "[zipwiki] Login did not return an account email. Run: zipwiki login",
    );
  }
  console.error(`[zipwiki] Key prefix ${approved.key_prefix}…`);

  await maybeMigrateLocalOnboarding({ url, apiKey: approved.api_key });

  console.error(
    "[zipwiki] Waiting for account setup in the browser (Settings wizard)…",
  );
  const dash = dashboardSettingsUrl({ apiUrl: url });
  console.error(`[zipwiki] Dashboard: ${dash}`);
  if (!opts.noBrowser) {
    void openBrowser(dash);
  }

  let printedSetupUrl = false;
  let settingsSynced = false;
  try {
    // Prefer Convex for settings — Fly often 404s when CONVEX_SITE_URL is wrong.
    const settings = await waitForSetupComplete(deviceAuthUrl, approved.api_key, {
      fallbackBaseUrls: [url],
      timeoutMs: 45_000,
      intervalMs: 2000,
      onPending: (setupUrl) => {
        if (!printedSetupUrl && setupUrl) {
          printedSetupUrl = true;
          console.error(`[zipwiki] Finish setup: ${setupUrl}`);
        }
      },
      onError: (message) => {
        console.error(`[zipwiki] settings check: ${message}`);
      },
    });
    saveCachedAccountSettings(settings);
    applyAccountSettingsToEnv(settings.settings);
    warnMissingByoSecrets(settings.settings);
    settingsSynced = true;
    console.error(
      `[zipwiki] Settings pulled automatically: parse=${settings.settings.parseCredential} okf=${settings.settings.okfCredential} useAi=${settings.settings.okf.useAi ?? "—"}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] Setup wait: ${msg}`);
  }

  if (!settingsSynced) {
    try {
      const settings = await fetchAccountSettings(deviceAuthUrl, approved.api_key);
      saveCachedAccountSettings(settings);
      applyAccountSettingsToEnv(settings.settings);
      warnMissingByoSecrets(settings.settings);
      settingsSynced = true;
      console.error(
        `[zipwiki] Settings pulled automatically: parse=${settings.settings.parseCredential} okf=${settings.settings.okfCredential} useAi=${settings.settings.okf.useAi ?? "—"}`,
      );
      if (!settings.setupComplete) {
        console.error(
          `[zipwiki] Setup still incomplete${settings.setupUrl ? `: ${settings.setupUrl}` : " — open dashboard Settings"}`,
        );
      }
    } catch {
      try {
        const settings = await fetchAccountSettings(url, approved.api_key);
        saveCachedAccountSettings(settings);
        applyAccountSettingsToEnv(settings.settings);
        warnMissingByoSecrets(settings.settings);
        settingsSynced = true;
        console.error(
          `[zipwiki] Settings pulled automatically: parse=${settings.settings.parseCredential} okf=${settings.settings.okfCredential} useAi=${settings.settings.okf.useAi ?? "—"}`,
        );
      } catch (err2) {
        const msg = err2 instanceof Error ? err2.message : String(err2);
        console.error(`[zipwiki] Login saved. Settings not synced yet: ${msg}`);
        console.error(`  1. Save Settings in the dashboard (if prompted)`);
        console.error(`  2. pnpm zipwiki -- settings pull`);
      }
    }
  }

  if (!settingsSynced) {
    // Key is already in ~/.zipwiki/.env — login succeeded.
    return;
  }

  try {
    const cfg = await fetchClientConfig(deviceAuthUrl, approved.api_key, {
      bypassCache: true,
    });
    printClientConfigSummary(cfg);
  } catch {
    try {
      const cfg = await fetchClientConfig(url, approved.api_key, {
        bypassCache: true,
      });
      printClientConfigSummary(cfg);
    } catch (err2) {
      const msg = err2 instanceof Error ? err2.message : String(err2);
      console.error(`[zipwiki] Connected, but client-config failed: ${msg}`);
    }
  }
}

export async function runAuthStatus(): Promise<void> {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  const accountId = process.env.ZIPWIKI_ACCOUNT_ID?.trim();
  const email = process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim();
  const saved = seedCliAccountsFromEnv();
  const active = email?.toLowerCase();
  console.error(`Home env:  ${zipwikiHomeEnvPath()}`);
  console.error(`API URL:   ${formatZipwikiApiTarget(url)}`);
  console.error(
    `API key:   ${key ? `${key.slice(0, 12)}…` : "(unset)"}`,
  );
  console.error(`Account:   ${accountId || "(unset)"}`);
  console.error(`Email:     ${email || "(unset)"}`);
  if (saved.length > 0) {
    console.error(
      `Saved:     ${saved
        .map((account) =>
          account.email === active ? `${account.email} (this CLI)` : account.email,
        )
        .join(", ")}`,
    );
  }
  if (!url || !key) {
    console.error("Not fully connected. Run: zipwiki login");
    return;
  }
  try {
    const cfg = await fetchClientConfig(url, key);
    printClientConfigSummary(cfg);
    if (cfg.setupComplete === false) {
      console.error(
        `[zipwiki] Setup incomplete${cfg.setupUrl ? `: ${cfg.setupUrl}` : ""}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] client-config error: ${msg}`);
  }
}

function printClientConfigSummary(cfg: ClientConfig): void {
  const liteOk = cfg.usage?.liteparseSuccessCount ?? 0;
  const liteFail = cfg.usage?.liteparseFailCount ?? 0;
  const fmtMax = (n: number) =>
    n >= Number.MAX_SAFE_INTEGER ? "no limit" : String(n);
  console.error(
    `[zipwiki] Credits ${cfg.creditsUnlimited || cfg.plan.slug === "unlimited" ? "unlimited" : (cfg.creditsRemaining ?? cfg.plan.maxParsesPerMonth)}: LiteParse ${liteOk} ok / ${liteFail} fail, ` +
      `LlamaParse ${cfg.usage?.parseCount ?? "?"}/${fmtMax(cfg.plan.maxParsesPerMonth)}, ` +
      `OKF ${cfg.usage?.okfCount ?? "?"}/${fmtMax(cfg.plan.maxOkfPerMonth)}`,
  );
  if (cfg.plan.maxPagesPerDocument != null) {
    console.error(
      `[zipwiki] Max pages/document: ${cfg.plan.maxPagesPerDocument}`,
    );
  }
  console.error(
    `[zipwiki] Defaults: parse ${cfg.parse.defaults.engine}/${cfg.parse.defaults.mode}, okf ${cfg.okf.provider}/${cfg.okf.model}`,
  );
}
