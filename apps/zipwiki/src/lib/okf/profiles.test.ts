import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeNzipCollectionBundle } from "../archive/nzip.js";
import { readZipEntry } from "../archive/zip-list.js";
import {
  okfProfileInstruction,
  parseOkfProfileFlag,
  resolveOkfProfile,
  sampleFor,
} from "./profiles.js";

describe("OKF profiles", () => {
  it("treats epub as book under auto and keeps other files generic", () => {
    assert.equal(resolveOkfProfile({ fileName: "tale.epub" }), "book");
    assert.equal(
      resolveOkfProfile({ explicit: "auto", fileName: "statute.pdf" }),
      "generic",
    );
    assert.equal(
      resolveOkfProfile({ explicit: "invoice", fileName: "tale.epub" }),
      "invoice",
    );
  });

  it("rejects an unknown flag", () => {
    assert.throws(() => parseOkfProfileFlag("novel"), /Unknown OKF profile/);
    assert.equal(parseOkfProfileFlag(undefined), undefined);
    assert.equal(parseOkfProfileFlag("Book"), "book");
  });

  it("sends a book opening and ending, and a prefix for other profiles", () => {
    const middle = "M".repeat(8_000);
    const text = `${"H".repeat(6_000)}${middle}${"T".repeat(6_000)}`;
    const book = sampleFor("book", text);
    assert.ok(book.startsWith("H"));
    assert.ok(book.endsWith("T"));
    assert.ok(book.includes("[…later in the document…]"));
    assert.equal(book.includes("M"), false);
    const law = sampleFor("legislation", text);
    assert.ok(law.startsWith("H"));
    assert.equal(law.includes("T"), false);
    assert.equal(sampleFor("invoice", "short invoice"), "short invoice");
  });

  it("names the facts each profile should write", () => {
    assert.match(okfProfileInstruction("book"), /distinctive line/);
    assert.match(okfProfileInstruction("legislation"), /jurisdiction/);
    assert.match(okfProfileInstruction("invoice"), /invoice number/);
    assert.equal(okfProfileInstruction("generic"), "");
  });

  it("stores the profile on the manifest primary", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-okf-profile-"));
    const source = join(dir, "tale.epub");
    const output = join(dir, "tale.zipwiki");
    try {
      writeFileSync(source, "not a real epub");
      writeNzipCollectionBundle({
        outputPath: output,
        members: [
          {
            originalPath: source,
            originalName: "tale.epub",
            documentType: "Generic",
            okfProfile: "book",
            structuredMarkdown: "# Tale\n\nIt was the best of times.\n",
          },
        ],
      });
      const manifest = JSON.parse(
        readZipEntry(output, "META-INF/manifest.json").toString("utf8"),
      ) as { ai?: { primaries?: Array<{ okfProfile?: string }> } };
      assert.equal(manifest.ai?.primaries?.[0]?.okfProfile, "book");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
