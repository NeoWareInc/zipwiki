import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOkfBundle,
  buildZipWikiOkfSources,
  defaultConceptType,
  extractFrontmatterType,
  fallbackEnrichment,
  normalizeOkfTags,
  relativeFromOkfRoot,
  relativeParseFromOkf,
  renderConceptBody,
  renderOkfFiles,
  splitFrontmatter,
} from "./index.js";

describe("okf paths", () => {
  it("climbs from okf/ to primary and parse", () => {
    assert.equal(relativeFromOkfRoot("report.pdf"), "../../report.pdf");
    assert.equal(
      relativeParseFromOkf("docs/a.pdf"),
      "../parsed/docs/a.pdf.md",
    );
  });

  it("cites absolute host path when primary is outside the package", () => {
    const abs = "/Users/me/docs/report.pdf";
    const sources = buildZipWikiOkfSources({
      originalName: "report.pdf",
      absolutePath: abs,
      parseAvailable: true,
      primaryInPackage: false,
    });
    assert.deepEqual(sources, [
      {
        resource: abs,
        description:
          "Primary not included in this package; source on disk (report.pdf)",
      },
      {
        resource: "../parsed/report.pdf.md",
        description: "Parsed markdown in this package (report.pdf)",
      },
    ]);
  });
});

describe("okf type mapping", () => {
  it("maps ZipWiki categories and extensions", () => {
    assert.equal(defaultConceptType("Financial_Report"), "Invoice");
    assert.equal(defaultConceptType("Legal_Contract"), "Contract");
    assert.equal(defaultConceptType("Generic", "book.xlsx"), "Spreadsheet");
    assert.equal(defaultConceptType("Generic", "thread.eml"), "Communication");
  });
});

