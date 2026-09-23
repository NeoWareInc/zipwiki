import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOriginArgs, resolveReadArgs } from "./query-commands.js";

describe("resolveReadArgs", () => {
  it("takes a positional package with --okf", () => {
    assert.deepEqual(
      resolveReadArgs({
        positional: ["docs.zipwiki"],
        okf: "deed",
      }),
      {
        kind: "knowledge",
        packagePath: "docs.zipwiki",
        okf: "deed",
        parsed: undefined,
        entry: undefined,
      },
    );
  });

  it("takes -p with --path entry paths", () => {
    assert.deepEqual(
      resolveReadArgs({
        positional: [],
        package: "docs.zipwiki",
        path: ["wiki/parsed/deed.pdf.md"],
      }),
      {
        kind: "entries",
        packagePath: "docs.zipwiki",
        paths: ["wiki/parsed/deed.pdf.md"],
      },
    );
  });

  it("rejects two knowledge selectors", () => {
    assert.throws(
      () =>
        resolveReadArgs({
          positional: ["docs.zipwiki"],
          okf: "deed",
          parsed: "deed.pdf",
        }),
      /exactly one of --okf, --parsed, or --entry/,
    );
  });
});

describe("resolveOriginArgs", () => {
  it("takes a positional package with --parsed", () => {
    assert.deepEqual(
      resolveOriginArgs({
        positional: "docs.zipwiki",
        parsed: "deed.pdf",
      }),
      { packagePath: "docs.zipwiki", selector: "deed.pdf" },
    );
  });

  it("takes -p and treats the positional as the selector", () => {
    assert.deepEqual(
      resolveOriginArgs({
        positional: "deed.pdf",
        package: "docs.zipwiki",
      }),
      { packagePath: "docs.zipwiki", selector: "deed.pdf" },
    );
  });
});
