import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { DEFAULT_ACCOUNT_SETTINGS } from "@zipwiki/api-client";
import {
  applyCachedAccountSettingsToEnv,
  saveCachedAccountSettings,
  zipwikiSettingsCachePath,
} from "./account-settings-cache.js";
import {
  activateCliAccount,
  loadCliAccounts,
  rememberCliAccount,
  seedCliAccountsFromEnv,
} from "./accounts.js";
import { ZIPWIKI_HOME_ENV, loadZipwikiHomeEnv } from "./home.js";

describe("cli accounts", () => {
  const dirs: string[] = [];
  const envKeys = [
    ZIPWIKI_HOME_ENV,
    "ZIPWIKI_API_URL",
    "ZIPWIKI_API_KEY",
    "ZIPWIKI_ACCOUNT_EMAIL",
    "ZIPWIKI_ACCOUNT_ID",
    "ZIPWIKI_PARSE_CREDENTIAL",
    "ZIPWIKI_OKF_CREDENTIAL",
  ] as const;
  const saved = new Map<string, string | undefined>();
  for (const key of envKeys) saved.set(key, process.env[key]);

  after(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    for (const key of envKeys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function useHome(): string {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-accounts-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;
    return dir;
  }

  it("remembers each email and replaces that email's key", () => {
    useHome();
    rememberCliAccount({
      email: "Steve@NeoWare.io",
      accountId: "acct_neo",
      apiUrl: "https://zipwiki-api-dev.fly.dev",
      apiKey: "zw_neo",
    });
    rememberCliAccount({
      email: "steve@nutecdev.com",
      accountId: "acct_nutec",
      apiUrl: "https://zipwiki-api-dev.fly.dev",
      apiKey: "zw_nutec",
    });
    rememberCliAccount({
      email: "steve@neoware.io",
      accountId: "acct_neo",
      apiUrl: "https://zipwiki-api-dev.fly.dev",
      apiKey: "zw_neo_new",
    });
    const accounts = loadCliAccounts();
    assert.deepEqual(
      accounts.map((account) => account.email),
      ["steve@neoware.io", "steve@nutecdev.com"],
    );
    assert.equal(accounts[0]?.apiKey, "zw_neo_new");
    assert.equal(accounts[1]?.apiKey, "zw_nutec");
  });

  it("activates a saved user into the env file and drops the other user's settings cache", () => {
    useHome();
    rememberCliAccount({
      email: "steve@neoware.io",
      accountId: "acct_neo",
      apiUrl: "https://zipwiki-api-dev.fly.dev",
      apiKey: "zw_neo",
    });
    rememberCliAccount({
      email: "steve@nutecdev.com",
      accountId: "acct_nutec",
      apiUrl: "https://zipwiki-api-dev.fly.dev",
      apiKey: "zw_nutec",
    });
    process.env.ZIPWIKI_ACCOUNT_EMAIL = "steve@neoware.io";
    process.env.ZIPWIKI_ACCOUNT_ID = "acct_neo";
    process.env.ZIPWIKI_API_URL = "https://zipwiki-api-dev.fly.dev";
    process.env.ZIPWIKI_API_KEY = "zw_neo";
    saveCachedAccountSettings({
      settings: {
        ...DEFAULT_ACCOUNT_SETTINGS,
        parseCredential: "llama",
      },
      setupComplete: true,
      setupCompletedAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
      setupUrl: null,
      accountId: "acct_neo",
      email: "steve@neoware.io",
    });

    const active = activateCliAccount("steve@nutecdev.com");
    assert.equal(active.email, "steve@nutecdev.com");
    assert.equal(process.env.ZIPWIKI_ACCOUNT_EMAIL, "steve@nutecdev.com");
    assert.equal(process.env.ZIPWIKI_ACCOUNT_ID, "acct_nutec");
    assert.equal(process.env.ZIPWIKI_API_KEY, "zw_nutec");
    assert.equal(existsSync(zipwikiSettingsCachePath()), false);

    delete process.env.ZIPWIKI_API_KEY;
    delete process.env.ZIPWIKI_ACCOUNT_EMAIL;
    delete process.env.ZIPWIKI_ACCOUNT_ID;
    delete process.env.ZIPWIKI_API_URL;
    loadZipwikiHomeEnv();
    assert.equal(process.env.ZIPWIKI_ACCOUNT_EMAIL, "steve@nutecdev.com");
    assert.equal(process.env.ZIPWIKI_API_KEY, "zw_nutec");
  });

  it("seeds the active env login and ignores another account's settings cache", () => {
    useHome();
    process.env.ZIPWIKI_ACCOUNT_EMAIL = "steve@nutecdev.com";
    process.env.ZIPWIKI_ACCOUNT_ID = "acct_nutec";
    process.env.ZIPWIKI_API_URL = "https://zipwiki-api-dev.fly.dev";
    process.env.ZIPWIKI_API_KEY = "zw_nutec";
    process.env.ZIPWIKI_PARSE_CREDENTIAL = "sentinel";
    const seeded = seedCliAccountsFromEnv();
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0]?.email, "steve@nutecdev.com");

    saveCachedAccountSettings({
      settings: {
        ...DEFAULT_ACCOUNT_SETTINGS,
        parseCredential: "llama",
      },
      setupComplete: true,
      setupCompletedAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
      setupUrl: null,
      accountId: "acct_neo",
      email: "steve@neoware.io",
    });
    assert.equal(applyCachedAccountSettingsToEnv({ persist: false }), null);
    assert.equal(process.env.ZIPWIKI_PARSE_CREDENTIAL, "sentinel");
  });
});
