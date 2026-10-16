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

    assert.equal(EXAMPLE_PACKAGES.at(-1)?.title, "Charles Dickens");
    const dickens = examplePackageForFilename("Charles-Dickens.zipwiki");
    assert.equal(dickens?.title, "Charles Dickens");
    assert.equal(dickens?.queries.length, 3);
    assert.match(dickens?.queries[2] ?? "", /Golden Mary/);

    assert.equal(examplePackageForFilename("notes.zipwiki"), undefined);
    const earnings = examplePackageForFilename("earnings-2025.zipwiki");
    assert.equal(earnings?.title, "2025 Earnings");
    assert.match(earnings?.description ?? "", /SEC/);
    assert.equal(earnings?.queries.length, 5);
    assert.match(earnings?.queries[3] ?? "", /Uber/);
    assert.match(earnings?.queries[4] ?? "", /Coinbase/);

    const medical = examplePackageForFilename("medical-pdfs.zipwiki");
    assert.match(medical?.description ?? "", /made up/);
    assert.match(medical?.notice ?? "", /not real patients/);
    assert.equal(medical?.queries.length, 5);
    assert.match(medical?.queries[3] ?? "", /hospice admission/);
    assert.match(medical?.queries[4] ?? "", /imaging/);
  });
});
