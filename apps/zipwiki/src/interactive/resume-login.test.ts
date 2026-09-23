import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_ACCOUNT_SETTINGS } from "@zipwiki/api-client";
import { saveCachedAccountSettings } from "../lib/config/account-settings-cache.js";
import { ZIPWIKI_HOME_ENV } from "../lib/config/home.js";
import {
  commandSkipsLoginPrompt,
  resumeLoginIfSavedSettings,
  savedPortalLoginNeedsPrompt,
} from "./resume-login.js";

const savedUrl = process.env.ZIPWIKI_API_URL;
const savedKey = process.env.ZIPWIKI_API_KEY;
const savedHome = process.env[ZIPWIKI_HOME_ENV];

function restoreEnv(): void {
  if (savedUrl === undefined) delete process.env.ZIPWIKI_API_URL;
  else process.env.ZIPWIKI_API_URL = savedUrl;
  if (savedKey === undefined) delete process.env.ZIPWIKI_API_KEY;
  else process.env.ZIPWIKI_API_KEY = savedKey;
  if (savedHome === undefined) delete process.env[ZIPWIKI_HOME_ENV];
  else process.env[ZIPWIKI_HOME_ENV] = savedHome;
}

describe("resume login when saved portal settings exist", () => {
  const dirs: string[] = [];
  afterEach(() => {
    restoreEnv();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function signedOutWithCache(): void {
    const dir = mkdtempSync(join(tmpdir(), "zw-resume-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;
    delete process.env.ZIPWIKI_API_URL;
    delete process.env.ZIPWIKI_API_KEY;
    saveCachedAccountSettings({
      settings: structuredClone(DEFAULT_ACCOUNT_SETTINGS),
      setupComplete: true,
      setupCompletedAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
      setupUrl: null,
    });
  }

  it("asks to log in even when this machine has no saved session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zw-resume-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;
    delete process.env.ZIPWIKI_API_URL;
    delete process.env.ZIPWIKI_API_KEY;
    assert.equal(savedPortalLoginNeedsPrompt(), false);
    const messages: string[] = [];
    let loggedIn = false;
    await resumeLoginIfSavedSettings({
      interactive: true,
      confirm: async (message) => {
        messages.push(message);
        return true;
      },
      login: async () => {
        loggedIn = true;
        process.env.ZIPWIKI_API_URL = "https://zipwiki-api-dev.fly.dev";
        process.env.ZIPWIKI_API_KEY = "zc_live_test";
      },
    });
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /Log in now/);
    assert.equal(loggedIn, true);
  });

  it("starts auth login without a prompt when there is no TTY", async () => {
    signedOutWithCache();
    assert.equal(savedPortalLoginNeedsPrompt(), true);
    let asked = false;
    let loggedIn = false;
    await resumeLoginIfSavedSettings({
      interactive: false,
      confirm: async () => {
        asked = true;
        return true;
      },
      login: async () => {
        loggedIn = true;
        process.env.ZIPWIKI_API_URL = "https://zipwiki-api-dev.fly.dev";
        process.env.ZIPWIKI_API_KEY = "zc_live_test";
      },
    });
    assert.equal(asked, false);
    assert.equal(loggedIn, true);
  });

  it("asks to log in immediately and stops when declined", async () => {
    signedOutWithCache();
    const messages: string[] = [];
    await assert.rejects(
      () =>
        resumeLoginIfSavedSettings({
          interactive: true,
          confirm: async (message) => {
            messages.push(message);
            return false;
          },
          login: async () => {
            throw new Error("login should not run");
          },
        }),
      /Stopped/,
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /Log in now/);
  });

  it("logs in before continuing when accepted", async () => {
    signedOutWithCache();
    let loggedIn = false;
    await resumeLoginIfSavedSettings({
      interactive: true,
      confirm: async () => true,
      login: async () => {
        loggedIn = true;
        process.env.ZIPWIKI_API_URL = "https://zipwiki-api-dev.fly.dev";
        process.env.ZIPWIKI_API_KEY = "zc_live_test";
      },
    });
    assert.equal(loggedIn, true);
    assert.equal(savedPortalLoginNeedsPrompt(), false);
  });

  it("leaves auth, config, and archive reads alone", () => {
    assert.equal(commandSkipsLoginPrompt(["login", "auth", "zipwiki"]), true);
    assert.equal(commandSkipsLoginPrompt(["api-key", "config", "zipwiki"]), true);
    assert.equal(commandSkipsLoginPrompt(["catalog", "zipwiki"]), true);
    assert.equal(commandSkipsLoginPrompt(["search", "zipwiki"]), true);
    assert.equal(commandSkipsLoginPrompt(["open", "zipwiki"]), true);
    assert.equal(commandSkipsLoginPrompt(["open", "settings", "zipwiki"]), false);
    assert.equal(commandSkipsLoginPrompt(["pack", "zipwiki"]), false);
    assert.equal(commandSkipsLoginPrompt(["show", "settings", "zipwiki"]), false);
  });
});
