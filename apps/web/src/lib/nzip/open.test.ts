import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildZipBufferSync } from "neozipkit/node";
import { applyManifestOrigin, openNzip } from "./open";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function manifestArchive(
  ai: Record<string, unknown>,
  extra: Array<{ name: string; data: string }> = [],
): ArrayBuffer {
  const manifest = JSON.stringify({ format: "neozip", specVersion: "0.2", ai });
  return toArrayBuffer(
    buildZipBufferSync([
      { name: "META-INF/manifest.json", data: Buffer.from(manifest), method: 8 },
      ...extra.map((e) => ({
        name: e.name,
        data: Buffer.from(e.data),
        method: 8 as const,
      })),
    ]),
  );
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

  it("keeps a package notice for the overview", async () => {
    const opened = await openNzip(
      manifestArchive({
        root: "wiki",
        notice: "  These are not real patients.  ",
        primaries: [],
      }),
      "sample.zipwiki",
    );
    assert.equal(opened.notice, "These are not real patients.");
  });

  it("omits a blank digest", async () => {
    const opened = await openNzip(
      manifestArchive({ root: "wiki", digest: "   ", primaries: [] }),
      "sample.zipwiki",
    );
    assert.equal(opened.digest, undefined);
  });

  it("keeps the shared reader on the summary", async () => {
    const opened = await openNzip(
      manifestArchive({ root: "wiki", primaries: [] }),
      "sample.zipwiki",
    );
    assert.equal(opened.entryCount, 1);
    const bytes = await opened.reader.readEntry("META-INF/manifest.json");
    assert.ok(bytes.byteLength > 0);
  });
});

describe("openNzip blockchain badge", () => {
  const ai = { root: "wiki", primaries: [] };

  it("shows nothing without sidecars", async () => {
    const opened = await openNzip(manifestArchive(ai), "a.zipwiki");
    assert.equal(opened.blockchain, undefined);
  });

  it("marks TS-SUBMIT alone as pending", async () => {
    const opened = await openNzip(
      manifestArchive(ai, [{ name: "META-INF/TS-SUBMIT.NZIP", data: "{}" }]),
      "a.zipwiki",
    );
    assert.equal(opened.blockchain?.label, "Stamp pending");
  });

  it("marks TIMESTAMP as timestamped", async () => {
    const opened = await openNzip(
      manifestArchive(ai, [
        { name: "META-INF/TS-SUBMIT.NZIP", data: "{}" },
        { name: "META-INF/TIMESTAMP.NZIP", data: "{}" },
      ]),
      "a.zipwiki",
    );
    assert.equal(opened.blockchain?.label, "Timestamped");
  });

  it("marks TOKEN as tokenized and reads network/tokenId", async () => {
    const opened = await openNzip(
      manifestArchive(ai, [
        {
          name: "META-INF/TOKEN.NZIP",
          data: JSON.stringify({ network: "base-sepolia", tokenId: 42 }),
        },
      ]),
      "a.zipwiki",
    );
    assert.equal(opened.blockchain?.label, "Tokenized");
    assert.equal(opened.blockchain?.title, "Network: base-sepolia · Token ID: 42");
  });
});
