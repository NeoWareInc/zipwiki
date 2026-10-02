import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { writeNzipCollectionBundle } from "../archive/index.js";
import {
  NO_EXTRACT_REASON,
  queryArchive,
  queryReadKind,
  readFollow,
} from "./evidence.js";

const dir = mkdtempSync(join(tmpdir(), "zipwiki-evidence-"));
const deed = join(dir, "deed.pdf");
const notes = join(dir, "notes.txt");
const legacy = join(dir, "legacy.docx");
const other = join(dir, "other.pdf");
const pkg = join(dir, "sample.zipwiki");

writeFileSync(deed, "%PDF-1.1\n");
writeFileSync(notes, "The warehouse rent is 4400 dollars per month.\n");
writeFileSync(legacy, "SECRET-UNPARSED-SENTENCE inside the office file.\n");
writeFileSync(other, "%PDF-1.1\n");

writeNzipCollectionBundle({
  outputPath: pkg,
  members: [
    {
      originalPath: deed,
      originalName: "deed.pdf",
      structuredMarkdown:
        "# Deed\n\nThe grantor conveyed the oak street parcel.\n",
    },
    {
      originalPath: notes,
      originalName: "notes.txt",
    },
    {
      originalPath: legacy,
      originalName: "legacy.docx",
    },
    {
      originalPath: other,
      originalName: "other.pdf",
      structuredMarkdown: "UNRELATED-PARSED-SENTENCE should stay unread.\n",
    },
  ],
  okf: {
    version: "0.2",
    files: [
      {
        name: "deed.md",
        data: [
          "---",
          'title: "Deed"',
          "tags: [deed]",
          "sources:",
          "  - resource: ../parsed/deed.pdf.md",
          "---",
          "",
          "Concept for the parcel.",
          "",
        ].join("\n"),
      },
      {
        name: "notes.md",
        data: [
          "---",
          'title: "Notes"',
          "tags: [notes]",
          "sources:",
          "  - resource: ../../notes.txt",
          "---",
          "",
          "Concept for the 4400 rent.",
          "",
        ].join("\n"),
      },
      {
        name: "legacy.md",
        data: [
          "---",
          'title: "Legacy"',
          "tags: [legacy]",
          "sources:",
          "  - resource: ../../legacy.docx",
          "---",
          "",
          "Concept for the legacy file.",
          "",
        ].join("\n"),
      },
      {
        name: "index.md",
        data: "---\nokf_version: \"0.2\"\n---\n\n# Files\n",
      },
    ],
  },
});

describe("local query evidence", () => {
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads cited parses and stored text, and gaps an unparsed binary", () => {
    const result = queryArchive({
      package: pkg,
      query: "parcel 4400 legacy",
    });
    const dumped = JSON.stringify(result);
    const passages = result.hits.flatMap((hit) => hit.passages ?? []);
    const gaps = result.hits.flatMap((hit) => hit.gaps ?? []);
    assert.ok(
      passages.some(
        (passage) =>
          passage.path === "wiki/parsed/deed.pdf.md" &&
          passage.text.includes("oak street parcel"),
      ),
    );
    assert.ok(
      passages.some(
        (passage) =>
          passage.path === "notes.txt" && passage.text.includes("4400"),
      ),
    );
    assert.ok(
      gaps.some(
        (gap) => gap.path === "legacy.docx" && gap.reason === NO_EXTRACT_REASON,
      ),
    );
    assert.equal(dumped.includes("SECRET-UNPARSED-SENTENCE"), false);
    assert.equal(dumped.includes("UNRELATED-PARSED-SENTENCE"), false);
  });

  it("reads a stored text primary and refuses the unparsed binary", () => {
    assert.equal(queryReadKind("notes.txt"), "text");
    assert.equal(queryReadKind("wiki/parsed/deed.pdf.md"), "text");
    assert.equal(queryReadKind("legacy.docx"), "binary");
    assert.equal(queryReadKind("../notes.txt"), "reject");
    const text = readFollow(pkg, "notes.txt");
    assert.ok("text" in text && text.text.includes("4400"));
    const refused = readFollow(pkg, "legacy.docx");
    assert.deepEqual(refused, { error: NO_EXTRACT_REASON });
    const parsed = readFollow(pkg, "wiki/parsed/deed.pdf.md");
    assert.ok("text" in parsed && parsed.text.includes("oak street parcel"));
  });
});
