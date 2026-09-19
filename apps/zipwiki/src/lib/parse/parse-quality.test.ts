import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParseResult } from "@llamaindex/liteparse";
import {
  assessParseYield,
  buildParserManifest,
  mergeParserManifests,
  stripParseBoilerplate,
  summarizeOcrConfidence,
  summarizeParseComplexity,
} from "./parse-quality.js";

function fakeResult(): ParseResult {
  return {
    text: "hello",
    images: [],
    imageErrorCount: 0,
    pages: [
      {
        pageNum: 1,
        width: 100,
        height: 100,
        text: "a",
        markdown: "a",
        textItems: [
          {
            text: "a",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            confidence: 0.9,
          },
          { text: "b", x: 0, y: 10, width: 10, height: 10 },
        ],
        complexity: {
          pageNumber: 1,
          textLength: 1,
          textCoverage: 0.2,
          hasSubstantialImages: false,
          imageBlockCount: 0,
          imageCoverage: 0,
          largestImageCoverage: 0,
          fullPageImage: false,
          isGarbled: false,
          pageArea: 10000,
          needsOcr: false,
          reasons: [],
          layout: {
            columnCount: 2,
            ruledTableCount: 1,
            ruledTableCoverage: 0.1,
            textTableRunCount: 0,
            figureCount: 0,
            figureCoverage: 0,
            isComplex: true,
            reasons: ["multi-column", "table-likely"],
          },
        },
      },
      {
        pageNum: 2,
        width: 100,
        height: 100,
        text: "",
        markdown: "",
        textItems: [
          {
            text: "x",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            confidence: 0.5,
          },
        ],
        complexity: {
          pageNumber: 2,
          textLength: 0,
          textCoverage: 0,
          hasSubstantialImages: true,
          imageBlockCount: 1,
          imageCoverage: 0.95,
          largestImageCoverage: 0.95,
          fullPageImage: true,
          isGarbled: false,
          pageArea: 10000,
          needsOcr: true,
          reasons: ["scanned"],
          layout: {
            columnCount: 1,
            ruledTableCount: 0,
            ruledTableCoverage: 0,
            textTableRunCount: 0,
            figureCount: 0,
            figureCoverage: 0,
            isComplex: false,
            reasons: [],
          },
        },
      },
    ],
  };
}

describe("parse quality summary", () => {
  it("aggregates OCR confidence when present", () => {
    const conf = summarizeOcrConfidence(fakeResult());
    assert.equal(conf.totalItemCount, 3);
    assert.equal(conf.scoredItemCount, 2);
    assert.equal(conf.mean, 0.7);
    assert.equal(conf.min, 0.5);
    assert.equal(conf.max, 0.9);
  });

  it("rolls up complexity and layout reasons", () => {
    const c = summarizeParseComplexity(fakeResult());
    assert.ok(c);
    assert.equal(c.pageCount, 2);
    assert.equal(c.needsOcrCount, 1);
    assert.equal(c.needsOcrRatio, 0.5);
    assert.equal(c.layoutComplexCount, 1);
    assert.equal(c.maxColumnCount, 2);
    assert.equal(c.reasonCounts.scanned, 1);
    assert.equal(c.layoutReasonCounts["multi-column"], 1);
    assert.equal(c.pages[0]?.layoutComplex, true);
  });

  it("builds ai.parser manifest block", () => {
    const parser = buildParserManifest(fakeResult());
    assert.equal(parser.engine, "liteparse");
    assert.equal(parser.includeComplexity, true);
    assert.equal(parser.complexity?.pageCount, 2);
    assert.equal(parser.ocrConfidence?.scoredItemCount, 2);
  });

  it("merges multiple primary parser blocks", () => {
    const a = buildParserManifest(fakeResult());
    const b = buildParserManifest(fakeResult());
    const merged = mergeParserManifests([a, b]);
    assert.ok(merged);
    assert.equal(merged.complexity?.pageCount, 4);
    assert.equal(merged.complexity?.needsOcrCount, 2);
    assert.equal(merged.ocrConfidence?.scoredItemCount, 4);
  });
});

describe("parse yield assessment", () => {
  it("strips empty markdown shells", () => {
    const emptyShell = "```text\n\n```\n\n-----\n\n```text\n\n```\n";
    assert.equal(stripParseBoilerplate(emptyShell), "");
    const a = assessParseYield(emptyShell);
    assert.equal(a.ok, false);
    if (!a.ok) assert.match(a.reason, /no extractable text/);
  });

  it("accepts real prose", () => {
    const a = assessParseYield(
      "# Title\n\nThis deed conveys the property described herein to the grantee.",
    );
    assert.equal(a.ok, true);
  });

  it("flags scanned empty extracts with needsOcr", () => {
    const a = assessParseYield("```text\n\n```", {
      complexity: {
        pageCount: 2,
        needsOcrCount: 2,
        needsOcrRatio: 1,
        layoutComplexCount: 0,
        layoutComplexRatio: 0,
        reasonCounts: { scanned: 2 },
        layoutReasonCounts: {},
        maxColumnCount: 1,
        pages: [
          {
            page: 1,
            needsOcr: true,
            reasons: ["scanned"],
            textCoverage: 0,
            isGarbled: false,
          },
          {
            page: 2,
            needsOcr: true,
            reasons: ["scanned"],
            textCoverage: 0,
            isGarbled: false,
          },
        ],
      },
    });
    assert.equal(a.ok, false);
    if (!a.ok) assert.match(a.reason, /needs OCR/);
  });
});
