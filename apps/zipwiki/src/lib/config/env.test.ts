import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  applyEnvFile,
  findEnvRoot,
  loadRepoLlamaCloudKey,
  parseEnvFile,
} from "./env.js";

describe("env file loading", () => {
  it("parses KEY=VALUE, exports, quotes, and comments", () => {
    const parsed = parseEnvFile(`
# comment
FOO=bar
export BAZ=qux
QUOTED="hello world"
SINGLE='a=b'
WITH_COMMENT=one # trailing
INVALID
=nose
`);
    assert.equal(parsed.FOO, "bar");
    assert.equal(parsed.BAZ, "qux");
    assert.equal(parsed.QUOTED, "hello world");
    assert.equal(parsed.SINGLE, "a=b");
    assert.equal(parsed.WITH_COMMENT, "one");
    assert.equal(parsed.INVALID, undefined);
  });

  it("finds pnpm workspace root for env files", () => {
    const root = mkdtempSync(join(tmpdir(), "zc-env-root-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
    const nested = join(root, "packages", "parse");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, ".env.local"), "ZIPWIKI_PARSER=llamaparse\n");
    assert.equal(findEnvRoot(nested), root);
  });

  it("does not override existing process env", () => {
    const dir = mkdtempSync(join(tmpdir(), "zc-env-apply-"));
    const path = join(dir, ".env.local");
    writeFileSync(path, "ZIPWIKI_ENV_TEST_KEY=from-file\n");
    process.env.ZIPWIKI_ENV_TEST_KEY = "from-shell";
    assert.equal(applyEnvFile(path), true);
    assert.equal(process.env.ZIPWIKI_ENV_TEST_KEY, "from-shell");
    delete process.env.ZIPWIKI_ENV_TEST_KEY;

    assert.equal(applyEnvFile(path), true);
    assert.equal(process.env.ZIPWIKI_ENV_TEST_KEY, "from-file");
    delete process.env.ZIPWIKI_ENV_TEST_KEY;
  });

  it("loads only LLAMA_CLOUD_API_KEY from deploy env", () => {
    const root = mkdtempSync(join(tmpdir(), "zc-llama-key-"));
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n");
    mkdirSync(join(root, "deploy"));
    writeFileSync(
      join(root, "deploy", ".env.dev"),
      "LLAMA_CLOUD_API_KEY=llx-from-deploy\nSTRIPE_SECRET_KEY=sk_should_not_load\n",
    );
    const prev = process.env.LLAMA_CLOUD_API_KEY;
    const prevStripe = process.env.STRIPE_SECRET_KEY;
    delete process.env.LLAMA_CLOUD_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      assert.equal(loadRepoLlamaCloudKey(root), true);
      assert.equal(process.env.LLAMA_CLOUD_API_KEY, "llx-from-deploy");
      assert.equal(process.env.STRIPE_SECRET_KEY, undefined);
    } finally {
      if (prev !== undefined) process.env.LLAMA_CLOUD_API_KEY = prev;
      else delete process.env.LLAMA_CLOUD_API_KEY;
      if (prevStripe !== undefined) process.env.STRIPE_SECRET_KEY = prevStripe;
      else delete process.env.STRIPE_SECRET_KEY;
    }
  });
});
