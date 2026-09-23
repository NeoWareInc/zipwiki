import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  originLocatorFromOriginal,
  parseOriginFromExtra,
  readCompressedPayload,
  readLocalExtraField,
  listZipEntriesFromBuffer,
  writeZipBuffer,
} from "./index.js";
import {
  copyArchiveWithZipCopyNode,
  copyZipMember,
  hasProofSidecars,
  loadCopyableArchive,
  nextAvailablePrimaryPath,
  logicalPrimaryFromUserKey,
  resolveExistingPrimaryPath,
  sortPackOrder,
  writeArchiveAtomic,
} from "./rewrite.js";

describe("rewrite helpers", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipwiki-rewrite-"));
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("nextAvailablePrimaryPath freezes existing paths", () => {
    assert.equal(nextAvailablePrimaryPath("report.pdf", []), "report.pdf");
    assert.equal(
      nextAvailablePrimaryPath("report.pdf", ["report.pdf"]),
      "content/2/report.pdf",
    );
    assert.equal(
      nextAvailablePrimaryPath("report.pdf", [
        "report.pdf",
        "content/2/report.pdf",
      ]),
      "content/3/report.pdf",
    );
  });

  it("resolveExistingPrimaryPath exact wins; ambiguous basename errors", () => {
    assert.equal(
      resolveExistingPrimaryPath("report.pdf", [
        "report.pdf",
        "content/2/report.pdf",
      ]),
      "report.pdf",
    );
    assert.equal(
      resolveExistingPrimaryPath("content/2/report.pdf", [
        "report.pdf",
        "content/2/report.pdf",
      ]),
      "content/2/report.pdf",
    );
    assert.equal(
      logicalPrimaryFromUserKey("wiki/parsed/report.pdf.md"),
      "report.pdf",
    );
    assert.equal(
      resolveExistingPrimaryPath("wiki/parsed/report.pdf.md", ["report.pdf"]),
      "report.pdf",
    );
    assert.equal(
      resolveExistingPrimaryPath("property-deed", ["property-deed.pdf"]),
      "property-deed.pdf",
    );
    assert.throws(
      () =>
        resolveExistingPrimaryPath("report.pdf", [
          "content/2/report.pdf",
          "content/3/report.pdf",
        ]),
      /Ambiguous primary/,
    );
    assert.throws(
      () => resolveExistingPrimaryPath("missing.pdf", ["a.txt"]),
      /Primary not found: missing\.pdf \(have: a\.txt\)/,
    );
  });

  it("hasProofSidecars detects TOKEN/TIMESTAMP", () => {
    assert.deepEqual(hasProofSidecars(["META-INF/manifest.json"]), []);
    assert.deepEqual(hasProofSidecars(["META-INF/TOKEN.NZIP"]), [
      "META-INF/TOKEN.NZIP",
    ]);
  });

  it("copies compressed payload, extras, and DOS mtime", () => {
    const mtime = new Date("2020-06-15T12:30:00");
    const data = Buffer.alloc(4000, 0x41);
    const origin = originLocatorFromOriginal({
      data,
      mtime,
      uri: "https://example.com/keep.pdf",
    });
    const zipPath = join(dir, "copy.zipwiki");
    const original = writeZipBuffer(
      [{ name: "keep.pdf", data, mtime, origin }],
      { compression: "zstd" },
    );
    writeFileSync(zipPath, original);
    const listed0 = listZipEntriesFromBuffer(original);
    const keep0 = listed0.find((e) => e.name === "keep.pdf")!;
    const extra0 = readLocalExtraField(original, keep0);
    const compressed0 = readCompressedPayload(original, keep0);

    const loaded = loadCopyableArchive(zipPath);
    assert.ok(loaded.entries[0]?.precompressed);
    const rewritten = writeZipBuffer(sortPackOrder(loaded.entries), {
      compression: "deflate",
    });
    const listed1 = listZipEntriesFromBuffer(rewritten);
    const keep1 = listed1.find((e) => e.name === "keep.pdf")!;
    assert.equal(keep1.method, keep0.method);
    assert.equal(keep1.crc32, keep0.crc32);
    assert.equal(keep1.dosTime, keep0.dosTime);
    assert.equal(keep1.dosDate, keep0.dosDate);
    assert.deepEqual(readCompressedPayload(rewritten, keep1), compressed0);
    const extra1 = readLocalExtraField(rewritten, keep1);
    assert.deepEqual(extra1, extra0);
    const loc = parseOriginFromExtra(extra1);
    assert.equal(loc?.uri, "https://example.com/keep.pdf");
    assert.equal(loc?.size, data.length);
  });

  it("ZipCopyNode keeps 0x014F without recompressing", async () => {
    const data = Buffer.alloc(4000, 0x42);
    const origin = originLocatorFromOriginal({
      data,
      mtime: new Date("2020-06-15T12:30:00"),
      uri: "https://example.com/copied.pdf",
    });
    const source = join(dir, "copy-source.zipwiki");
    const dest = join(dir, "copy-dest.zipwiki");
    writeFileSync(
      source,
      writeZipBuffer([{ name: "keep.pdf", data, origin }], { compression: "zstd" }),
    );
    const before = listZipEntriesFromBuffer(readFileSync(source)).find(
      (e) => e.name === "keep.pdf",
    )!;
    await copyArchiveWithZipCopyNode(source, dest);
    const after = listZipEntriesFromBuffer(readFileSync(dest)).find(
      (e) => e.name === "keep.pdf",
    )!;
    assert.equal(after.method, before.method);
    assert.equal(after.crc32, before.crc32);
    assert.equal(after.originUri, "https://example.com/copied.pdf");
    assert.deepEqual(
      readCompressedPayload(readFileSync(dest), after),
      readCompressedPayload(readFileSync(source), before),
    );
  });

  it("copyZipMember keeps precompressed slice", () => {
    const data = Buffer.from("hello zip\n");
    const buf = writeZipBuffer([{ name: "a.txt", data }], {
      compression: "store",
    });
    const listed = listZipEntriesFromBuffer(buf)[0]!;
    const entry = copyZipMember(buf, listed, data);
    assert.equal(entry.precompressed?.method, 0);
    assert.deepEqual(entry.precompressed?.data, data);
  });

  it("loadCopyableArchive refuses proof sidecars", () => {
    const zipPath = join(dir, "proof.zipwiki");
    writeFileSync(
      zipPath,
      writeZipBuffer([
        { name: "doc.txt", data: Buffer.from("x") },
        { name: "META-INF/TOKEN.NZIP", data: Buffer.from("{}") },
      ]),
    );
    assert.throws(() => loadCopyableArchive(zipPath), /proof sidecars/);
  });

  it("writeArchiveAtomic replaces dest", () => {
    const dest = join(dir, "atomic.zipwiki");
    writeArchiveAtomic(dest, Buffer.from("abc"));
    assert.equal(readFileSync(dest, "utf8"), "abc");
    writeArchiveAtomic(dest, Buffer.from("xyz"));
    assert.equal(readFileSync(dest, "utf8"), "xyz");
  });
});
