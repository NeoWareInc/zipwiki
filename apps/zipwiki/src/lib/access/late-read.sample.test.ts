/**
 * Sample: a line late in a book.
 *
 * search_zipwiki returns the character offset of the phrase.
 * read_zipwiki then starts at that offset instead of character 0.
 *
 * The opening is inside the first 12,000 characters. Sydney Carton's
 * last line is not, so a read from the start never reaches it.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { writeNzipCollectionBundle } from "../archive/index.js";
import { formatFollowWindow, readFollow, searchPhrase } from "./evidence.js";

const dir = mkdtempSync(join(tmpdir(), "zipwiki-late-read-"));
const book = join(dir, "tale.epub");
const pkg = join(dir, "tale.zipwiki");
const parsed = "wiki/parsed/tale.epub.md";
const lateLine = "It is a far, far better thing that I do, than I have ever done.";
const opening = "It was the best of times, it was the worst of times.\n";
const middle = "The tumbril rolled through the Paris streets.\n".repeat(400);
const markdown = `${opening}${middle}\n${lateLine}\n`;

writeFileSync(book, "sample epub bytes\n");
writeNzipCollectionBundle({
  outputPath: pkg,
  members: [
    {
      originalPath: book,
      originalName: "tale.epub",
      structuredMarkdown: markdown,
    },
  ],
});

describe("late read from a search hit", () => {
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("searches for Carton's line and reads from that offset", () => {
    const search = { name: "search_zipwiki", input: { phrase: lateLine } };
    const hits = searchPhrase(pkg, search.input.phrase);
    const hit = hits.find((item) => item.path === parsed);
    assert.ok(hit, "search should hit the parsed book");
    assert.ok(hit.offset > 12_000, "the line sits past the first window");

    const fromStart = readFollow(pkg, parsed, 0);
    assert.ok("text" in fromStart);
    assert.equal(fromStart.text.includes(lateLine), false);
    assert.equal(fromStart.text.includes("best of times"), true);

    const read = {
      name: "read_zipwiki",
      input: { path: hit.path, offset: hit.offset },
    };
    const fromHit = readFollow(pkg, read.input.path, read.input.offset);
    assert.ok("text" in fromHit);
    assert.equal(fromHit.offset, hit.offset);
    assert.ok(fromHit.text.startsWith(lateLine));
    assert.ok(fromHit.next <= fromHit.total);
    assert.match(
      formatFollowWindow(fromHit),
      new RegExp(`^offset ${hit.offset}\\nnext ${fromHit.next}\\ntotal ${fromHit.total}\\n`),
    );
  });
});
