import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { openNzip } from "./open";
import { queryPackage, readPackageFollow, searchPackagePhrase } from "./query";
import { testArchiveIntegrity } from "./integrity";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(
  here,
  "../../../../zipwiki/src/lib/archive/__fixtures__/minimal.zipwiki",
);

async function openFixture() {
  const file = fs.readFileSync(fixture);
  const buf = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  return openNzip(buf, "minimal.zipwiki");
}

describe("minimal.zipwiki through ZipReaderBrowser", () => {
  it("lists entries and the manifest primaries", async () => {
    const summary = await openFixture();
    assert.equal(summary.entryCount, 4);
    assert.equal(summary.primaries.length, 2);
    assert.deepEqual(summary.parsed, ["wiki/parsed/doc.txt.md"]);
  });

  it("queryPackage finds parsed evidence for a doc.txt question", async () => {
    const { reader } = await openFixture();
    const found = await queryPackage(reader, "golden fixture primary");
    assert.ok(found.hits.length > 0);
    assert.equal(found.hits[0]!.kind, "parsed");
    assert.equal(found.hits[0]!.path, "wiki/parsed/doc.txt.md");
    assert.ok(found.excerpts.length > 0);
    assert.equal(found.skipped.length, 0);
  });

  it("queryPackage returns an empty structure for an empty query", async () => {
    const { reader } = await openFixture();
    const found = await queryPackage(reader, "   ");
    assert.deepEqual(found.hits, []);
    assert.deepEqual(found.excerpts, []);
  });

  it("searchPackagePhrase and readPackageFollow read stored text", async () => {
    const { reader } = await openFixture();
    const hits = await searchPackagePhrase(reader, "golden fixture primary text");
    assert.ok(hits.some((h) => h.path === "doc.txt"));
    const loaded = await readPackageFollow(reader, "wiki/parsed/doc.txt.md");
    assert.ok(!("error" in loaded));
    if (!("error" in loaded)) assert.match(loaded.text, /Parsed extract/);
    const pdf = await readPackageFollow(reader, "sample.pdf");
    assert.ok("error" in pdf);
  });

  it("testArchiveIntegrity passes every file", async () => {
    const { reader } = await openFixture();
    const seen: string[] = [];
    const lines = await testArchiveIntegrity(reader, (l) => seen.push(l.name));
    assert.equal(lines.length, 4);
    assert.ok(lines.every((l) => l.ok));
    assert.equal(seen.length, 4);
  });
});
