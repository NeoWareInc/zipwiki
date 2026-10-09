import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import { applyManifestOrigin, openNzip } from "./open";

function manifestArchive(ai: Record<string, unknown>): ArrayBuffer {
  const bytes = zipSync({
    "META-INF/manifest.json": strToU8(
      JSON.stringify({ format: "neozip", specVersion: "0.2", ai }),
    ),
  });
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

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

describe("openNzip ai.digest", () => {
  it("keeps a package digest for the overview", async () => {
    const opened = await openNzip(
      manifestArchive({
        root: "wiki",
        digest: "  Two tiny text files.  ",
        primaries: [],
      }),
      "sample.zipwiki",
    );
    assert.equal(opened.digest, "Two tiny text files.");
  });

  it("omits a blank digest", async () => {
    const opened = await openNzip(
      manifestArchive({ root: "wiki", digest: "   ", primaries: [] }),
      "sample.zipwiki",
    );
    assert.equal(opened.digest, undefined);
  });
});
