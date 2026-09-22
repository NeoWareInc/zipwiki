import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { REPO_ROOT, resolveRepoPath } from "./paths.js";

describe("resolveRepoPath", () => {
  const prevInit = process.env.INIT_CWD;
  const dir = mkdtempSync(join(tmpdir(), "repo-path-"));

  function restoreInit(): void {
    if (prevInit === undefined) delete process.env.INIT_CWD;
    else process.env.INIT_CWD = prevInit;
  }

  after(() => {
    restoreInit();
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves new relative outputs against INIT_CWD, not the filter cwd", () => {
    process.env.INIT_CWD = REPO_ROOT;
    try {
      const dest = resolveRepoPath(
        "knowledge/.output/florida-laws/Ch_2025-001.pdf",
      );
      assert.equal(
        dest,
        resolve(REPO_ROOT, "knowledge/.output/florida-laws/Ch_2025-001.pdf"),
      );
    } finally {
      restoreInit();
    }
  });

  it("prefers an existing file at INIT_CWD", () => {
    const inv = join(dir, "inv");
    mkdirSync(join(inv, "out"), { recursive: true });
    writeFileSync(join(inv, "out", "a.pdf"), "ok");
    process.env.INIT_CWD = inv;
    try {
      assert.equal(resolveRepoPath("out/a.pdf"), join(inv, "out", "a.pdf"));
    } finally {
      restoreInit();
    }
  });
});
