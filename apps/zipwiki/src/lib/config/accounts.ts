import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { discardCachedAccountSettings } from "./account-settings-cache.js";
import { saveZipwikiHomeEnv, zipwikiHomeDir } from "./home.js";

/** One browser login this CLI can switch back to. The API key stays on disk. */
export type SavedCliAccount = {
  email: string;
  accountId?: string;
  apiUrl: string;
  apiKey: string;
};

type AccountsFile = {
  accounts: SavedCliAccount[];
};

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function zipwikiAccountsPath(): string {
  return join(zipwikiHomeDir(), "accounts.json");
}

function emptyFile(): AccountsFile {
  return { accounts: [] };
}

export function loadCliAccounts(): SavedCliAccount[] {
  const path = zipwikiAccountsPath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as AccountsFile;
    if (!Array.isArray(raw.accounts)) return [];
    const seen = new Set<string>();
    const accounts: SavedCliAccount[] = [];
    for (const row of raw.accounts) {
      const email = normalizeAccountEmail(String(row?.email ?? ""));
      const apiUrl = String(row?.apiUrl ?? "").trim();
      const apiKey = String(row?.apiKey ?? "").trim();
      const accountId = String(row?.accountId ?? "").trim();
      if (!email.includes("@") || !apiUrl || !apiKey) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      accounts.push({
        email,
        apiUrl,
        apiKey,
        ...(accountId ? { accountId } : {}),
      });
    }
    accounts.sort((a, b) => a.email.localeCompare(b.email));
    return accounts;
  } catch {
    return [];
  }
}

function writeAccounts(accounts: SavedCliAccount[]): void {
  const dir = zipwikiHomeDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* ignore on platforms without chmod */
  }
  const path = zipwikiAccountsPath();
  const body: AccountsFile = {
    accounts: [...accounts].sort((a, b) => a.email.localeCompare(b.email)),
  };
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
}

function sameAccount(a: SavedCliAccount, b: SavedCliAccount): boolean {
  return (
    a.email === b.email &&
    a.apiUrl === b.apiUrl &&
    a.apiKey === b.apiKey &&
    (a.accountId ?? "") === (b.accountId ?? "")
  );
}

/** Insert or replace the login for this email. */
export function rememberCliAccount(account: SavedCliAccount): SavedCliAccount {
  const email = normalizeAccountEmail(account.email);
  const apiUrl = account.apiUrl.trim();
  const apiKey = account.apiKey.trim();
  const accountId = account.accountId?.trim();
  if (!email.includes("@")) {
    throw new Error("CLI login is missing an account email");
  }
  if (!apiUrl || !apiKey) {
    throw new Error("CLI login is missing an API URL or API key");
  }
  const next: SavedCliAccount = {
    email,
    apiUrl,
    apiKey,
    ...(accountId ? { accountId } : {}),
  };
  const accounts = loadCliAccounts();
  const existing = accounts.find((row) => row.email === email);
  if (existing && sameAccount(existing, next)) return existing;
  writeAccounts([
    ...accounts.filter((row) => row.email !== email),
    next,
  ]);
  return next;
}

/** The connection currently in the environment, if it has an email. */
export function activeCliAccountFromEnv(): SavedCliAccount | null {
  const email = process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim();
  const apiUrl = process.env.ZIPWIKI_API_URL?.trim();
  const apiKey = process.env.ZIPWIKI_API_KEY?.trim();
  const accountId = process.env.ZIPWIKI_ACCOUNT_ID?.trim();
  if (!email || !apiUrl || !apiKey) return null;
  return {
    email: normalizeAccountEmail(email),
    apiUrl,
    apiKey,
    ...(accountId ? { accountId } : {}),
  };
}

/** Remember the active env login so a later `zipwiki login` can switch back. */
export function seedCliAccountsFromEnv(): SavedCliAccount[] {
  const current = activeCliAccountFromEnv();
  if (current) rememberCliAccount(current);
  return loadCliAccounts();
}

/**
 * Make a saved login the active CLI user.
 * Writes `ZIPWIKI_ACCOUNT_EMAIL` and the matching URL, key, and account id
 * into `~/.zipwiki/.env`.
 */
export function activateCliAccount(email: string): SavedCliAccount {
  const want = normalizeAccountEmail(email);
  const found = loadCliAccounts().find((row) => row.email === want);
  if (!found) {
    throw new Error(
      `No saved CLI login for ${want}. Run: zipwiki login`,
    );
  }
  const previous = process.env.ZIPWIKI_ACCOUNT_EMAIL?.trim().toLowerCase();
  saveZipwikiHomeEnv({
    ZIPWIKI_API_URL: found.apiUrl,
    ZIPWIKI_API_KEY: found.apiKey,
    ZIPWIKI_ACCOUNT_EMAIL: found.email,
    ZIPWIKI_ACCOUNT_ID: found.accountId ?? "",
  });
  process.env.ZIPWIKI_API_URL = found.apiUrl;
  process.env.ZIPWIKI_API_KEY = found.apiKey;
  process.env.ZIPWIKI_ACCOUNT_EMAIL = found.email;
  if (found.accountId) process.env.ZIPWIKI_ACCOUNT_ID = found.accountId;
  else delete process.env.ZIPWIKI_ACCOUNT_ID;
  if (previous && previous !== found.email) {
    discardCachedAccountSettings();
  }
  return found;
}
