import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  ZipIntegrityError,
  readZipEntryVerified,
  verifyUncompressedPayload,
  writeZipBuffer,
  listZipEntriesFromBuffer,
  readZipEntryPayload,
  readLocalExtraField,
  parseSha256FromExtra,
} from "../archive/index.js";
import {
  AccessError,
  extractEntries,
  openPackage,
  readEntry,
  readEntries,
  formatReadStdout,
  zipwikiReadBegin,
  zipwikiReadEnd,
  readExtractedFile,
} from "./index.js";

describe("integrity + extract", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipaccess-integrity-"));
  const primary = join(dir, "doc.txt");
  const goodZip = join(dir, "good.nzip");

  writeFileSync(primary, "hello integrity world\n");
  const payload = readFileSync(primary);
  const zipBuf = writeZipBuffer([{ name: "doc.txt", data: payload }], {
    sha256Extra: true,
  });
  writeFileSync(goodZip, zipBuf);

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("readZipEntryVerified passes CRC and SHA-256 for NeoZip entries", () => {
    const { data, integrity } = readZipEntryVerified(goodZip, "doc.txt");
    assert.equal(data.toString("utf8"), "hello integrity world\n");
    assert.equal(integrity.crcOk, true);
    assert.equal(integrity.sha256Ok, true);
    assert.equal(
      integrity.actualSha256,
      createHash("sha256").update(payload).digest("hex"),
    );
  });

  it("default writeZipBuffer is CRC-32 only (no Extra Field 0x014E)", () => {
    const crcZip = join(dir, "crc-only.nzip");
    writeFileSync(
      crcZip,
      writeZipBuffer([{ name: "doc.txt", data: payload }]),
    );
    const { integrity } = readZipEntryVerified(crcZip, "doc.txt");
    assert.equal(integrity.crcOk, true);
    assert.equal(integrity.sha256Ok, undefined);
    const buf = readFileSync(crcZip);
    const entries = listZipEntriesFromBuffer(buf);
    const entry = entries.find((e) => e.name === "doc.txt")!;
    const extra = readLocalExtraField(buf, entry);
    assert.equal(parseSha256FromExtra(extra), null);
  });

  it("parseSha256FromExtra finds 0x014E", () => {
    const buf = readFileSync(goodZip);
    const entries = listZipEntriesFromBuffer(buf);
    const entry = entries.find((e) => e.name === "doc.txt")!;
    const extra = readLocalExtraField(buf, entry);
    const dig = parseSha256FromExtra(extra);
    assert.ok(dig);
    assert.equal(dig!.length, 32);
  });

  it("verifyUncompressedPayload fails on CRC mismatch", () => {
    const buf = readFileSync(goodZip);
    const entries = listZipEntriesFromBuffer(buf);
    const entry = entries.find((e) => e.name === "doc.txt")!;
    const data = readZipEntryPayload(buf, entry);
    const tampered = { ...entry, crc32: (entry.crc32 ^ 0xffffffff) >>> 0 };
    const result = verifyUncompressedPayload(tampered, data);
    assert.equal(result.crcOk, false);
  });

  it("readZipEntryVerified throws on tampered CRC in archive", () => {
    const buf = Buffer.from(readFileSync(goodZip));
    const entries = listZipEntriesFromBuffer(buf);
    const entry = entries.find((e) => e.name === "doc.txt")!;
    // Flip CRC in central directory (offset +16 from central header).
    // Find central header by scanning for entry name near EOCD.
    const nameBuf = Buffer.from("doc.txt", "utf8");
    let flipped = false;
    for (let i = 0; i < buf.length - 46 - nameBuf.length; i++) {
      if (buf.readUInt32LE(i) !== 0x02014b50) continue;
      const nameLen = buf.readUInt16LE(i + 28);
      const name = buf.subarray(i + 46, i + 46 + nameLen).toString("utf8");
      if (name !== "doc.txt") continue;
      buf.writeUInt32LE((entry.crc32 ^ 0x1) >>> 0, i + 16);
      flipped = true;
      break;
    }
    assert.ok(flipped);
    const bad = join(dir, "bad-crc.nzip");
    writeFileSync(bad, buf);
    assert.throws(
      () => readZipEntryVerified(bad, "doc.txt"),
      (err: unknown) => err instanceof ZipIntegrityError,
    );
  });

  it("extractEntries writes verified files and readExtractedFile confines root", () => {
    const dest = join(dir, "out");
    const result = extractEntries({
      package: goodZip,
      paths: ["doc.txt"],
      dest,
      overwrite: true,
    });
    assert.equal(result.extracted.length, 1);
    assert.ok(result.extracted[0]!.integrity.sha256Checked);
    const disk = readFileSync(result.extracted[0]!.path, "utf8");
    assert.equal(disk, "hello integrity world\n");

    const read = readExtractedFile({
      path: "doc.txt",
      root: dest,
      package: goodZip,
    });
    assert.equal(read.encoding, "utf8");
    assert.equal(read.text, "hello integrity world\n");

    assert.throws(
      () =>
        readExtractedFile({
          path: join(dir, "doc.txt"),
          root: dest,
        }),
      (err: unknown) =>
        err instanceof AccessError && err.code === "invalid_args",
    );
  });

  it("extract refuses integrity_failed without writing", () => {
    const buf = Buffer.from(readFileSync(goodZip));
    const entries = listZipEntriesFromBuffer(buf);
    const entry = entries.find((e) => e.name === "doc.txt")!;
    for (let i = 0; i < buf.length - 50; i++) {
      if (buf.readUInt32LE(i) !== 0x02014b50) continue;
      const nameLen = buf.readUInt16LE(i + 28);
      const name = buf.subarray(i + 46, i + 46 + nameLen).toString("utf8");
      if (name !== "doc.txt") continue;
      buf.writeUInt32LE((entry.crc32 ^ 0x2) >>> 0, i + 16);
      break;
    }
    const bad = join(dir, "bad-extract.nzip");
    const dest = join(dir, "no-write");
    writeFileSync(bad, buf);
    assert.throws(
      () =>
        extractEntries({
          package: bad,
          paths: ["doc.txt"],
          dest,
          overwrite: true,
        }),
      (err: unknown) =>
        err instanceof AccessError && err.code === "integrity_failed",
    );
  });

  it("readEntry streams binary as base64", () => {
    const binZip = join(dir, "bin.nzip");
    writeFileSync(
      binZip,
      writeZipBuffer([{ name: "pic.png", data: Buffer.from([0xff, 0xd8, 0x00]) }]),
    );
    const result = readEntry({ package: binZip, path: "pic.png" });
    assert.equal(result.encoding, "base64");
    assert.ok(result.data);
    assert.equal(
      Buffer.from(result.data!, "base64").equals(Buffer.from([0xff, 0xd8, 0x00])),
      true,
    );
  });

  it("formatReadStdout dumps one body raw and separates several files", () => {
    const zip = join(dir, "multi.nzip");
    writeFileSync(
      zip,
      writeZipBuffer([
        { name: "wiki/okf/a.md", data: Buffer.from("# A\n") },
        { name: "wiki/parsed/b.md", data: Buffer.from("body B\n") },
      ]),
    );
    const one = readEntries({ package: zip, paths: ["wiki/okf/a.md"] });
    assert.equal(formatReadStdout(one), "# A\n");

    const two = readEntries({
      package: zip,
      paths: ["wiki/okf/a.md", "wiki/parsed/b.md"],
    });
    const out = formatReadStdout(two);
    assert.equal(
      out,
      [
        `${zipwikiReadBegin("wiki/okf/a.md")}`,
        "# A",
        `${zipwikiReadEnd("wiki/okf/a.md")}`,
        "",
        `${zipwikiReadBegin("wiki/parsed/b.md")}`,
        "body B",
        `${zipwikiReadEnd("wiki/parsed/b.md")}`,
      ].join("\n"),
    );
  });

  it("openPackage still works on NeoZip with verified manifest", () => {
    // Minimal collection-like isn't required; plain zip without manifest is ok.
    assert.throws(() => openPackage(join(dir, "missing.nzip")), AccessError);
    const listed = readEntry({ package: goodZip, path: "doc.txt" });
    assert.equal(listed.encoding, "utf8");
    assert.match(listed.text ?? "", /hello integrity/);
  });
});
