import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXAMPLE_PACKAGES,
  examplePackageForFilename,
} from "./example-packages.js";

describe("example packages", () => {
  it("matches an opened archive to its example queries", () => {
    const florida = examplePackageForFilename(
      "/tmp/florida-laws-2025.zipwiki",
    );
    assert.equal(florida?.title, "Florida Laws 2025");
    assert.match(florida?.description ?? "", /session laws/);
    assert.equal(florida?.queries.length, 5);
    assert.match(florida?.queries[0] ?? "", /summary of this ZipWiki package/);

    const dickens = examplePackageForFilename("Charles-Dickens.zipwiki");
    assert.equal(dickens?.title, "Charles Dickens");
    assert.equal(dickens?.queries.length, 3);
    assert.match(dickens?.queries[2] ?? "", /Golden Mary/);

    assert.equal(examplePackageForFilename("notes.zipwiki"), undefined);
    assert.equal(
      EXAMPLE_PACKAGES.find((example) => example.name === "medical-pdfs.zipwiki")
        ?.queries.length,
      0,
    );
  });
});
