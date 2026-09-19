import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runManifestCommand } from "./manifest-cmd.js";

describe("runManifestCommand", () => {
  it("lists primaries without copying them into the stage root", async () => {
    const root = mkdtempSync(join(tmpdir(), "zc-manifest-"));
    const input = join(root, "docs");
    const stage = join(root, "stage");
    mkdirSync(input);
    mkdirSync(join(stage, "wiki", "parsed"), { recursive: true });
    mkdirSync(join(stage, "wiki", "okf"), { recursive: true });
    writeFileSync(join(input, "report.pdf"), "%PDF-1.4\n");
    writeFileSync(join(stage, "wiki", "parsed", "report.pdf.md"), "# Report\n");
    writeFileSync(
      join(stage, "wiki", "okf", "report.md"),
      '---\ntitle: Report\nokf_version: "0.2"\n---\n',
    );
    writeFileSync(join(stage, "stale.pdf"), "leftover copy");

    const manifest = await runManifestCommand({
      inputDir: input,
      parseDir: join(stage, "wiki", "parsed"),
      okfDir: join(stage, "wiki", "okf"),
      outputDir: stage,
      quiet: true,
    });

    assert.deepEqual(readdirSync(stage).sort(), ["META-INF", "wiki"]);
    assert.ok(!existsSync(join(stage, "report.pdf")));
    assert.ok(!existsSync(join(stage, "stale.pdf")));
    assert.equal(manifest.ai?.primaries?.[0]?.path, "report.pdf");
    assert.equal(manifest.ai?.primaries?.[0]?.hasParsed, true);
    assert.equal(manifest.ai?.primaries?.[0]?.mimeType, "application/pdf");
    assert.ok(
      readFileSync(join(stage, "META-INF", "manifest.json"), "utf-8").includes(
        "report.pdf",
      ),
    );
  });
});
