import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyManifestOrigin } from "./open";

describe("applyManifestOrigin", () => {
  it("uses manifest origin size ahead of the extra field", () => {
    const primary = applyManifestOrigin(
      {
        path: "Ch_2025-006.pdf",
        origin: { uri: "https://laws.flrules.org/2025/6", size: 490321, mtime: 1_700_000_000 },
      },
      { originSize: 12, originCrc32: "4a6420c0" },
    );
    assert.equal(primary.originSize, 490321);
    assert.equal(primary.originUri, "https://laws.flrules.org/2025/6");
    assert.equal(primary.originMtime, 1_700_000_000);
    assert.equal(primary.originCrc32, "4a6420c0");
  });
});
