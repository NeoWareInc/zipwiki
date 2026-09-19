import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAiOkfConfigured,
  normalizeOkfProvider,
  resolveOkfModel,
  resolveOkfProvider,
  stripProviderPrefix,
} from "./providers.js";

describe("okf providers", () => {
  it("normalizes provider ids", () => {
    assert.equal(normalizeOkfProvider("Anthropic"), "anthropic");
    assert.equal(normalizeOkfProvider("openai-compatible"), "openai-compatible");
    assert.equal(normalizeOkfProvider("nope"), undefined);
  });

  it("infers anthropic when ANTHROPIC_API_KEY is set", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-test" } as NodeJS.ProcessEnv;
    assert.equal(resolveOkfProvider(undefined, env), "anthropic");
    assert.equal(isAiOkfConfigured(env), true);
  });

  it("prefers keyed ZIPWIKI_OKF_PROVIDER over key inference", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-test",
      OPENAI_API_KEY: "sk-openai",
      ZIPWIKI_OKF_PROVIDER: "openai",
    } as NodeJS.ProcessEnv;
    assert.equal(resolveOkfProvider(undefined, env), "openai");
  });

  it("falls through unkeyed override/default to a configured provider", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-test" } as NodeJS.ProcessEnv;
    // Config default `openai` with only Anthropic key → use Anthropic.
    assert.equal(resolveOkfProvider("openai", env), "anthropic");
    assert.equal(resolveOkfProvider("gemini", env), "anthropic");
  });

  it("falls through unkeyed ZIPWIKI_OKF_PROVIDER to a configured provider", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-test",
      ZIPWIKI_OKF_PROVIDER: "openai",
    } as NodeJS.ProcessEnv;
    assert.equal(resolveOkfProvider(undefined, env), "anthropic");
  });

  it("uses provider default models and strips prefixes", () => {
    assert.equal(resolveOkfModel("anthropic"), "claude-haiku-4-5");
    assert.equal(
      resolveOkfModel("anthropic", "anthropic/claude-sonnet-4-5"),
      "claude-sonnet-4-5",
    );
    assert.equal(stripProviderPrefix("openai", "openai/gpt-4o"), "gpt-4o");
    assert.equal(
      resolveOkfModel("openrouter", "anthropic/claude-haiku-4.5"),
      "anthropic/claude-haiku-4.5",
    );
  });

  it("reports unconfigured when no keys present", () => {
    assert.equal(isAiOkfConfigured({} as NodeJS.ProcessEnv), false);
  });
});
