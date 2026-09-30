import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeZipBuffer } from "../archive/nzip.js";
import { parseEpub } from "./epub.js";

describe("parseEpub", () => {
  it("reads spine HTML in order and skips the navigation page", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-epub-"));
    const epub = join(dir, "tale.epub");
    try {
      const opf = `<?xml version="1.0"?>
<package>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c2"/>
    <itemref idref="c1"/>
  </spine>
</package>`;
      writeFileSync(
        epub,
        writeZipBuffer(
          [
            { name: "mimetype", data: Buffer.from("application/epub+zip") },
            { name: "OEBPS/content.opf", data: Buffer.from(opf) },
            {
              name: "OEBPS/nav.xhtml",
              data: Buffer.from("<html><body><p>Contents</p></body></html>"),
            },
            {
              name: "OEBPS/chapter-1.xhtml",
              data: Buffer.from(
                "<html><body><h1>Chapter I</h1><p>It was the best of times.</p></body></html>",
              ),
            },
            {
              name: "OEBPS/chapter-2.xhtml",
              data: Buffer.from(
                "<html><body><p>It was the worst of times.</p></body></html>",
              ),
            },
          ],
          { compression: "store" },
        ),
      );
      const parsed = parseEpub(epub);
      assert.match(parsed.text, /worst of times/);
      assert.match(parsed.text, /best of times/);
      assert.ok(parsed.text.indexOf("worst of times") < parsed.text.indexOf("best of times"));
      assert.equal(parsed.text.includes("Contents"), false);
      assert.equal(parsed.route?.reason, "epub xhtml extract");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
