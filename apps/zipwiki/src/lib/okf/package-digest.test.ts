import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderOkfIndex } from "./render.js";
import {
  PACKAGE_DIGEST_MAX_CHARS,
  parseOkfIndexFileEntries,
  synthesizePackageDigestFromEntries,
  synthesizePackageDigestFromOkfDir,
  synthesizePackageDigestFromOkfFiles,
} from "./package-digest.js";

describe("package-digest", () => {
  it("parses # Files bullets from index.md", () => {
    const index = renderOkfIndex(
      [
        {
          href: "carol.md",
          title: "A Christmas Carol",
          description: "Ghost story of Christmas.",
        },
        { href: "twist.md", title: "Oliver Twist" },
      ],
      [{ href: "topics/fiction.md", title: "Fiction", description: "Novels." }],
    );
    const entries = parseOkfIndexFileEntries(index);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.href, "carol.md");
    assert.equal(entries[0]!.description, "Ghost story of Christmas.");
    assert.equal(entries[1]!.title, "Oliver Twist");
    assert.equal(entries[1]!.description, undefined);
  });

  it("synthesizes from index when present", () => {
    const dir = mkdtempSync(join(tmpdir(), "okf-digest-"));
    writeFileSync(
      join(dir, "index.md"),
      renderOkfIndex([
        {
          href: "a.md",
          title: "Alpha",
          description: "First concept summary.",
        },
        {
          href: "b.md",
          title: "Beta",
          description: "Second concept summary.",
        },
      ]),
      "utf-8",
    );
    // Stale concepts should be ignored when index has Files rows.
    writeFileSync(
      join(dir, "a.md"),
      "---\ntitle: Alpha\ndescription: ignored\nokf_version: \"0.2\"\n---\n",
      "utf-8",
    );
    const digest = synthesizePackageDigestFromOkfDir(dir);
    assert.ok(digest);
    assert.match(digest!, /^2 documents: /);
    assert.ok(digest!.includes("First concept summary."));
    assert.ok(digest!.includes("Second concept summary."));
    assert.ok(!digest!.includes("ignored"));
  });

  it("falls back to concept frontmatter when index is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "okf-digest-"));
    writeFileSync(
      join(dir, "note.md"),
      "---\ntitle: Note\ndescription: A short note about packing.\nokf_version: \"0.2\"\n---\n\nBody.\n",
      "utf-8",
    );
    writeFileSync(
      join(dir, "deed.md"),
      "---\ntitle: Deed\nokf_version: \"0.2\"\n---\n",
      "utf-8",
    );
    mkdirSync(join(dir, "topics"), { recursive: true });
    writeFileSync(
      join(dir, "topics", "legal.md"),
      "---\ntitle: Legal\ndescription: should not appear\n---\n",
      "utf-8",
    );
    const digest = synthesizePackageDigestFromOkfDir(dir);
    assert.equal(
      digest,
      "2 documents: Deed; A short note about packing.",
    );
  });

  it("returns undefined when there are no concepts", () => {
    const dir = mkdtempSync(join(tmpdir(), "okf-digest-empty-"));
    assert.equal(synthesizePackageDigestFromOkfDir(dir), undefined);
    assert.equal(synthesizePackageDigestFromEntries([]), undefined);
  });

  it("truncates long digests near a semicolon boundary", () => {
    const parts = Array.from({ length: 20 }, (_, i) => ({
      href: `f${i}.md`,
      title: `Title ${i}`,
      description: `Description number ${i} with enough words to grow.`,
    }));
    const digest = synthesizePackageDigestFromEntries(
      parts,
      PACKAGE_DIGEST_MAX_CHARS,
    );
    assert.ok(digest);
    assert.ok(digest!.length <= PACKAGE_DIGEST_MAX_CHARS);
    assert.ok(digest!.endsWith("…"));
    assert.match(digest!, /^20 documents: /);
  });

  it("synthesizes from in-memory OKF file list", () => {
    const digest = synthesizePackageDigestFromOkfFiles([
      {
        name: "index.md",
        data: renderOkfIndex([
          {
            href: "x.md",
            title: "X",
            description: "From index.",
          },
        ]),
      },
      {
        name: "x.md",
        data: "---\ntitle: X\ndescription: From concept.\n---\n",
      },
    ]);
    assert.equal(digest, "1 document: From index.");
  });
});
