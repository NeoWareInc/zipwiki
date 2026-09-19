import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveAuthLoginTarget,
  resolveOkfCredentialSource,
  resolveParseCredentialSource,
  resolveZipwikiApiTarget,
  resolveZipwikiApiUrl,
  zipwikiApiUrlForTarget,
  ZIPWIKI_DEV_API_URL,
} from "./api.js";

describe("credential source resolution", () => {
  it("defaults to zipwiki when API URL is set (key optional)", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ANTHROPIC_API_KEY: "sk-ant",
      LLAMA_CLOUD_API_KEY: "llx",
    };
    assert.equal(resolveParseCredentialSource(env), "zipwiki");
    assert.equal(resolveOkfCredentialSource(env), "zipwiki");
  });

  it("defaults to zipwiki when API URL and key are set", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ZIPWIKI_API_KEY: "zc_live_test",
      ANTHROPIC_API_KEY: "sk-ant",
      LLAMA_CLOUD_API_KEY: "llx",
    };
    assert.equal(resolveParseCredentialSource(env), "zipwiki");
    assert.equal(resolveOkfCredentialSource(env), "zipwiki");
  });

  it("honors explicit llama and anthropic credentials", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ZIPWIKI_API_KEY: "zc_live_test",
      ZIPWIKI_PARSE_CREDENTIAL: "llama",
      ZIPWIKI_OKF_CREDENTIAL: "anthropic",
    };
    assert.equal(resolveParseCredentialSource(env), "llama");
    assert.equal(resolveOkfCredentialSource(env), "anthropic");
  });

  it("falls back to local when no zipwiki api configured", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant" };
    assert.equal(resolveParseCredentialSource(env), "local");
    assert.equal(resolveOkfCredentialSource(env), "local");
  });

  it("maps preset URLs to dev / production (local aliases to hosted Dev)", () => {
    assert.equal(
      resolveZipwikiApiTarget("http://localhost:3001"),
      "dev",
    );
    assert.equal(
      resolveZipwikiApiTarget("https://api-dev.zipwiki.ai/"),
      "dev",
    );
    assert.equal(
      resolveZipwikiApiTarget(ZIPWIKI_DEV_API_URL),
      "dev",
    );
    assert.equal(
      resolveZipwikiApiTarget("https://api.zipwiki.ai"),
      "production",
    );
    assert.equal(resolveZipwikiApiTarget("https://other.example"), undefined);
    assert.equal(zipwikiApiUrlForTarget("local"), ZIPWIKI_DEV_API_URL);
    assert.equal(zipwikiApiUrlForTarget("dev"), ZIPWIKI_DEV_API_URL);
    assert.equal(
      zipwikiApiUrlForTarget("production"),
      "https://api.zipwiki.ai",
    );
  });

  it("rewrites legacy localhost and api-dev aliases to hosted Dev URL", () => {
    assert.equal(
      resolveZipwikiApiUrl({ ZIPWIKI_API_URL: "http://localhost:3001" }),
      ZIPWIKI_DEV_API_URL,
    );
    assert.equal(
      resolveZipwikiApiUrl({
        ZIPWIKI_API_URL: "https://api-dev.zipwiki.ai/",
      }),
      ZIPWIKI_DEV_API_URL,
    );
  });

  it("locks auth login target on release channel", () => {
    assert.equal(
      resolveAuthLoginTarget(undefined, { ZIPWIKI_CLI_CHANNEL: "release" }),
      "production",
    );
    assert.throws(
      () =>
        resolveAuthLoginTarget("dev", { ZIPWIKI_CLI_CHANNEL: "release" }),
      /only support --env production/,
    );
  });

  it("aliases local to hosted Dev on the dev channel", () => {
    assert.equal(
      resolveAuthLoginTarget(undefined, { ZIPWIKI_CLI_CHANNEL: "dev" }),
      "dev",
    );
    assert.equal(
      resolveAuthLoginTarget("local", { ZIPWIKI_CLI_CHANNEL: "dev" }),
      "dev",
    );
    assert.equal(
      resolveAuthLoginTarget("dev", { ZIPWIKI_CLI_CHANNEL: "dev" }),
      "dev",
    );
  });
});
