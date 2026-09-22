import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPackPlan, packOkfMode, shouldConfirmPack } from "./pack-confirm.js";

describe("pack confirm", () => {
  it("asks on an interactive zip-producing pack", () => {
    assert.equal(
      shouldConfirmPack({ phase: "all", interactive: true }),
      true,
    );
    assert.equal(
      shouldConfirmPack({ phase: "compress", interactive: true }),
      true,
    );
  });

  it("skips the prompt for scripts, dry-run, and non-zip phases", () => {
    assert.equal(
      shouldConfirmPack({ phase: "all", interactive: true, yes: true }),
      false,
    );
    assert.equal(
      shouldConfirmPack({ phase: "all", interactive: false }),
      false,
    );
    assert.equal(
      shouldConfirmPack({ phase: "all", interactive: true, dryRun: true }),
      false,
    );
    assert.equal(
      shouldConfirmPack({ phase: "all", interactive: true, noZip: true }),
      false,
    );
    assert.equal(
      shouldConfirmPack({ phase: "parse", interactive: true }),
      false,
    );
  });

  it("prints the output archive and the files that will be packed", () => {
    const text = formatPackPlan({
      outputPath: "/tmp/knowledge/docs.zipwiki",
      files: ["/tmp/knowledge/a.docx", "/tmp/knowledge/b.pdf"],
      fileBytes: 2048,
      phase: "all",
      recurse: false,
      omitOriginalDocuments: true,
      okf: "fallback",
      compression: "zstd",
      level: 7,
      parser: "liteparse",
    });
    assert.match(text, /docs\.zipwiki/);
    assert.match(text, /files\s+2/);
    assert.match(text, /parsed text only/);
    assert.match(text, /deterministic/);
    assert.match(text, /zstd 7/);
    assert.match(text, /a\.docx/);
    assert.match(text, /b\.pdf/);
  });

  it("labels OKF from the flags that will actually run", () => {
    assert.equal(packOkfMode({ noOkf: true }, true), "off");
    assert.equal(packOkfMode({ noAiOkf: true }, true), "fallback");
    assert.equal(packOkfMode({}, false), "fallback");
    assert.equal(packOkfMode({}, true), "ai");
  });
});
