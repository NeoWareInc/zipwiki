import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseFrontmatterFields,
  repairOkfFrontmatter,
  splitFrontmatter,
  validateOkfFrontmatter,
} from "./frontmatter.js";
import {
  applyCodeOwnedProvenance,
  dateHeadingFromIso,
  hashOkfBody,
} from "./provenance.js";
import {
  buildOkfDocument,
  extractFrontmatterType,
  renderOkfFiles,
} from "./index.js";

describe("okf frontmatter", () => {
  it("requires type", () => {
    const issues = validateOkfFrontmatter({ title: "x" });
    assert.ok(issues.some((i) => i.code === "missing_type"));
  });

  it("repairs missing type and leaves valid pages unchanged", () => {
    const valid = [
      "---",
      "type: Document",
      'title: "Hello"',
      "description: desc",
      "---",
      "",
      "A short paragraph.",
      "",
    ].join("\n");
    const ok = repairOkfFrontmatter(valid);
    assert.equal(ok.repaired, false);
    assert.equal(ok.markdown, valid);

    const bad = "# No frontmatter\n";
    const fixed = repairOkfFrontmatter(bad);
    assert.equal(fixed.repaired, true);
    assert.equal(extractFrontmatterType(fixed.markdown), "Document");
  });

  it("parses sources with id", () => {
    const block = [
      "type: Document",
      "sources:",
      "  - id: primary-a",
      "    resource: ../../a.pdf",
      "    description: Primary",
    ].join("\n");
    const fields = parseFrontmatterFields(block);
    assert.equal(fields.sources?.[0]?.id, "primary-a");
    assert.equal(fields.sources?.[0]?.resource, "../../a.pdf");
  });
});

describe("okf provenance", () => {
  it("formats ISO dates to YYYY-MM-DD", () => {
    assert.equal(dateHeadingFromIso("2026-08-10T12:00:00.000Z"), "2026-08-10");
  });

  it("stamps generated and replaces sources", () => {
    const md = [
      "---",
      "type: Document",
      "title: T",
      "description: D",
      "---",
      "",
      "Body paragraph.",
      "",
    ].join("\n");
    const out = applyCodeOwnedProvenance(md, {
      generatedBy: "zipwiki/okf@test",
      generatedAt: "2026-08-29T12:00:00.000Z",
      sources: [{ id: "s1", resource: "../../x.pdf" }],
    });
    assert.match(out, /generated: \{ by: "?zipwiki\/okf@test"?/);
    assert.match(out, /resource: \.\.\/\.\.\/x\.pdf/);
    assert.equal(typeof hashOkfBody(out), "string");
    assert.equal(hashOkfBody(out).length, 64);
  });
});

describe("minimal okf bundle", () => {
  it("emits document.md with tags and optional thin body", () => {
    const files = renderOkfFiles({
      enrichment: {
        title: "Hello",
        description: "Desc",
        type: "Document",
      },
      primaries: [{ path: "a.pdf" }],
      generatedBy: "process:test",
      generatedAt: "2026-08-10T12:00:00.000Z",
    });
    assert.deepEqual(
      files.map((f) => f.name),
      ["document.md", "index.md"],
    );
    assert.match(files[0]!.data, /tags: \[/);
    assert.equal(splitFrontmatter(files[0]!.data).body.trim(), "");
  });
});

describe("buildOkfDocument", () => {
  it("allows missing parse text (filename/type context) and requires sources", async () => {
    const noParse = await buildOkfDocument({
      sourceName: "Zip OKF v0.2.docx",
      parsedMarkdown: "",
      sources: [{ resource: "../../Zip OKF v0.2.docx" }],
      useAi: false,
    });
    assert.equal(noParse.mode, "fallback");
    assert.ok(noParse.files.some((f) => f.name.endsWith(".md")));

    await assert.rejects(
      () =>
        buildOkfDocument({
          sourceName: "a.pdf",
          parsedMarkdown:
            "# Hello from parse\n\nLong enough digest line here for fallback.\n",
          sources: [],
          useAi: false,
        }),
      /sources/,
    );
  });

  it("builds {stem}.md with tags citing sources (empty body without AI facts)", async () => {
    const result = await buildOkfDocument({
      sourceName: "deed.pdf",
      parsedMarkdown:
        "# Property deed\n\nThis is a long enough summary line for the digest fallback path.\n",
      documentType: "Legal_Contract",
      useAi: false,
      sources: [
        { id: "primary-deed", resource: "../../sample-docs/deed.pdf" },
        { id: "parse-deed", resource: "../parsed/deed.md" },
      ],
    });
    assert.equal(result.mode, "fallback");
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]!.name, "deed.md");
    const doc = result.files[0]!.data;
    assert.equal(extractFrontmatterType(doc), "Contract");
    assert.match(doc, /tags: \[/);
    assert.match(doc, /sample-docs\/deed\.pdf/);
    assert.match(doc, /parsed\/deed\.md/);
    assert.doesNotMatch(doc, /# Property deed/);
    assert.equal(splitFrontmatter(doc).body.trim(), "");
  });
});
