import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatParseHeader, resolveParseOcrEnabled } from "./parse-header.js";
import { DEFAULT_ZIPWIKI_CONFIG } from "../config/index.js";

describe("parse header", () => {
  it("includes engine and OCR state", () => {
    const lines = formatParseHeader({
      command: "batch-parse",
      engine: "liteparse",
      ocr: true,
      format: "markdown",
      ocrLanguage: "eng",
      fileCount: 3,
    });
    assert.ok(lines.some((l) => l.includes("engine      liteparse")));
    assert.ok(lines.some((l) => l.includes("ocr         on")));
    assert.ok(lines.some((l) => l.includes("format      markdown")));
    assert.ok(lines.some((l) => l.includes("files       3")));
  });

  it("shows llama key line for llamaparse", () => {
    const lines = formatParseHeader({
      command: "pack",
      engine: "llamaparse",
      mode: "fixed",
      ocr: false,
      llamaTier: "agentic",
    });
    assert.ok(lines.some((l) => l.includes("llamaTier   agentic")));
    assert.ok(lines.some((l) => l.includes("llamaKey")));
    assert.ok(lines.some((l) => l.includes("ocr         off")));
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
      resolveParseOcrEnabled({}, { ...DEFAULT_ZIPWIKI_CONFIG, pack: { ...DEFAULT_ZIPWIKI_CONFIG.pack, noOcr: true } }),
      false,
    );
  });
});
