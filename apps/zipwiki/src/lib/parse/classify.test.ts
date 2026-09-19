import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCategoryOverride } from "../archive/index.js";
import {
  classifyDocument,
  guessDocumentTypeFromName,
} from "./classify.js";

describe("document classify", () => {
  it("categorizes a financial report from its content", () => {
    const result = classifyDocument({
      fileName: "q3.pdf",
      text: `## Consolidated Balance Sheet
        Net income rose in the fiscal year. Earnings per share were $1.20.
        Shareholders' equity increased.`,
    });
    assert.equal(result.documentType, "Financial_Report");
    assert.ok(result.confidence > 0.5);
  });

  it("categorizes a contract from its content", () => {
    const result = classifyDocument({
      fileName: "doc-2291.pdf",
      text: `THIS AGREEMENT is entered into by the parties. WHEREAS the
        Disclosing Party owns Confidential Information, hereinafter the "Data".
        Governing law shall be Delaware. IN WITNESS WHEREOF...`,
    });
    assert.equal(result.documentType, "Legal_Contract");
  });

  it("categorizes technical documentation", () => {
    const result = classifyDocument({
      fileName: "notes.md",
      text: `# API Reference
        Run \`npm install\` then GET /v1/documents.
        ## Configuration
        The schema specification lists all parameters.`,
    });
    assert.equal(result.documentType, "Technical_Doc");
  });

  it("falls back to Generic when evidence is thin", () => {
    const result = classifyDocument({
      fileName: "letter.pdf",
      text: "Dear Ada, thanks for lunch on Tuesday. See you soon.",
    });
    assert.equal(result.documentType, "Generic");
    assert.equal(result.confidence, 0);
  });

  it("uses the filename when there is no text", () => {
    assert.equal(guessDocumentTypeFromName("2024-10-K.pdf"), "Financial_Report");
    assert.equal(guessDocumentTypeFromName("vendor-nda.pdf"), "Legal_Contract");
    assert.equal(guessDocumentTypeFromName("untitled.pdf"), "Generic");
  });

  it("treats a text-sparse scanned page as a receipt scan", () => {
    const scanned = classifyDocument({
      fileName: "img_4021.pdf",
      text: "SUBTOTAL 12.40\nSALES TAX 0.99\nTOTAL DUE 13.39",
      scannedRatio: 1,
    });
    assert.equal(scanned.documentType, "Receipt_Scan");
  });

  it("does not let the scan signal outvote a long financial document", () => {
    const body = `Consolidated Balance Sheet. Net income and cash flow for the
      fiscal year. Earnings per share. Shareholders' equity. `.repeat(60);
    const result = classifyDocument({
      fileName: "annual.pdf",
      text: `${body}\nSubtotal and sales tax appear in the appendix.`,
      scannedRatio: 1,
    });
    assert.equal(result.documentType, "Financial_Report");
  });

  it("validates category overrides", () => {
    assert.equal(parseCategoryOverride("Legal_Contract"), "Legal_Contract");
    assert.throws(() => parseCategoryOverride("Invoices"), /Unknown category/);
  });
});
