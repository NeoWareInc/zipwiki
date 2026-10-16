import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitActivityLine,
  resetActivityDotsForTests,
  withActivityDots,
} from "./activity-dots.js";

describe("fitActivityLine", () => {
  it("keeps two long filenames on one terminal row", () => {
    const line =
      "[stage] llamaparse Marchetti History and Physical 2026-09-17.pdf, Marchetti Hospice Admission Evaluation 2026-09-26.pdf ...";
    const fitted = fitActivityLine(line, 100);
    assert.ok(fitted.length < 100);
    assert.ok(fitted.endsWith("…"));
    assert.equal(fitActivityLine("[stage] llamaparse a.pdf ...", 100).includes("…"), false);
  });
});

describe("withActivityDots", () => {
  it("returns work result when quiet", async () => {
    resetActivityDotsForTests();
    const out = await withActivityDots("doc.pdf", { quiet: true }, async () => 42);
    assert.equal(out, 42);
  });

  it("propagates errors from work", async () => {
    resetActivityDotsForTests();
    await assert.rejects(
      () =>
        withActivityDots("doc.pdf", { quiet: true }, async () => {
          throw new Error("boom");
        }),
      /boom/,
    );
  });
});
