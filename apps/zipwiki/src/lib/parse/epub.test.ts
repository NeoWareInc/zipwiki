import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writeZipBuffer } from "../archive/nzip.js";
import { retargetParsedImageHrefs } from "./images.js";
import { parseEpub } from "./epub.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

  it("keeps a placeholder for an image and saves bytes when extraction is on", () => {
    const dir = mkdtempSync(join(tmpdir(), "zipwiki-epub-img-"));
    const epub = join(dir, "letters.epub");
    try {
      const opf = `<?xml version="1.0"?>
<package>
  <manifest>
    <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="plate" href="images/plate.png" media-type="image/png"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;
      writeFileSync(
        epub,
        writeZipBuffer(
          [
            { name: "mimetype", data: Buffer.from("application/epub+zip") },
            { name: "OEBPS/content.opf", data: Buffer.from(opf) },
            {
              name: "OEBPS/chapter.xhtml",
              data: Buffer.from(
                '<html><body><p>Before</p><img src="images/plate.png" alt="Frontispiece"/><p>After</p></body></html>',
              ),
            },
            { name: "OEBPS/images/plate.png", data: TINY_PNG },
          ],
          { compression: "store" },
        ),
      );
      const placeholder = parseEpub(epub);
      assert.match(placeholder.text, /!\[[^\]]*Frontispiece\]\(OEBPS_images_plate\.png\)/);
      assert.equal(placeholder.images, undefined);
      assert.ok(placeholder.text.indexOf("Before") < placeholder.text.indexOf("Frontispiece"));

      const off = parseEpub(epub, { imageMode: "off" });
      assert.equal(off.text.includes("Frontispiece"), false);
      assert.equal(off.text.includes("plate"), false);

      const extracted = parseEpub(epub, { extractImages: true });
      assert.equal(extracted.images?.length, 1);
      assert.equal(extracted.images?.[0]?.name, "OEBPS_images_plate.png");
      assert.ok(extracted.images?.[0]?.bytes.equals(TINY_PNG));
      const linked = retargetParsedImageHrefs(
        extracted.text,
        "letters.epub",
        extracted.images ?? [],
      );
      assert.match(linked, /letters\.epub\.assets\/OEBPS_images_plate\.png/);

      const embedded = parseEpub(epub, { imageMode: "embed" });
      assert.match(embedded.text, /data:image\/png;base64,/);
      assert.equal(embedded.images, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
