import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resetActivityDotsForTests,
  withActivityDots,
} from "./activity-dots.js";

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
