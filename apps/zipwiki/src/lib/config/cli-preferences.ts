/**
 * Local CLI preferences under ~/.zipwiki (not synced to the account).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { zipwikiHomeDir } from "./home.js";

export const CLI_PREFERENCES_FILENAME = "cli-preferences.json";

export type CliPreferences = {
  /** When true, do not prompt when LibreOffice is missing for Office parses. */
  ignoreLibreOfficeMissing?: boolean;
};

export function zipwikiCliPreferencesPath(homeDir = zipwikiHomeDir()): string {
  return join(homeDir, CLI_PREFERENCES_FILENAME);
}

export function loadCliPreferences(homeDir = zipwikiHomeDir()): CliPreferences {
  const path = zipwikiCliPreferencesPath(homeDir);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const o = raw as Record<string, unknown>;
    return {
      ...(o.ignoreLibreOfficeMissing === true
        ? { ignoreLibreOfficeMissing: true }
        : {}),
    };
  } catch {
    return {};
  }
}

export function saveCliPreferences(
  patch: CliPreferences,
  homeDir = zipwikiHomeDir(),
): CliPreferences {
  const next = { ...loadCliPreferences(homeDir), ...patch };
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(
    zipwikiCliPreferencesPath(homeDir),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  return next;
}

export function isLibreOfficeMissingIgnored(
  homeDir = zipwikiHomeDir(),
): boolean {
  return loadCliPreferences(homeDir).ignoreLibreOfficeMissing === true;
}

export function setIgnoreLibreOfficeMissing(
  ignore: boolean,
  homeDir = zipwikiHomeDir(),
): void {
  saveCliPreferences({ ignoreLibreOfficeMissing: ignore }, homeDir);
}
