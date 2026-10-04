import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPackPlan,
  packOkfMode,
  resolvePackUseAi,
  shouldConfirmPack,
} from "./pack-confirm.js";

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

  it("prints the output archive and pack settings without listing files", () => {
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
    assert.match(text, /account\s+\(not signed in\)/);
    assert.match(text, /docs\.zipwiki/);
    assert.match(text, /files\s+2/);
    assert.match(text, /parsed text only/);
    assert.match(text, /deterministic/);
    assert.match(text, /zstd 7/);
    assert.match(text, /parser\s+liteparse/);
    assert.doesNotMatch(text, /a\.docx/);
    assert.doesNotMatch(text, /b\.pdf/);
    assert.match(
      formatPackPlan({
        outputPath: "/tmp/knowledge/docs.zipwiki",
        files: ["/tmp/knowledge/a.docx"],
        fileBytes: 10,
        phase: "all",
        recurse: false,
        omitOriginalDocuments: false,
        okf: "ai",
        compression: "zstd",
        parser: "liteparse",
        accountEmail: "steve@neoware.io",
      }),
      /account\s+steve@neoware\.io/,
    );
  });

  it("shows LlamaParse tier as llamaparse, fast", () => {
    const text = formatPackPlan({
      outputPath: "/tmp/out.zipwiki",
      files: ["/tmp/a.pdf"],
      fileBytes: 100,
      phase: "all",
      recurse: false,
      omitOriginalDocuments: true,
      okf: "ai",
      compression: "zstd",
      parser: "llamaparse",
      llamaTier: "cost_effective",
    });
    assert.match(text, /parser\s+llamaparse, fast$/m);
    assert.match(text, /origin\s+\(none\)/);
  });

  it("marks a local LlamaParse key on the pack plan", () => {
    const text = formatPackPlan({
      outputPath: "/tmp/out.zipwiki",
      files: ["/tmp/a.pdf"],
      fileBytes: 100,
      phase: "all",
      recurse: false,
      omitOriginalDocuments: true,
      okf: "ai",
      compression: "zstd",
      parser: "llamaparse",
      llamaTier: "cost_effective",
      userApiKey: true,
    });
    assert.match(text, /parser\s+llamaparse, fast \(user api key\)/);
  });

  it("shows origin locator in the pack plan", () => {
    const text = formatPackPlan({
      outputPath: "/tmp/out.zipwiki",
      files: ["/tmp/a.pdf"],
      fileBytes: 100,
      phase: "all",
      recurse: false,
      omitOriginalDocuments: true,
      okf: "ai",
      compression: "zstd",
      parser: "liteparse",
      originPattern: String.raw`Ch_(?<year>\d{4})-(?<chapter>\d+)`,
      originUrlTemplate: "https://laws.flrules.org/{year}/{chapter}",
      originFile: true,
    });
    assert.match(text, /origin\s+https:\/\/laws\.flrules\.org\/\{year\}\/\{chapter\}/);
    assert.match(text, /pattern Ch_\(\?<year>/);
    assert.match(text, /file: URI/);
  });

  it("labels OKF from the flags that will actually run", () => {
    assert.equal(packOkfMode({ noOkf: true }, true), "off");
    assert.equal(packOkfMode({ noAiOkf: true }, true), "fallback");
    assert.equal(packOkfMode({}, false), "fallback");
    assert.equal(packOkfMode({}, true), "ai");
  });

  it("turns AI OKF on for an explicit ZipWiki or Anthropic credential", () => {
    assert.equal(
      resolvePackUseAi({ remoteOkf: true, projectUseAi: false }),
      true,
    );
    assert.equal(
      resolvePackUseAi({ okfCredential: "zipwiki", projectUseAi: false }),
      true,
    );
    assert.equal(
      resolvePackUseAi({ okfCredential: "anthropic", projectUseAi: false }),
      true,
    );
    assert.equal(
      resolvePackUseAi({
        remoteOkf: true,
        noAiOkf: true,
        projectUseAi: true,
      }),
      false,
    );
    assert.equal(resolvePackUseAi({ projectUseAi: false }), false);
  });
});
