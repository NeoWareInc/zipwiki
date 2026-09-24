import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountApiUrlAfterLogin,
  dashboardSettingsUrl,
  deviceApprovalPage,
  resolveAuthLoginTarget,
  resolveOkfCredentialSource,
  resolveParseCredentialSource,
  resolveZipwikiApiTarget,
  resolveZipwikiApiUrl,
  zipwikiApiUrlForTarget,
  zipwikiDeviceAuthUrl,
  ZIPWIKI_DEV_API_URL,
  ZIPWIKI_DEV_DEVICE_AUTH_URL,
} from "./api.js";

describe("credential source resolution", () => {
  it("defaults to local when API URL is set but portal prefs are unset", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ANTHROPIC_API_KEY: "sk-ant",
      LLAMA_CLOUD_API_KEY: "llx",
    };
    assert.equal(resolveParseCredentialSource(env), "local");
    assert.equal(resolveOkfCredentialSource(env), "local");
  });

  it("defaults to local when API URL and key are set without portal prefs", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ZIPWIKI_API_KEY: "zc_live_test",
      ANTHROPIC_API_KEY: "sk-ant",
      LLAMA_CLOUD_API_KEY: "llx",
    };
    assert.equal(resolveParseCredentialSource(env), "local");
    assert.equal(resolveOkfCredentialSource(env), "local");
  });

  it("honors explicit zipwiki credentials from portal settings", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ZIPWIKI_API_KEY: "zc_live_test",
      ZIPWIKI_PARSE_CREDENTIAL: "zipwiki",
      ZIPWIKI_OKF_CREDENTIAL: "zipwiki",
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

  it("legacy ZIPWIKI_HOSTED_MODE still forces zipwiki", () => {
    const env = {
      ZIPWIKI_API_URL: ZIPWIKI_DEV_API_URL,
      ZIPWIKI_HOSTED_MODE: "1",
    };
    assert.equal(resolveParseCredentialSource(env), "zipwiki");
    assert.equal(resolveOkfCredentialSource(env), "zipwiki");
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

  it("sends dev device login to Convex, not Fly", () => {
    assert.equal(zipwikiDeviceAuthUrl("dev"), ZIPWIKI_DEV_DEVICE_AUTH_URL);
    assert.equal(zipwikiDeviceAuthUrl("local"), ZIPWIKI_DEV_DEVICE_AUTH_URL);
    assert.equal(
      zipwikiDeviceAuthUrl("production"),
      "https://api.zipwiki.ai",
    );
  });

  it("opens the first real origin when WEB_ORIGIN is a list", () => {
    const page = deviceApprovalPage({
      verificationUri:
        "https://zipwiki-web-dev.vercel.app,http://localhost:5173/cli/device",
      verificationUriComplete:
        "https://zipwiki-web-dev.vercel.app,http://localhost:5173/cli/device?user_code=ABCD-EFGH",
      userCode: "ABCD-EFGH",
    });
    assert.equal(
      page,
      "https://zipwiki-web-dev.vercel.app/cli/device?user_code=ABCD-EFGH",
    );
  });

  it("opens the dev dashboard for a dev API login", () => {
    assert.equal(
      dashboardSettingsUrl({
        apiUrl: ZIPWIKI_DEV_API_URL,
        setupUrl: "https://zipwiki.ai/dashboard/settings",
      }),
      "https://zipwiki-web-dev.vercel.app/dashboard/settings",
    );
    assert.equal(
      dashboardSettingsUrl({ apiUrl: "https://api.zipwiki.ai" }),
      "https://zipwiki.ai/dashboard/settings",
    );
  });

  it("keeps the Fly API URL when Convex returns localhost", () => {
    assert.equal(
      accountApiUrlAfterLogin("http://localhost:3001", "dev"),
      ZIPWIKI_DEV_API_URL,
    );
    assert.equal(
      accountApiUrlAfterLogin("https://zipwiki-api-dev.fly.dev", "dev"),
      "https://zipwiki-api-dev.fly.dev",
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
