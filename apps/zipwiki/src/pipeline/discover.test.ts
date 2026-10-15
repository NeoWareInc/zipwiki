import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { discoverInputs } from "./discover.js";

describe("discoverInputs origin exclusions", () => {
  it("excludes a --origins list path even when it is a packable .tsv", () => {
    const root = mkdtempSync(join(tmpdir(), "discover-origins-"));
    const pdf = join(root, "AAPL-Q2.pdf");
    const list = join(root, "earnings-links.tsv");
    writeFileSync(pdf, "%PDF");
    writeFileSync(
      list,
      "AAPL-Q2.pdf\thttps://investor.example/aapl-q2\n",
    );
    const found = discoverInputs([root], {
      excludePaths: [list],
    });
    assert.deepEqual(found, [pdf]);
  });

  it("excludes *.url and *.origin.json sidecars by name", () => {
    const root = mkdtempSync(join(tmpdir(), "discover-side-"));
    const pdf = join(root, "report.pdf");
    // Sidecars are not normally collected (unsupported ext), but if passed
    // as explicit files they must still be dropped.
    const urlSide = join(root, "report.pdf.url");
    const jsonSide = join(root, "report.pdf.origin.json");
    writeFileSync(pdf, "%PDF");
    writeFileSync(urlSide, "https://example.org/report\n");
    writeFileSync(jsonSide, JSON.stringify({ url: "https://example.org/r" }));
    const found = discoverInputs([pdf, urlSide, jsonSide], {});
    assert.deepEqual(found, [pdf]);
  });
});
