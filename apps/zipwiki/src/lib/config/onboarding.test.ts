import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  ZIPWIKI_HOME_ENV,
  needsCredentialSetup,
  saveZipwikiOnboarding,
  loadZipwikiOnboarding,
  isOnboardingComplete,
} from "./index.js";

describe("onboarding + credentials", () => {
  const dirs: string[] = [];
  after(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    delete process.env[ZIPWIKI_HOME_ENV];
  });

  it("saves onboarding and detects credential gaps", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-onb-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;

    assert.equal(isOnboardingComplete(), false);
    saveZipwikiOnboarding({
      completedAt: "2026-08-30T00:00:00.000Z",
      useAi: true,
      compression: "zstd",
      level: 6,
    });
    const o = loadZipwikiOnboarding();
    assert.equal(o.compression, "zstd");
    assert.equal(isOnboardingComplete(o), true);

    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.OPENAI_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    delete env.GEMINI_API_KEY;
    delete env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete env.OPENROUTER_API_KEY;
    delete env.OPENAI_COMPATIBLE_API_KEY;
    delete env.AI_GATEWAY_API_KEY;

    const status = needsCredentialSetup({ useAi: true, env, onboarding: o });
    assert.equal(status.needsSetup, true);
    assert.ok(status.missing.includes("OKF_API_KEY"));

    const ok = needsCredentialSetup({
      useAi: false,
      env,
      onboarding: o,
    });
    assert.equal(ok.needsSetup, false);
  });
});
