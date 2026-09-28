import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  fetchAccountSettings,
  fetchClientConfig,
  requestDeviceCode,
  waitForDeviceApproval,
  waitForSetupComplete,
  type ClientConfig,
} from "@zipwiki/api-client";
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

export async function runAuthLogin(opts: {
  env?: string;
  noBrowser?: boolean;
}): Promise<void> {
  const target = resolveAuthLoginTarget(opts.env);
  const apiUrl = zipwikiApiUrlForTarget(target);
  const deviceAuthUrl = zipwikiDeviceAuthUrl(target);

  console.error(`[zipwiki] Logging in to ${formatZipwikiApiTarget(apiUrl)}…`);

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
  const path = saveZipwikiHomeEnv({
    ZIPWIKI_API_URL: url,
    ZIPWIKI_API_KEY: approved.api_key,
    ZIPWIKI_ACCOUNT_ID: accountId,
    ...(approved.email ? { ZIPWIKI_ACCOUNT_EMAIL: approved.email } : {}),
  });
  applyConnectionToProcess(url, approved.api_key);
  process.env.ZIPWIKI_ACCOUNT_ID = accountId;
  if (approved.email) process.env.ZIPWIKI_ACCOUNT_EMAIL = approved.email;

  console.error(`[zipwiki] Saved connection to ${path}`);
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
  console.error(`Home env:  ${zipwikiHomeEnvPath()}`);
  console.error(`API URL:   ${formatZipwikiApiTarget(url)}`);
  console.error(
    `API key:   ${key ? `${key.slice(0, 12)}…` : "(unset)"}`,
  );
  console.error(`Account:   ${accountId || "(unset)"}`);
  console.error(`Email:     ${email || "(unset)"}`);
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
