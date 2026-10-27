import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readZipEntryVerifiedFromBuffer } from "./integrity.js";
import { contentMerkleRoot } from "./merkle.js";
import { buildZipWithKitMerkle, toKitMember } from "./neozipkit-writer.js";
import { writeZipBuffer } from "./nzip.js";
import { listZipEntriesFromBuffer } from "./zip-list.js";

describe("neozipkit writer adapter", () => {
  const text = Buffer.from("hello neozipkit\n".repeat(40));

  it("maps store suffixes and level 0 to method 0", () => {
    assert.equal(toKitMember({ name: "a.pdf", data: text }).method, 0);
    assert.equal(toKitMember({ name: "a.txt", data: text }).method, 93);
    assert.equal(toKitMember({ name: "a.txt", data: text }, { level: 0 }).method, 0);
    assert.equal(toKitMember({ name: "a.txt", data: text }, { legacy: true }).method, 8);
  });

  it("writes 0x014E and 0x014F and round-trips with verification", () => {
    const zip = writeZipBuffer(
      [{ name: "a.txt", data: text, origin: { uri: "https://example.com/a.txt", size: text.length } }],
      { sha256Extra: true },
    );
    const [e] = listZipEntriesFromBuffer(zip);
    assert.equal(e!.originUri, "https://example.com/a.txt");
    assert.ok(e!.extra.length > 36);
    const read = readZipEntryVerifiedFromBuffer(zip, "a.txt");
    assert.deepEqual(read.data, text);
    assert.equal(read.integrity.sha256Ok, true);
  });

  it("kit Merkle v1 matches contentMerkleRoot and skips META-INF", () => {
    const entries = [
      { name: "META-INF/manifest.json", data: Buffer.from("{}") },
      { name: "b.txt", data: Buffer.from("b") },
      { name: "a.txt", data: text },
    ];
    const built = buildZipWithKitMerkle(entries);
    assert.equal(
      built.merkleRoot,
      contentMerkleRoot([
        { path: "a.txt", content: text },
        { path: "b.txt", content: Buffer.from("b") },
      ]),
    );
  });
});
