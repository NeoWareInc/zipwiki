import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeZipBuffer } from "./nzip.js";
import {
  formatZipListing,
  formatOriginalsSummary,
  formatCompressionPercent,
  readZipEntryFromHandle,
  resetZipPreadBytes,
  useZipHandle,
  zipExtractLine,
  zipPreadBytes,
  type ZipListEntry,
} from "./zip-list.js";

describe("formatCompressionPercent", () => {
  it("uses one decimal above 90%, otherwise whole percents", () => {
    assert.equal(formatCompressionPercent(25_304, 3_958_966), "99.4%");
    assert.equal(formatCompressionPercent(25_000, 1_000_000), "97.5%");
    assert.equal(formatCompressionPercent(44_000, 100_000), "56%");
    assert.equal(formatCompressionPercent(100, 100), "0%");
  });
});

describe("zipExtractLine", () => {
  it("matches Info-ZIP / neounzip extracting, inflating, decompress", () => {
    assert.equal(
      zipExtractLine("wiki/okf/index.md", 93),
      "decompress: wiki/okf/index.md",
    );
    assert.equal(
      zipExtractLine("META-INF/manifest.json", 0),
      " extracting: META-INF/manifest.json",
    );
    assert.equal(
      zipExtractLine("a.txt", 8),
      "  inflating: a.txt",
    );
  });
});

describe("formatZipListing", () => {
  it("matches the Info-ZIP / neolist archive table", () => {
    const entries: ZipListEntry[] = [
      {
        name: "META-INF/manifest.json",
        method: 0,
        compressedSize: 6511,
        uncompressedSize: 6511,
        crc32: 0xd30f4f13,
        // 2026-09-03 11:18
        dosTime: (11 << 11) | (18 << 5),
        dosDate: ((2026 - 1980) << 9) | (9 << 5) | 3,
        extraFieldLength: 0,
        extra: Buffer.alloc(0),
        localHeaderOffset: 0,
      },
    ];
    const text = formatZipListing(entries, {
      archivePath: "sample-output/sample-docs.nzip",
    });
    const expected = [
      "Archive:  sample-output/sample-docs.nzip",
      "  Length  Method     Size Cmpr Date       Time   CRC-32    Name",
      "--------  ------  ------- ---- ---------- ----- --------  ----",
      "    6511  Stored     6511 0%   09-03-2026 11:18  d30f4f13  META-INF/manifest.json",
      "--------  ------  ------- ---- ---------- ----- --------  ----",
      "    6511             6511      0%   ",
    ].join("\n");
    assert.equal(text, expected);
  });
});

describe("formatOriginalsSummary", () => {
  it("reports document count, sizes, and Info-ZIP-style compression %", () => {
    const n = (x: number) => x.toLocaleString();
    assert.equal(
      formatOriginalsSummary({
        documentCount: 6,
        originalBytes: 1_000_000,
        archiveBytes: 25_000,
      }),
      `Originals: ${n(6)} documents, ${n(1_000_000)} bytes → archive ${n(25_000)} bytes (97.5%)`,
    );
    assert.equal(
      formatOriginalsSummary({
        documentCount: 1,
        originalBytes: 100,
        archiveBytes: 100,
      }),
      `Originals: ${n(1)} document, ${n(100)} bytes → archive ${n(100)} bytes (0%)`,
    );
    assert.equal(
      formatOriginalsSummary({
        documentCount: 6,
        originalBytes: 3_958_966,
        archiveBytes: 25_304,
      }),
      `Originals: ${n(6)} documents, ${n(3_958_966)} bytes → archive ${n(25_304)} bytes (99.4%)`,
    );
  });
});

describe("ranged central-directory reads", () => {
  it("lists without copying a large stored payload", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-pread-"));
    const zipPath = join(dir, "big.zipwiki");
    const huge = Buffer.alloc(2_000_000, 0x61);
    const note = Buffer.from("tiny okf card\n");
    writeFileSync(
      zipPath,
      writeZipBuffer(
        [
          { name: "huge.bin", data: huge },
          { name: "wiki/okf/note.md", data: note },
        ],
        { compression: "store" },
      ),
    );
    resetZipPreadBytes();
    useZipHandle(zipPath, (handle) => {
      assert.deepEqual(
        handle.entries.map((e) => e.name),
        ["huge.bin", "wiki/okf/note.md"],
      );
      assert.equal(
        readZipEntryFromHandle(handle, "wiki/okf/note.md").toString("utf8"),
        "tiny okf card\n",
      );
    });
    assert.ok(
      zipPreadBytes < 100_000,
      `handle list+small read pread ${zipPreadBytes} bytes, expected << huge.bin`,
    );
  });
});
