import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
  cliOriginOverlay,
  normalizeOriginUri,
  resolveOriginUri,
  tryApplyOriginRule,
} from "./origin-resolve.js";

describe("origin-resolve", () => {
  it("expands Florida-style template and strips leading zeros", () => {
    const uri = tryApplyOriginRule(
      {
        pattern: "Ch_(?<year>\\d{4})-(?<chapter>\\d+)",
        urlTemplate: "https://laws.flrules.org/{year}/{chapter}",
      },
      "/tmp/corpus/Ch_2025-001.pdf",
      "/tmp/corpus",
    );
    assert.equal(uri, "https://laws.flrules.org/2025/1");
  });

  it("rebases {path} to the rule directory", () => {
    const uri = tryApplyOriginRule(
      { urlTemplate: "https://cdn.example.org/{path}" },
      "/tmp/corpus/federal/a.pdf",
      "/tmp/corpus/federal",
    );
    assert.equal(uri, "https://cdn.example.org/a.pdf");
  });

  it("nested rule overrides parent; unmatched pattern falls through", () => {
    const root = mkdtempSync(join(tmpdir(), "origin-rules-"));
    const florida = join(root, "florida");
    mkdirSync(florida, { recursive: true });
    writeFileSync(
      join(root, ".zipwiki-origins.json"),
      JSON.stringify({ file: true }),
    );
    writeFileSync(
      join(florida, ".zipwiki-origins.json"),
      JSON.stringify({
        pattern: "Ch_(?<year>\\d{4})-(?<chapter>\\d+)",
        urlTemplate: "https://laws.flrules.org/{year}/{chapter}",
      }),
    );
    const pdf = join(florida, "Ch_2024-210.pdf");
    writeFileSync(pdf, "x");
    const other = join(florida, "notes.txt");
    writeFileSync(other, "y");

    assert.equal(
      resolveOriginUri(pdf, { inputRoots: [root] }),
      "https://laws.flrules.org/2024/210",
    );
    // notes.txt does not match florida pattern → fall through to parent file: rule
    assert.equal(
      resolveOriginUri(other, { inputRoots: [root] }),
      pathToFileURL(other).href,
    );
  });

  it("sidecar beats directory rule", () => {
    const root = mkdtempSync(join(tmpdir(), "origin-side-"));
    writeFileSync(
      join(root, ".zipwiki-origins.json"),
      JSON.stringify({
        pattern: "Ch_(?<year>\\d{4})-(?<chapter>\\d+)",
        urlTemplate: "https://laws.flrules.org/{year}/{chapter}",
      }),
    );
    const pdf = join(root, "Ch_2025-001.pdf");
    writeFileSync(pdf, "x");
    writeFileSync(`${pdf}.url`, "https://example.org/override\n");
    assert.equal(
      resolveOriginUri(pdf, { inputRoots: [root] }),
      "https://example.org/override",
    );
  });

  it("CLI overlay applies only under the pack input root", () => {
    const a = mkdtempSync(join(tmpdir(), "origin-a-"));
    const b = mkdtempSync(join(tmpdir(), "origin-b-"));
    const pdfA = join(a, "Ch_2025-001.pdf");
    const pdfB = join(b, "Ch_2025-002.pdf");
    writeFileSync(pdfA, "a");
    writeFileSync(pdfB, "b");
    const overlay = cliOriginOverlay({
      originPattern: "Ch_(?<year>\\d{4})-(?<chapter>\\d+)",
      originUrlTemplate: "https://laws.flrules.org/{year}/{chapter}",
    });
    assert.equal(
      resolveOriginUri(pdfA, { inputRoots: [a], cliOverlay: overlay }),
      "https://laws.flrules.org/2025/1",
    );
    // pdfB is not under root `a`
    assert.equal(
      resolveOriginUri(pdfB, { inputRoots: [a], cliOverlay: overlay }),
      null,
    );
  });

  it("rejects relative locators", () => {
    assert.throws(() => normalizeOriginUri("foo/bar.pdf"));
  });

  it("normalizes absolute paths to file: URIs", () => {
    const abs = join(tmpdir(), "doc.pdf");
    assert.equal(normalizeOriginUri(abs), pathToFileURL(abs).href);
  });
});
