import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  fetchAccountSettings,
  fetchClientConfig,
  formatCliEnv,
  parseCliEnv,
  parseCliEnvJson,
  requestDeviceCode,
  waitForDeviceApproval,
  waitForSetupComplete,
  type ClientConfig,
} from "@zipwiki/api-client";
import {
  formatZipwikiApiTarget,
  resolveAuthLoginTarget,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
  saveZipwikiHomeEnv,
  zipwikiApiUrlForTarget,
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

  console.error(`[zipwiki] Logging in to ${formatZipwikiApiTarget(apiUrl)}…`);

  const device = await requestDeviceCode(apiUrl);
  const openUrl =
    device.verification_uri_complete ??
    `${device.verification_uri}?user_code=${encodeURIComponent(device.user_code)}`;

  console.error("");
  console.error(`  User code:  ${device.user_code}`);
  console.error(`  Open:       ${openUrl}`);
  console.error("");
  console.error("Waiting for browser approval…");

  if (!opts.noBrowser) {
    await openBrowser(openUrl);
  }

  const approved = await waitForDeviceApproval(apiUrl, device.device_code, {
    intervalSec: device.interval,
    expiresInSec: device.expires_in,
  });

  const url = (approved.api_url || apiUrl).replace(/\/+$/, "");
  const path = saveZipwikiHomeEnv({
    ZIPWIKI_API_URL: url,
    ZIPWIKI_API_KEY: approved.api_key,
  });
  applyConnectionToProcess(url, approved.api_key);

  console.error(`[zipwiki] Saved connection to ${path}`);
  console.error(`[zipwiki] Key prefix ${approved.key_prefix}…`);

  await maybeMigrateLocalOnboarding({ url, apiKey: approved.api_key });

  console.error(
    "[zipwiki] Waiting for account setup in the browser (Settings wizard)…",
  );
  let printedSetupUrl = false;
  const settings = await waitForSetupComplete(url, approved.api_key, {
    onPending: (setupUrl) => {
      if (!printedSetupUrl && setupUrl) {
        printedSetupUrl = true;
        console.error(`[zipwiki] Finish setup: ${setupUrl}`);
        if (!opts.noBrowser) {
          void openBrowser(setupUrl);
        }
      }
    },
  });
  saveCachedAccountSettings(settings);
  applyAccountSettingsToEnv(settings.settings);
  warnMissingByoSecrets(settings.settings);
  console.error("[zipwiki] Account setup complete — settings cached.");

  try {
    const cfg = await fetchClientConfig(url, approved.api_key, {
      bypassCache: true,
    });
    printClientConfigSummary(cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] Connected, but client-config failed: ${msg}`);
  }
}

export async function runAuthImport(filePath: string): Promise<void> {
  const raw =
    filePath === "-"
      ? await readStdin()
      : readFileSync(resolve(filePath), "utf-8");

  let conn;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    conn = parseCliEnvJson(JSON.parse(trimmed) as unknown);
  } else {
    conn = parseCliEnv(raw);
  }

  const path = saveZipwikiHomeEnv({
    ZIPWIKI_API_URL: conn.ZIPWIKI_API_URL,
    ZIPWIKI_API_KEY: conn.ZIPWIKI_API_KEY,
  });
  applyConnectionToProcess(conn.ZIPWIKI_API_URL, conn.ZIPWIKI_API_KEY);

  console.error(`[zipwiki] Imported connection into ${path}`);

  try {
    const settings = await fetchAccountSettings(
      conn.ZIPWIKI_API_URL,
      conn.ZIPWIKI_API_KEY,
    );
    saveCachedAccountSettings(settings);
    applyAccountSettingsToEnv(settings.settings);
    warnMissingByoSecrets(settings.settings);
    if (!settings.setupComplete) {
      console.error(
        `[zipwiki] Setup incomplete${settings.setupUrl ? `: ${settings.setupUrl}` : " — open dashboard Settings"}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] Settings sync: ${msg}`);
  }

  await maybeMigrateLocalOnboarding({
    url: conn.ZIPWIKI_API_URL,
    apiKey: conn.ZIPWIKI_API_KEY,
  });

  try {
    const cfg = await fetchClientConfig(
      conn.ZIPWIKI_API_URL,
      conn.ZIPWIKI_API_KEY,
      { bypassCache: true },
    );
    printClientConfigSummary(cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zipwiki] Imported, but client-config failed: ${msg}`);
  }
}

export async function runAuthStatus(): Promise<void> {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  console.error(`Home env:  ${zipwikiHomeEnvPath()}`);
  console.error(`API URL:   ${formatZipwikiApiTarget(url)}`);
  console.error(
    `API key:   ${key ? `${key.slice(0, 12)}…` : "(unset)"}`,
  );
  if (!url || !key) {
    console.error("Not fully connected. Run: zipwiki auth login");
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

export function runAuthExportEnv(): void {
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) {
    throw new Error("No connection — run zipwiki auth login first");
  }
  process.stdout.write(
    formatCliEnv({ ZIPWIKI_API_URL: url, ZIPWIKI_API_KEY: key }),
  );
}

function printClientConfigSummary(cfg: ClientConfig): void {
  const liteOk = cfg.usage?.liteparseSuccessCount ?? 0;
  const liteFail = cfg.usage?.liteparseFailCount ?? 0;
  const fmtMax = (n: number) =>
    n >= Number.MAX_SAFE_INTEGER ? "no limit" : String(n);
  console.error(
    `[zipwiki] Plan ${cfg.plan.slug}: LiteParse ${liteOk} ok / ${liteFail} fail, ` +
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

function readStdin(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c) => chunks.push(Buffer.from(c)));
    process.stdin.on("end", () =>
      resolvePromise(Buffer.concat(chunks).toString("utf-8")),
    );
    process.stdin.on("error", reject);
  });
}
