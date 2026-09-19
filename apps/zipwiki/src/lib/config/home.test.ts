import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  formatHomeEnv,
  isPlatformForbiddenHomeEnvKey,
  isSecretEnvConfigured,
  loadZipwikiHomeEnv,
  MANAGED_HOME_ENV_KEYS,
  PLATFORM_FORBIDDEN_HOME_ENV_KEYS,
  saveZipwikiHomeEnv,
  ZIPWIKI_HOME_ENV,
} from "./home.js";

describe("zipwiki home env", () => {
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

  it("keeps managed home keys free of platform AUTH/JWT/Stripe secrets", () => {
    for (const key of MANAGED_HOME_ENV_KEYS) {
      assert.equal(
        isPlatformForbiddenHomeEnvKey(key),
        false,
        `${key} must remain a Lane C (user) key`,
      );
    }
    for (const key of PLATFORM_FORBIDDEN_HOME_ENV_KEYS) {
      assert.equal(isPlatformForbiddenHomeEnvKey(key), true);
      assert.ok(
        !(MANAGED_HOME_ENV_KEYS as readonly string[]).includes(key),
        `${key} must not be in MANAGED_HOME_ENV_KEYS`,
      );
    }
  });

  it("formats managed keys first", () => {
    const text = formatHomeEnv({
      ZZZ: "1",
      OPENAI_API_KEY: "sk-test",
      ZIPWIKI_OKF_MODEL: "gpt-4o-mini",
    });
    assert.match(text, /^OPENAI_API_KEY=/m);
    const openai = text.indexOf("OPENAI_API_KEY=");
    const zzz = text.indexOf("ZZZ=");
    assert.ok(openai < zzz);
  });

  it("saves and loads with shell env winning", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-home-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;

    saveZipwikiHomeEnv({
      OPENAI_API_KEY: "from-file",
      ZIPWIKI_OKF_MODEL: "file-model",
    });

    process.env.OPENAI_API_KEY = "from-shell";
    delete process.env.ZIPWIKI_OKF_MODEL;

    const result = loadZipwikiHomeEnv();
    assert.equal(result.loaded, true);
    assert.equal(process.env.OPENAI_API_KEY, "from-shell");
    assert.equal(process.env.ZIPWIKI_OKF_MODEL, "file-model");

    delete process.env.OPENAI_API_KEY;
    delete process.env.ZIPWIKI_OKF_MODEL;
  });

  it("rejects writing AUTH_RESEND_KEY into home env", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-home-forbid-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;
    assert.throws(
      () => saveZipwikiHomeEnv({ AUTH_RESEND_KEY: "re_test" }),
      /platform secret/i,
    );
  });

  it("allows deleting a forbidden key with empty string", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-home-del-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;
    writeFileSync(
      join(dir, ".env"),
      'AUTH_RESEND_KEY="re_leak"\nLLAMA_CLOUD_API_KEY="llx-ok"\n',
      "utf-8",
    );
    saveZipwikiHomeEnv({ AUTH_RESEND_KEY: "" });
    delete process.env.AUTH_RESEND_KEY;
    delete process.env.LLAMA_CLOUD_API_KEY;
    const result = loadZipwikiHomeEnv();
    assert.equal(process.env.AUTH_RESEND_KEY, undefined);
    assert.equal(process.env.LLAMA_CLOUD_API_KEY, "llx-ok");
    assert.ok(!result.keys.includes("AUTH_RESEND_KEY"));
    delete process.env.LLAMA_CLOUD_API_KEY;
  });

  it("skips platform keys when loading a hand-edited home env", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-home-skip-"));
    dirs.push(dir);
    process.env[ZIPWIKI_HOME_ENV] = dir;
    writeFileSync(
      join(dir, ".env"),
      'AUTH_RESEND_KEY="re_should_not_load"\nZIPWIKI_OKF_MODEL="m1"\n',
      "utf-8",
    );
    delete process.env.AUTH_RESEND_KEY;
    delete process.env.ZIPWIKI_OKF_MODEL;
    loadZipwikiHomeEnv();
    assert.equal(process.env.AUTH_RESEND_KEY, undefined);
    assert.equal(process.env.ZIPWIKI_OKF_MODEL, "m1");
    delete process.env.ZIPWIKI_OKF_MODEL;
  });

  it("reports secret presence without returning the value", () => {
    const env = {
      LLAMA_CLOUD_API_KEY: "llx-secret-should-not-leak",
      ANTHROPIC_API_KEY: "   ",
    } as NodeJS.ProcessEnv;
    assert.equal(isSecretEnvConfigured("LLAMA_CLOUD_API_KEY", env), true);
    assert.equal(isSecretEnvConfigured("ANTHROPIC_API_KEY", env), false);
    assert.equal(isSecretEnvConfigured("MISSING_KEY", env), false);
  });
});
