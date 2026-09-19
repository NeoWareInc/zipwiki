import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ensureStageDirs,
  writeParsedFile,
  writeOkfIndex,
  stagePaths,
} from "./phases.js";
import { runStage } from "./orchestrator.js";

describe("stage phases (smoke)", () => {
  it("dry-run does not write stage files", async () => {
    const docs = mkdtempSync(join(tmpdir(), "zipwiki-docs-"));
    const doc = join(docs, "hello.pdf");
    writeFileSync(doc, "%PDF-1.1\n", "utf-8");
    const stageDir = mkdtempSync(join(tmpdir(), "zipwiki-stage-"));
    const r = await runStage([doc], {
      phase: "all",
      stageDir,
      dryRun: true,
      quiet: true,
      noAiOkf: true,
      skipAccountSync: true,
    });
    assert.equal(r.phasesRun.length, 0);
    assert.ok(!existsSync(join(stageDir, "wiki", "parsed", "hello.md")));
    assert.ok(!existsSync(join(stageDir, "wiki", "parsed", "hello.pdf.md")));
  });

  it("okf phase writes wiki/okf from existing parses without zip", async () => {
    const docs = mkdtempSync(join(tmpdir(), "zipwiki-docs-"));
    const doc = join(docs, "note.pdf");
    writeFileSync(doc, "%PDF-1.1\n", "utf-8");
    const stageDir = mkdtempSync(join(tmpdir(), "zipwiki-stage-"));
    ensureStageDirs(stageDir);
    writeParsedFile(
      stageDir,
      "note.pdf",
      "# Note\n\nHello from staged parse.\n",
    );

    const r = await runStage([doc], {
      phase: "okf",
      stageDir,
      quiet: true,
      noAiOkf: true,
      noManifest: true,
      concurrency: 1,
      skipAccountSync: true,
    });

    assert.ok(r.phasesRun.includes("okf"));
    assert.equal(r.outputPath, undefined);
    const okf = join(stageDir, "wiki", "okf", "note.md");
    assert.ok(existsSync(okf), "expected OKF concept");
    const body = readFileSync(okf, "utf-8");
    assert.ok(body.startsWith("---"), "expected frontmatter");
    assert.ok(body.includes("title:"));
    const index = readFileSync(join(stageDir, "wiki", "okf", "index.md"), "utf-8");
    assert.ok(index.includes("okf_version"));
  });

  it("ensureStageDirs + writeOkfIndex helpers", () => {
    const stageDir = mkdtempSync(join(tmpdir(), "zipwiki-stage-"));
    const { okfDir } = ensureStageDirs(stageDir);
    writeParsedFile(stageDir, "a.pdf", "# A\n");
    writeFileSync(
      join(okfDir, "a.md"),
      "---\ntitle: A\nokf_version: \"0.2\"\n---\n",
      "utf-8",
    );
    const n = writeOkfIndex(okfDir);
    assert.equal(n, 1);
    assert.ok(existsSync(join(okfDir, "index.md")));
    assert.ok(existsSync(join(stageDir, "wiki", "parsed", "a.pdf.md")));
    assert.ok(!existsSync(join(stageDir, "wiki", "parsed", "a.md")));
    assert.equal(stagePaths(stageDir).stageDir, stageDir);
  });
});
