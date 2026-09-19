import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_ACCOUNT_SETTINGS } from "@zipwiki/api-client";
import {
  isZipwikiAccountConnected,
  requireAccountConnected,
  requireAccountForHostedCredential,
  syncAccountSettingsForPack,
} from "./account-settings-cache.js";

const savedUrl = process.env.ZIPWIKI_API_URL;
const savedKey = process.env.ZIPWIKI_API_KEY;
const savedParse = process.env.ZIPWIKI_PARSE_CREDENTIAL;
const savedOkf = process.env.ZIPWIKI_OKF_CREDENTIAL;

afterEach(() => {
  if (savedUrl === undefined) delete process.env.ZIPWIKI_API_URL;
  else process.env.ZIPWIKI_API_URL = savedUrl;
  if (savedKey === undefined) delete process.env.ZIPWIKI_API_KEY;
  else process.env.ZIPWIKI_API_KEY = savedKey;
  if (savedParse === undefined) delete process.env.ZIPWIKI_PARSE_CREDENTIAL;
  else process.env.ZIPWIKI_PARSE_CREDENTIAL = savedParse;
  if (savedOkf === undefined) delete process.env.ZIPWIKI_OKF_CREDENTIAL;
  else process.env.ZIPWIKI_OKF_CREDENTIAL = savedOkf;
});

describe("account optional for local pack", () => {
  it("isZipwikiAccountConnected requires URL and key", () => {
    delete process.env.ZIPWIKI_API_URL;
    delete process.env.ZIPWIKI_API_KEY;
    assert.equal(isZipwikiAccountConnected(), false);
    process.env.ZIPWIKI_API_URL = "https://api.zipwiki.ai";
    assert.equal(isZipwikiAccountConnected(), false);
    process.env.ZIPWIKI_API_KEY = "zc_live_test";
    assert.equal(isZipwikiAccountConnected(), true);
  });

  it("syncAccountSettingsForPack uses local defaults without login", async () => {
    delete process.env.ZIPWIKI_API_URL;
    delete process.env.ZIPWIKI_API_KEY;
    const payload = await syncAccountSettingsForPack({ quiet: true });
    assert.equal(payload.setupComplete, true);
    assert.equal(payload.settings.parseCredential, "local");
    assert.equal(payload.settings.okfCredential, "local");
    assert.equal(payload.settings.okf.useAi, false);
    assert.equal(
      payload.settings.parser.engine,
      DEFAULT_ACCOUNT_SETTINGS.parser.engine,
    );
  });

  it("requireAccountConnected still blocks settings-style commands", () => {
    delete process.env.ZIPWIKI_API_URL;
    delete process.env.ZIPWIKI_API_KEY;
    assert.throws(() => requireAccountConnected(), /account required/i);
  });

  it("requireAccountForHostedCredential gates zipwiki parse/OKF only", () => {
    delete process.env.ZIPWIKI_API_URL;
    delete process.env.ZIPWIKI_API_KEY;
    assert.doesNotThrow(() =>
      requireAccountForHostedCredential({
        parseCredential: "local",
        okfCredential: "local",
      }),
    );
    assert.doesNotThrow(() =>
      requireAccountForHostedCredential({
        parseCredential: "llama",
        okfCredential: "anthropic",
      }),
    );
    assert.throws(
      () =>
        requireAccountForHostedCredential({
          parseCredential: "zipwiki",
          okfCredential: "local",
        }),
      /Hosted ZipWiki parse/,
    );
    assert.throws(
      () =>
        requireAccountForHostedCredential({
          remoteOkf: true,
        }),
      /Hosted ZipWiki OKF/,
    );
  });
});
