import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, describe, it } from "node:test";
import { originCrc32Hex, originCrc32Of, writeNzipCollectionBundle } from "../archive/index.js";
import { AccessError } from "./resolve.js";
import {
  extractWithOrigin,
  fetchOrigin,
  lookupOrigin,
  readParsed,
} from "./index.js";

describe("origin lookup and fetch", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipaccess-origin-"));
  const original = join(dir, "lease.txt");
  const body = Buffer.from("Commercial lease for 100 Main Street warehouse.\n");
  writeFileSync(original, body);
  const uri = pathToFileURL(original).href;
  const out = join(dir, "kb.zipwiki");

  writeNzipCollectionBundle({
    outputPath: out,
    members: [
      {
        originalPath: original,
        originalName: "lease.txt",
        structuredMarkdown: "# Lease\n\nWarehouse terms.\n",
        originUri: uri,
      },
    ],
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lookupOrigin finds 0x014F by parsed path, primary, or name", () => {
    const expectedCrc = originCrc32Of(body);
    for (const selector of [
      "wiki/parsed/lease.txt.md",
      "lease.txt",
      "lease.txt.md",
    ]) {
      const loc = lookupOrigin({ package: out, path: selector });
      assert.equal(loc.parsedPath, "wiki/parsed/lease.txt.md");
      assert.equal(loc.primaryPath, "lease.txt");
      assert.equal(loc.originUri, uri);
      assert.equal(loc.originCrc32, originCrc32Hex(expectedCrc));
      assert.equal(loc.originSize, body.length);
      assert.ok(loc.originMtimeUtc);
      assert.match(loc.originMtimeUtc ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it("readParsed includes origin metadata", () => {
    const read = readParsed({ package: out, name: "lease.txt" });
    assert.ok(read.origin);
    assert.equal(read.origin!.originUri, uri);
    assert.equal(read.origin!.originCrc32, originCrc32Hex(originCrc32Of(body)));
  });

  it("fetchOrigin verifies CRC-32 against the saved tag", async () => {
    const result = await fetchOrigin({
      package: out,
      path: "lease.txt",
    });
    assert.equal(result.verified, true);
    assert.equal(result.crc32.matched, true);
    assert.equal(result.crc32.expected, originCrc32Hex(originCrc32Of(body)));
    assert.equal(result.bytes, body.length);
    assert.equal(result.path, undefined);
  });

  it("fetchOrigin writes the original when dest is set", async () => {
    const dest = join(dir, "downloaded-lease.txt");
    const result = await fetchOrigin({
      package: out,
      path: "wiki/parsed/lease.txt.md",
      dest,
    });
    assert.equal(result.verified, true);
    assert.equal(result.path, dest);
    assert.equal(readFileSync(dest).equals(body), true);

    writeFileSync(dest, "stale");
    const again = await fetchOrigin({
      package: out,
      path: "wiki/parsed/lease.txt.md",
      dest,
      overwrite: true,
    });
    assert.equal(again.path, dest);
    assert.equal(readFileSync(dest).equals(body), true);
  });

  it("extract --fetch-origin writes originals after CRC check", async () => {
    const dest = join(dir, "extract-out");
    const result = await extractWithOrigin({
      package: out,
      dest,
      paths: ["wiki/parsed/lease.txt.md"],
      fetchOrigin: true,
    });
    assert.equal(result.extracted.length, 1);
    assert.equal(result.origins.length, 1);
    assert.equal(result.origins[0]!.verified, true);
    assert.equal(
      readFileSync(result.origins[0]!.path!).equals(body),
      true,
    );
  });

  it("fetchOrigin fails when the file no longer matches saved CRC", async () => {
    const tampered = join(dir, "tampered.txt");
    writeFileSync(tampered, body);
    const pack = join(dir, "tamper.zipwiki");
    writeNzipCollectionBundle({
      outputPath: pack,
      members: [
        {
          originalPath: tampered,
          originalName: "lease.txt",
          structuredMarkdown: "# Lease\n",
          originUri: pathToFileURL(tampered).href,
        },
      ],
    });
    writeFileSync(tampered, Buffer.from("changed-bytes"));
    await assert.rejects(
      () => fetchOrigin({ package: pack, path: "lease.txt" }),
      (err: unknown) => {
        assert.ok(err instanceof AccessError);
        assert.equal(err.code, "integrity_failed");
        return /crc32/i.test(err.message);
      },
    );
  });
});
