import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildGoldenFixtures,
  GOLDEN_FIXTURE_NAMES,
  GOLDEN_FIXTURES_DIR,
} from "./__fixtures__/generate.js";
import { compareArchives, summarizeArchive } from "./golden-compare.js";

function loadFixture(name: string): Buffer {
  return readFileSync(join(GOLDEN_FIXTURES_DIR, name));
}

describe("golden fixtures", () => {
  const regenerated = buildGoldenFixtures();

  for (const name of GOLDEN_FIXTURE_NAMES) {
    it(`${name}: regenerated archive matches checked-in bytes semantically`, () => {
      const result = compareArchives(regenerated[name], loadFixture(name));
      assert.deepEqual(result.diffs, []);
      assert.equal(result.ok, true);
    });

    it(`${name}: regenerated archive is byte-identical`, () => {
      assert.ok(regenerated[name].equals(loadFixture(name)));
    });
  }

  it("minimal: manifest first, zstd text, stored pdf", () => {
    const s = summarizeArchive(loadFixture("minimal.zipwiki"));
    assert.deepEqual(
      s.entries.map((e) => [e.name, e.method]),
      [
        ["META-INF/manifest.json", 93],
        ["wiki/parsed/doc.txt.md", 93],
        ["doc.txt", 93],
        ["sample.pdf", 0],
      ],
    );
    const pdf = s.entries.find((e) => e.name === "sample.pdf")!;
    assert.equal(pdf.uncompressedSize, "%PDF-1.4\n%%EOF\n".length);
    assert.equal(pdf.compressedSize, pdf.uncompressedSize);
    assert.ok(s.entries.every((e) => e.extraHex === "" && !e.origin));
    assert.equal((s.manifest as { format: string }).format, "neozip");
    assert.match(s.merkleRoot ?? "", /^[0-9a-f]{64}$/);
  });

  it("with-origin: 0x014F on parse members only", () => {
    const s = summarizeArchive(loadFixture("with-origin.zipwiki"));
    const withOrigin = s.entries.filter((e) => e.origin).map((e) => e.name);
    assert.deepEqual(withOrigin, [
      "wiki/parsed/doc.txt.md",
      "wiki/parsed/sample.pdf.md",
    ]);
    const pdfParse = s.entries.find((e) => e.name === "wiki/parsed/sample.pdf.md")!;
    assert.equal(pdfParse.origin?.originUri, "https://example.com/files/sample.pdf");
    assert.equal(pdfParse.origin?.originSize, "%PDF-1.4\n%%EOF\n".length);
    assert.ok(pdfParse.extraHex.startsWith("4f01")); // 0x014F little-endian
    assert.equal(pdfParse.localExtraHex, pdfParse.extraHex);
  });

  it("omit-original: no sample.pdf member, manifest says sourceIncluded=false", () => {
    const s = summarizeArchive(loadFixture("omit-original.zipwiki"));
    assert.ok(!s.entries.some((e) => e.name === "sample.pdf"));
    const primaries = (
      s.manifest as { ai: { primaries: { path: string; sourceIncluded?: boolean }[] } }
    ).ai.primaries;
    assert.equal(
      primaries.find((p) => p.path === "sample.pdf")?.sourceIncluded,
      false,
    );
  });

  it("all fixtures share one fixed DOS timestamp", () => {
    for (const name of GOLDEN_FIXTURE_NAMES) {
      const stamps = new Set(
        summarizeArchive(loadFixture(name)).entries.map(
          (e) => `${e.dosDate}:${e.dosTime}`,
        ),
      );
      assert.equal(stamps.size, 1, name);
    }
  });
});

describe("compareArchives", () => {
  const minimal = loadFixture("minimal.zipwiki");

  it("reports differing archives", () => {
    const result = compareArchives(loadFixture("with-origin.zipwiki"), minimal);
    assert.equal(result.ok, false);
    assert.ok(result.diffs.some((d) => d.startsWith("entry count")));
  });

  it("ignoreDosTime tolerates header timestamp drift", () => {
    const drifted = Buffer.from(minimal);
    // Patch DOS time in the first local header (offset 10) and central entry.
    const cdOffset = drifted.readUInt32LE(drifted.length - 22 + 16);
    drifted.writeUInt16LE(0x1234, 10);
    drifted.writeUInt16LE(0x1234, cdOffset + 12);
    assert.equal(compareArchives(drifted, minimal).ok, false);
    assert.equal(compareArchives(drifted, minimal, { ignoreDosTime: true }).ok, true);
  });

  it("detects a changed payload byte via CRC / payload hash", () => {
    const corrupt = Buffer.from(minimal);
    const pdfAt = corrupt.indexOf("%PDF-1.4");
    corrupt[pdfAt] = 0x58;
    const result = compareArchives(corrupt, minimal);
    assert.equal(result.ok, false);
    assert.ok(result.diffs.some((d) => d.includes("payloadSha256")));
  });
});
