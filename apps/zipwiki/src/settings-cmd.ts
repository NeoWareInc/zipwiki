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

const execFileAsync = promisify(execFile);

function settingsPageUrl(): string {
  const cached = loadCachedAccountSettings();
  return dashboardSettingsUrl({
    apiUrl: resolveZipwikiApiUrl(),
    setupUrl: cached?.setupUrl,
  });
}

function printAuthHint(err: unknown): never {
  const status =
    err instanceof ZipwikiApiError ? err.status : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  console.error("");
  console.error("[zipwiki] Could not load account settings from the API.");
  if (status === 401 || status === 403 || /unauthorized/i.test(msg)) {
    console.error(
      "  Your API key was rejected (revoked or wrong). Get a new one:",
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
  console.error("  pnpm zipwiki -- auth login");
  console.error("  pnpm zipwiki -- settings pull");
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
      printAuthHint(err);
    }
  }
  if (!cached) {
    console.error(
      "[zipwiki] No settings cache yet. Run: pnpm zipwiki -- auth login",
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
    printAuthHint(err);
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