describe("okf render", () => {
  it("emits tags and empty body when no keyFacts/contents", () => {
    const files = renderOkfFiles({
      enrichment: {
        title: "Hello package",
        description: "A tiny example.",
        type: "Generic",
      },
      primaries: [
        {
          path: "hello.txt",
          contentSha256: "a".repeat(64),
        },
      ],
      generatedBy: "process:test",
      generatedAt: "2026-08-10T12:00:00.000Z",
    });

    assert.deepEqual(
      files.map((f) => f.name),
      ["document.md", "index.md"],
    );

    const doc = files[0]!.data;
    assert.equal(extractFrontmatterType(doc), "Generic");
    assert.match(doc, /tags: \[generic\]/);
    assert.doesNotMatch(doc, /^resource:/m);
    assert.doesNotMatch(doc, /^status:/m);
    assert.doesNotMatch(doc, /^stale_after:/m);
    assert.doesNotMatch(doc, /^\s+- id:/m);
    assert.match(doc, /sources:/);
    assert.match(doc, /resource: \.\.\/\.\.\/hello\.txt/);
    assert.match(doc, /resource: \.\.\/parsed\/hello\.txt\.md/);
    assert.match(doc, /Primary content in this package/);
    assert.match(doc, /Parsed markdown in this package/);
    assert.match(doc, /generated: \{ by: "?process:test"?/);
    const { body } = splitFrontmatter(doc);
    assert.equal(body.trim(), "");

    const index = files[1]!.data;
    assert.match(index, /okf_version: "0\.2"/);
    assert.match(index, /\* \[Hello package\]\(document\.md\) - A tiny example\./);
  });

  it("emits thin # Key facts / # Contents body from enrichment", () => {
    const files = renderOkfFiles({
      enrichment: {
        title: "Report",
        description: "A 10-K filing.",
        type: "Financial Report",
        tags: ["SEC Filing", "Apple"],
        keyFacts: [
          "Issuer: Apple Inc.",
          "Form: 10-K for FY ended 2024-09-28",
          "- Period covered: fiscal 2024",
        ],
        contents: ["Item 1 Business", "Item 1A Risk Factors", "Financial statements"],
      },
      primaries: [{ path: "apple-10k.pdf" }],
      generatedBy: "process:test",
      generatedAt: "2026-08-10T12:00:00.000Z",
      conceptFileName: "apple-10k.md",
      includeIndex: false,
    });

    const doc = files[0]!.data;
    assert.match(doc, /tags: \[sec-filing, apple, financial-report, pdf\]/);
    const { body } = splitFrontmatter(doc);
    assert.match(body, /^# Key facts\n/m);
    assert.match(body, /- Issuer: Apple Inc\./);
    assert.match(body, /- Period covered: fiscal 2024/);
    assert.match(body, /^# Contents\n/m);
    assert.match(body, /- Item 1A Risk Factors/);
  });

  it("never embeds conceptBody into the concept file", () => {
    const files = renderOkfFiles({
      enrichment: {
        title: "Report",
        description: "A 10-K filing.",
        type: "Document",
      },
      primaries: [{ path: "apple-10k.pdf" }],
      generatedBy: "process:test",
      generatedAt: "2026-08-10T12:00:00.000Z",
      conceptFileName: "apple-10k.md",
      conceptBody: "# Apple 10-K\n\nFull parse content here.\n",
    });

    assert.equal(files[0]!.name, "apple-10k.md");
    const { body } = splitFrontmatter(files[0]!.data);
    assert.equal(body.trim(), "");
    assert.doesNotMatch(files[0]!.data, /Full parse content/);
    assert.equal(files[1]!.name, "index.md");
    assert.match(files[1]!.data, /\[Report\]\(apple-10k\.md\)/);
  });

  it("can omit index.md when includeIndex is false", () => {
    const files = renderOkfFiles({
      enrichment: {
        title: "Solo",
        description: "One concept.",
        type: "Document",
      },
      primaries: [{ path: "solo.pdf" }],
      generatedBy: "process:test",
      generatedAt: "2026-08-10T12:00:00.000Z",
      conceptFileName: "solo.md",
      includeIndex: false,
    });
    assert.deepEqual(
      files.map((f) => f.name),
      ["solo.md"],
    );
  });

  it("fallback enrichment supplies tags without keyFacts", () => {
    const e = fallbackEnrichment({
      documentType: "Financial_Report",
      digest: "Q1 summary invoice style document for vendors.",
      primaries: [{ path: "inv.pdf", documentType: "Financial_Report" }],
    });
    assert.equal(e.type, "Invoice");
    assert.match(e.description, /Q1 summary/);
    assert.equal(e.bodyMarkdown, undefined);
    assert.equal(e.keyFacts, undefined);
    assert.ok(e.tags?.includes("invoice"));
    assert.ok(e.tags?.includes("pdf"));
  });

  it("normalizes and dedupes tags", () => {
    assert.deepEqual(normalizeOkfTags(["SEC Filing", "sec-filing", "  "], ["Document"]), [
      "sec-filing",
      "document",
    ]);
    assert.deepEqual(normalizeOkfTags(["Generic"]), ["generic"]);
  });

  it("renderConceptBody skips empty sections", () => {
    assert.equal(renderConceptBody({ title: "t", description: "d", type: "Document" }), "");
    assert.match(
      renderConceptBody({
        title: "t",
        description: "d",
        type: "Document",
        keyFacts: ["Only facts"],
      }),
      /# Key facts/,
    );
  });

  it("builds via fallback without network", async () => {
    const result = await buildOkfBundle({
      title: "Pack",
      digest: "One line digest about the package content.",
      documentType: "Technical_Doc",
      primaries: [{ path: "a.pdf", documentType: "Technical_Doc" }],
      useAi: false,
    });
    assert.equal(result.mode, "fallback");
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0]!.name, "document.md");
    assert.equal(result.files[1]!.name, "index.md");
    const doc = result.files[0]!.data;
    assert.equal(extractFrontmatterType(doc), "Technical Document");
    assert.match(doc, /tags: \[/);
    assert.equal(result.digest, "One line digest about the package content.");
    assert.equal(splitFrontmatter(doc).body.trim(), "");
  });

  it("accepts injected enrichment as ai mode", async () => {
    const result = await buildOkfBundle({
      primaries: [{ path: "x.txt" }],
      enrichment: {
        title: "Injected",
        description: "From test double.",
        type: "Document",
        keyFacts: ["Fact A", "Fact B", "Fact C"],
        tags: ["demo"],
      },
    });
    assert.equal(result.mode, "ai");
    assert.equal(result.title, "Injected");
    assert.match(result.files[0]!.data, /# Key facts/);
    assert.match(result.files[0]!.data, /tags: \[demo/);
  });
});
