import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ZIP_METHOD_DEFLATE,
  ZIP_METHOD_STORE,
  ZIP_METHOD_ZSTD,
  compressZipPayload,
  resolveCompressionAlg,
  shouldStoreBySuffix,
} from "./compress.js";

describe("compress", () => {
  it("defaults to zstd", () => {
    assert.equal(resolveCompressionAlg({}), "zstd");
    assert.equal(resolveCompressionAlg({ level: 6 }), "zstd");
  });

  it("stores at level 0 and for suffixes", () => {
    assert.equal(resolveCompressionAlg({ level: 0 }), "store");
    assert.equal(
      resolveCompressionAlg({ entryName: "a.pdf", compression: "zstd" }),
      "store",
    );
    assert.ok(shouldStoreBySuffix("docs/x.PNG", [".png"]));
  });

  it("forces deflate for legacy", () => {
    assert.equal(resolveCompressionAlg({ legacy: true }), "deflate");
    assert.equal(resolveCompressionAlg({ deflate: true }), "deflate");
  });

  it("compresses payload and falls back to store when tiny", () => {
    const tiny = compressZipPayload(Buffer.from("hi"), { compression: "zstd" });
    assert.equal(tiny.method, ZIP_METHOD_STORE);

    const big = Buffer.from("hello world ".repeat(2000));
    const z = compressZipPayload(big, { compression: "zstd", level: 6 });
    assert.equal(z.method, ZIP_METHOD_ZSTD);
    assert.ok(z.compressedSize < z.uncompressedSize);

    const d = compressZipPayload(big, { compression: "deflate", level: 6 });
    assert.equal(d.method, ZIP_METHOD_DEFLATE);
    assert.ok(d.compressedSize < d.uncompressedSize);
  });
});
