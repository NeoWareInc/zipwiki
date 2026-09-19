import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EF_NZIP_ORIGIN,
  ORIGIN_EXTRA_VERSION,
  concatExtraFields,
  makeOriginExtra,
  originCrc32Hex,
  originCrc32Of,
  originLocatorFromOriginal,
  originSha256Of,
  originToApiFields,
  parseOriginFromExtra,
  unixTimeSeconds,
} from "./origin-extra.js";

describe("origin-extra 0x014F", () => {
  it("round-trips v1 URI, CRC-32, size, Unix mtime, and SHA-256", () => {
    const uri = "https://laws.flrules.org/2025/1";
    const body = Buffer.from("pdf-bytes");
    const crc = originCrc32Of(body);
    const sha = originSha256Of(body);
    const mtime = unixTimeSeconds(new Date("2020-06-15T18:30:44Z"));
    const extra = makeOriginExtra({
      uri,
      crc32: crc,
      size: body.length,
      mtime,
      sha256: sha,
    });
    assert.equal(extra.readUInt16LE(0), EF_NZIP_ORIGIN);
    assert.equal(ORIGIN_EXTRA_VERSION, 0x01);
    assert.equal(extra.readUInt8(4), ORIGIN_EXTRA_VERSION);
    const parsed = parseOriginFromExtra(extra);
    assert.deepEqual(
      { ...parsed, sha256: parsed?.sha256 && Buffer.from(parsed.sha256) },
      {
        uri,
        crc32: crc,
        size: body.length,
        mtime,
        sha256: sha,
      },
    );
    assert.deepEqual(originToApiFields(parsed), {
      originUri: uri,
      originCrc32: originCrc32Hex(crc),
      originSize: body.length,
      originMtime: mtime,
      originMtimeUtc: "2020-06-15T18:30:44Z",
      originSha256: sha.toString("hex"),
    });
  });

  it("omits CRC, size, or mtime when unknown", () => {
    const uriOnly = parseOriginFromExtra(
      makeOriginExtra({ uri: "https://example.org/a" }),
    );
    assert.deepEqual(uriOnly, { uri: "https://example.org/a" });
    assert.equal(uriOnly?.crc32, undefined);

    const statsOnly = parseOriginFromExtra(
      makeOriginExtra({ crc32: 0, size: 0, mtime: 0 }),
    );
    assert.deepEqual(statsOnly, { crc32: 0, size: 0, mtime: 0 });
    assert.equal(statsOnly?.uri, undefined);
  });

  it("omits SHA-256 unless requested", () => {
    const extra = makeOriginExtra({ uri: "https://example.org/a", size: 1 });
    assert.equal(parseOriginFromExtra(extra)?.sha256, undefined);
  });

  it("originLocatorFromOriginal writes CRC-32 by default, SHA-256 instead of CRC when requested", () => {
    const body = Buffer.from("pdf-bytes");
    const crcOnly = originLocatorFromOriginal({ data: body });
    assert.equal(crcOnly.crc32, originCrc32Of(body));
    assert.equal(crcOnly.sha256, undefined);

    const shaOnly = originLocatorFromOriginal({
      data: body,
      includeSha256: true,
    });
    assert.equal(shaOnly.crc32, undefined);
    assert.deepEqual(shaOnly.sha256, originSha256Of(body));
  });

  it("skips unknown TLV tags (forward compatible)", () => {
    const inner = makeOriginExtra({ uri: "https://example.org/x", size: 12 });
    // Inject tag 0x7F / len 3 / "abc" before the URI record (after version).
    const injected = Buffer.concat([
      inner.subarray(0, 5),
      Buffer.from([0x7f, 0x03, 0x00, 0x61, 0x62, 0x63]),
      inner.subarray(5),
    ]);
    injected.writeUInt16LE(inner.readUInt16LE(2) + 6, 2);
    const parsed = parseOriginFromExtra(injected);
    assert.equal(parsed?.uri, "https://example.org/x");
    assert.equal(parsed?.size, 12);
  });

  it("parses after 0x014E block", () => {
    const sha = Buffer.alloc(36);
    sha.writeUInt16LE(0x014e, 0);
    sha.writeUInt16LE(32, 2);
    const uri = "https://example.org/a";
    const crc = 0xabcd1234;
    const combined = concatExtraFields(
      sha,
      makeOriginExtra({ crc32: crc, uri }),
    );
    assert.equal(parseOriginFromExtra(combined)?.uri, uri);
    assert.equal(parseOriginFromExtra(combined)?.crc32, crc >>> 0);
  });

  it("skips unknown version", () => {
    const bad = Buffer.alloc(4 + 5);
    bad.writeUInt16LE(EF_NZIP_ORIGIN, 0);
    bad.writeUInt16LE(5, 2);
    bad.writeUInt8(0x99, 4);
    bad.writeUInt32LE(1, 5);
    assert.equal(parseOriginFromExtra(bad), null);
  });

  it("rejects an empty locator", () => {
    assert.throws(() => makeOriginExtra({}), /at least one attribute/);
  });
});
