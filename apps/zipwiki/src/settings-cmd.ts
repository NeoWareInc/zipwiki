import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ZipwikiApiError, type AccountSettingsBody } from "@zipwiki/api-client";
import {
  applyAccountSettingsToEnv,
  loadCachedAccountSettings,
  pullAccountSettings,
  requireAccountConnected,
  zipwikiSettingsCachePath,
} from "./lib/config/account-settings-cache.js";
import {
  dashboardSettingsUrl,
  resolveZipwikiApiUrl,
  formatZipwikiApiTarget,
} from "./lib/config/index.js";
import {
  isUnauthorizedApiError,
  promptAndRunLogin,
} from "./interactive/resume-login.js";
import { isInteractiveTty } from "./interactive/tty.js";

const execFileAsync = promisify(execFile);

function settingsPageUrl(): string {
  const cached = loadCachedAccountSettings();
  return dashboardSettingsUrl({
    apiUrl: resolveZipwikiApiUrl(),
    setupUrl: cached?.setupUrl,
  });
}

async function recoverFromSettingsAuthFailure(err: unknown): Promise<never> {
  const status =
    err instanceof ZipwikiApiError ? err.status : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  console.error("");
  console.error("[zipwiki] Could not load account settings from the API.");
  if (isUnauthorizedApiError(err)) {
    console.error(
      "  Your API key was rejected (revoked, expired, or wrong).",
    );
  } else if (status === 404) {
    console.error(
      "  The API host returned 404 for /api/settings (wrong URL or Fly not deployed).",
    );
    console.error(
      "  After fixing Fly secrets, you can also pull via Convex device-auth host.",
    );
  } else {
    console.error(`  ${msg}`);
  }
  console.error("");
  console.error("  Needed: zipwiki auth login");
  console.error(
    "  (login pulls Settings automatically — no separate settings pull)",
  );
  console.error("");
  process.exit(1);
}

export async function runSettingsShow(opts?: {
  format?: "text" | "json";
}): Promise<void> {
  requireAccountConnected();
  let cached = loadCachedAccountSettings();
  if (!cached) {
    try {
      await pullAccountSettings({ quiet: true });
      cached = loadCachedAccountSettings();
    } catch (err) {
      if (isUnauthorizedApiError(err) && isInteractiveTty()) {
        await promptAndRunLogin({ reason: "unauthorized" });
        await pullAccountSettings({ quiet: true });
        cached = loadCachedAccountSettings();
      } else {
        await recoverFromSettingsAuthFailure(err);
      }
    }
  }
  if (!cached) {
    console.error(
      "[zipwiki] No settings cache yet. Run: zipwiki auth login",
    );
    process.exit(1);
  }
  applyAccountSettingsToEnv(cached.settings);

  if (opts?.format === "json") {
    process.stdout.write(
      `${JSON.stringify(redactSettings(cached.settings), null, 2)}\n`,
    );
    return;
  }

  const s = cached.settings;
  console.error(
    `API:            ${formatZipwikiApiTarget(resolveZipwikiApiUrl())}`,
  );
  console.error(`Cache:          ${zipwikiSettingsCachePath()}`);
  console.error(`Setup complete: ${cached.setupComplete}`);
  console.error(`Updated:        ${cached.updatedAt ?? "—"}`);
  console.error(`Parse source:   ${s.parseCredential}`);
  console.error(`OKF source:     ${s.okfCredential}`);
  console.error(
    `Parser:         ${s.parser.engine ?? "—"} / ${s.parser.mode ?? "—"}`,
  );
  console.error(
    `OKF:            useAi=${s.okf.useAi ?? "—"} ${s.okf.provider ?? ""}/${s.okf.model ?? ""}`,
  );
  console.error(
    `Pack:           ${s.pack.compression ?? "—"} level=${s.pack.level ?? "—"} omitOriginals=${s.pack.omitOriginalDocuments ?? "—"} recurse=${s.pack.recurse ?? "—"}`,
  );
}

export async function runSettingsPull(): Promise<void> {
  requireAccountConnected();
  try {
    const payload = await pullAccountSettings();
    console.error(
      `[zipwiki] setupComplete=${payload.setupComplete} parse=${payload.settings.parseCredential} okf=${payload.settings.okfCredential}`,
    );
  } catch (err) {
    if (isUnauthorizedApiError(err) && isInteractiveTty()) {
      await promptAndRunLogin({ reason: "unauthorized" });
      const payload = await pullAccountSettings();
      console.error(
        `[zipwiki] setupComplete=${payload.setupComplete} parse=${payload.settings.parseCredential} okf=${payload.settings.okfCredential}`,
      );
      return;
    }
    await recoverFromSettingsAuthFailure(err);
  }
}

export async function runSettingsOpen(opts?: {
  noBrowser?: boolean;
}): Promise<void> {
  requireAccountConnected();
  const url = settingsPageUrl();
  console.error(`[zipwiki] Settings: ${url}`);
  if (opts?.noBrowser) return;
  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
    } else if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url]);
    } else {
      await execFileAsync("xdg-open", [url]);
    }
  } catch {
    /* printed URL above */
  }
}

function redactSettings(settings: AccountSettingsBody): AccountSettingsBody {
  return structuredClone(settings);
}
