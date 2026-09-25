import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTopicFiles,
  danglingSourcePaths,
  resolveOkfResource,
  syncOkfArchive,
} from "./bundle.js";

const lease = {
  href: "lease.md",
  markdown: [
    "---",
    "type: Contract",
    "title: Warehouse Lease",
    "description: Main Street",
    "tags: [lease, warehouse]",
    "generated: { by: process:zipwiki-okf-fallback, at: 2026-01-01T00:00:00.000Z }",
    "sources:",
    '  - resource: "../../lease.txt"',
    "    description: primary",
    "---",
    "",
    "# Key facts",
    "",
  ].join("\n"),
};

const deed = {
  href: "deed.md",
  markdown: [
    "---",
    "type: Deed",
    "title: Property Deed",
    "description: Oak Street",
    "tags: [deed, warehouse]",
    "sources:",
    '  - resource: "../../deed.pdf"',
    "    description: primary",
    "---",
    "",
  ].join("\n"),
};

describe("okf bundle", () => {
  it("builds one topic page for a shared tag and links the cards", () => {
    const topics = buildTopicFiles([lease, deed], "2026-01-02T00:00:00.000Z");
    assert.equal(topics.length, 1);
    assert.equal(topics[0]!.href, "topics/warehouse.md");
    assert.match(topics[0]!.markdown, /\]\(\.\.\/lease\.md\)/);
    assert.match(topics[0]!.markdown, /\]\(\.\.\/deed\.md\)/);
    assert.match(topics[0]!.markdown, /\.\.\/\.\.\/lease\.txt/);
    assert.match(topics[0]!.markdown, /\.\.\/\.\.\/deed\.pdf/);
  });

  it("drops a topic page when no sources remain", () => {
    const bare = {
      ...lease,
      markdown: lease.markdown.replace(/sources:[\s\S]*?---/, "---"),
    };
    const other = {
      ...deed,
      markdown: deed.markdown.replace(/sources:[\s\S]*?---/, "---"),
    };
    assert.deepEqual(buildTopicFiles([bare, other], "2026-01-02T00:00:00.000Z"), []);
  });

  it("resolves in-package sources and ignores absolute ones", () => {
    assert.equal(resolveOkfResource("wiki/okf", "../../lease.txt"), "lease.txt");
    assert.equal(
      resolveOkfResource("wiki/okf", "../parsed/lease.txt.md"),
      "wiki/parsed/lease.txt.md",
    );
    assert.equal(resolveOkfResource("wiki/okf", "/Users/me/lease.txt"), null);
    assert.equal(resolveOkfResource("wiki/okf", "https://example.com/a"), null);
  });

  it("reports a concept that still cites a removed primary", () => {
    const missing = danglingSourcePaths(
      "wiki/okf",
      [lease],
      new Set(["deed.pdf", "wiki/okf/lease.md"]),
    );
    assert.deepEqual(missing, ["lease.md → lease.txt"]);
  });

  it("rebuilds topics in an archive sync and drops log and search.json", () => {
    const synced = syncOkfArchive({
      okfRoot: "wiki/okf/",
      generatedAt: "2026-01-02T00:00:00.000Z",
      entryNames: [
        "lease.txt",
        "deed.pdf",
        "wiki/parsed/lease.txt.md",
        "wiki/parsed/deed.pdf.md",
        "wiki/okf/lease.md",
        "wiki/okf/deed.md",
        "wiki/okf/log.md",
        "wiki/search.json",
      ],
      files: [
        lease,
        deed,
        {
          name: "wiki/okf/log.md",
          data: "# Log\n\n- 2026-01-01T00:00:00.000Z pack lease.txt — lease.md fallback\n",
        },
      ].map((file) =>
        "name" in file
          ? file
          : { name: `wiki/okf/${file.href}`, data: file.markdown },
      ),
    });
    assert.deepEqual(synced.dangling, []);
    const index = synced.put.find((f) => f.name === "wiki/okf/index.md")!;
    assert.match(index.data, /# Files/);
    assert.match(index.data, /# Topics/);
    assert.match(index.data, /topics\/warehouse\.md/);
    assert.ok(synced.put.some((f) => f.name === "wiki/okf/topics/warehouse.md"));
    assert.ok(!synced.put.some((f) => f.name.endsWith("/log.md")));
    assert.ok(!synced.put.some((f) => f.name.endsWith("/search.json")));
    assert.ok(synced.delete.includes("wiki/okf/log.md"));
    assert.ok(synced.delete.includes("wiki/search.json"));
  });
});
