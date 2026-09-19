import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ZIPWIKI_CONFIG,
  resolveOmitOriginalDocuments,
} from "./schema.js";

describe("resolveOmitOriginalDocuments", () => {
  it("defaults to true (extract only in .nzip)", () => {
    assert.equal(resolveOmitOriginalDocuments(), true);
    assert.equal(
      DEFAULT_ZIPWIKI_CONFIG.pack.omitOriginalDocuments,
      true,
    );
  });

  it("honors explicit false to include originals", () => {
    assert.equal(
      resolveOmitOriginalDocuments({
        cli: false,
        onboarding: { omitOriginalDocuments: true },
      }),
      false,
    );
    assert.equal(
      resolveOmitOriginalDocuments({
        onboarding: { omitOriginalDocuments: false },
      }),
      false,
    );
    assert.equal(
      resolveOmitOriginalDocuments({
        pack: { omitOriginalDocuments: false },
      }),
      false,
    );
  });
});
