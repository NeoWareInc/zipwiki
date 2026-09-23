import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatConfigShowText } from "./config-cmd.js";
import type { EffectiveConfigView } from "./lib/config/index.js";

function view(env: EffectiveConfigView["env"]): EffectiveConfigView {
  return {
    homeDir: "/tmp/zipwiki",
    homeEnvPath: "/tmp/zipwiki/.env",
    onboardingPath: "/tmp/zipwiki/onboarding.json",
    onboarding: { version: 1 },
    credentials: {
      useAi: true,
      hasOkfKey: true,
      hasParseKey: true,
      parseCredential: "zipwiki",
      okfCredential: "zipwiki",
      needsSetup: false,
      missing: [],
      onboardingComplete: false,
    },
    env,
    project: {
      parserEngine: "llamaparse",
      parserMode: "fixed",
      okfUseAi: true,
      okfProvider: "anthropic",
      okfModel: "claude-haiku-4-5",
      packCompression: "zstd",
      packLevel: 7,
      omitOriginalDocuments: true,
    },
  };
}

describe("config show text", () => {
  it("names the account and hides host URLs", () => {
    const text = formatConfigShowText(
      view({
        ZIPWIKI_API_URL: "https://zipwiki-api-dev.fly.dev",
        ZIPWIKI_API_KEY: "zc_…abcd",
        LLAMA_CLOUD_API_KEY: "llx…secret",
      }),
      "steve@neoware.io",
    );
    assert.match(text, /Account:.*steve@neoware\.io/);
    assert.match(text, /Environment:.*Dev/);
    assert.match(text, /Document parsing:.*ZipWiki/);
    assert.doesNotMatch(text, /fly\.dev/);
    assert.doesNotMatch(text, /LLAMA_CLOUD_API_KEY/);
    assert.doesNotMatch(text, /\/Users\//);
  });
});
