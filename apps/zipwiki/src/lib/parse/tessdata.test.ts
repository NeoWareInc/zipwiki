import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveTessdataPath } from "./tessdata.js";

describe("resolveTessdataPath", () => {
  it("prefers TESSDATA_PREFIX when eng.traineddata is present", () => {
    const dir = join(tmpdir(), `zc-tess-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "eng.traineddata"), "x");
    try {
      assert.equal(
        resolveTessdataPath({ TESSDATA_PREFIX: dir } as NodeJS.ProcessEnv),
        dir,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses tessdata subdir under TESSDATA_PREFIX when needed", () => {
    const root = join(tmpdir(), `zc-tess-root-${process.pid}`);
    const tess = join(root, "tessdata");
    mkdirSync(tess, { recursive: true });
    writeFileSync(join(tess, "eng.traineddata"), "x");
    try {
      assert.equal(
        resolveTessdataPath({ TESSDATA_PREFIX: root } as NodeJS.ProcessEnv),
        tess,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
