import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatParseEngineSummary,
  formatParseHeader,
  resolveParseOcrEnabled,
} from "./parse-header.js";
import { DEFAULT_ZIPWIKI_CONFIG } from "../config/index.js";

describe("parse header", () => {
  it("shows engine, files, and ocr for a default liteparse session", () => {
    const lines = formatParseHeader({
      command: "batch-parse",
      engine: "liteparse",
      mode: "fixed",
      ocr: true,
      format: "markdown",
      ocrLanguage: "eng",
      maxPages: 1000,
      dpi: 150,
      fileCount: 3,
      extra: { concurrency: 2, phase: "all", okfAi: true },
    });
    assert.deepEqual(lines, [
      "[parse] liteparse",
      "[parse] files       3",
      "[parse] ocr         on",
    ]);
  });

  it("shows simplified selectable LlamaParse tier", () => {
    assert.equal(
      formatParseEngineSummary({
        command: "pack",
        engine: "llamaparse",
        ocr: true,
        llamaTier: "cost_effective",
      }),
      "llamaparse, fast",
    );
    const lines = formatParseHeader({
      command: "pack",
      engine: "llamaparse",
      mode: "fixed",
      ocr: true,
      format: "markdown",
      ocrLanguage: "eng",
      tessdataPath: "/tmp/tessdata",
      maxPages: 1000,
      dpi: 150,
      llamaTier: "cost_effective",
      fileCount: 5,
      extra: { okfAi: true, concurrency: 2, phase: "all" },
    });
    assert.deepEqual(lines, [
      "[parse] llamaparse, fast",
      "[parse] files       5",
      "[parse] ocr         on",
    ]);
  });

  it("includes only non-default options", () => {
    const lines = formatParseHeader({
      command: "pack",
      engine: "llamaparse",
      mode: "auto",
      ocr: false,
      format: "text",
      ocrLanguage: "deu",
      maxPages: 50,
      dpi: 200,
      llamaTier: "agentic_plus",
      targetPages: "1-3",
      fileCount: 2,
      escalateNeedsOcrRatio: 0.4,
      escalateLayoutRatio: 0.5,
      extra: { concurrency: 4, phase: "parse", okfAi: false, input: "./docs" },
    });
    assert.deepEqual(lines, [
      "[parse] llamaparse, agentic+",
      "[parse] files       2",
      "[parse] ocr         off",
      "[parse] mode        auto",
      "[parse] format      text",
      "[parse] maxPages    50",
      "[parse] dpi         200",
      "[parse] targetPages 1-3",
      "[parse] escalateOCR >= 0.4",
      "[parse] concurrency 4",
      "[parse] phase       parse",
      "[parse] okfAi       false",
      "[parse] input       ./docs",
    ]);
  });
});

describe("resolveParseOcrEnabled", () => {
  it("defaults to on and honors --no-ocr for both engines", () => {
    assert.equal(resolveParseOcrEnabled({}, DEFAULT_ZIPWIKI_CONFIG), true);
    assert.equal(
      resolveParseOcrEnabled({ noOcr: true }, DEFAULT_ZIPWIKI_CONFIG),
      false,
    );
    assert.equal(
      resolveParseOcrEnabled({ ocr: false }, DEFAULT_ZIPWIKI_CONFIG),
      false,
    );
    assert.equal(
      resolveParseOcrEnabled(
        {},
        {
          ...DEFAULT_ZIPWIKI_CONFIG,
          pack: { ...DEFAULT_ZIPWIKI_CONFIG.pack, noOcr: true },
        },
      ),
      false,
    );
  });
});
