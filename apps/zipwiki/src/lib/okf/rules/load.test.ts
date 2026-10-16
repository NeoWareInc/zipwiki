import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackTags } from "../render.js";
import { resolveOkfProfile } from "../profiles.js";
import { loadOkfRules, okfProfileFlagIds } from "./load.js";
import { composeOkfPrompt } from "./prompt.js";

describe("OKF rules", () => {
  it("loads package catalog settings and the shipped data types", () => {
    const rules = loadOkfRules();
    assert.equal(rules.catalog.pageCap, 8);
    assert.equal(rules.catalog.minimumCards, 2);
    assert.deepEqual(rules.catalog.omitTags, ["pdf"]);
    assert.equal(rules.catalog.omitSingleFilenameFamily, true);
    assert.deepEqual(okfProfileFlagIds(), [
      "book",
      "legislation",
      "invoice",
      "earnings",
    ]);
    assert.ok(rules.types.some((type) => type.id === "generic"));
  });

  it("keeps the generic prompt on the type mapping and the book prompt on the sample", () => {
    const generic = composeOkfPrompt({
      profile: "generic",
      primaryList: "- a.pdf",
      parseSample: "hello",
    });
    assert.match(generic, /TYPE MAPPING/);
    assert.match(generic, /one OKF type from the mapping above/);
    assert.equal(generic.includes("Do not invent amounts"), false);
    const book = composeOkfPrompt({
      profile: "book",
      primaryList: "- tale.epub",
      parseSample: "hello",
    });
    assert.match(book, /distinctive line/);
    assert.match(book, /- type: Book/);
    assert.match(book, /Do not invent amounts/);
    assert.equal(book.includes("TYPE MAPPING"), false);
  });

  it("selects the earnings type for 10-K and 10-Q filenames", () => {
    assert.equal(
      resolveOkfProfile({ fileName: "AAPL-10-K-FY2025.pdf" }),
      "earnings",
    );
    assert.equal(
      resolveOkfProfile({ fileName: "UBER-10-Q-FY2025-Q3.pdf" }),
      "earnings",
    );
    assert.equal(resolveOkfProfile({ fileName: "notes.pdf" }), "generic");
    const prompt = composeOkfPrompt({
      profile: "earnings",
      primaryList: "- AAPL-10-K-FY2025.pdf",
      parseSample: "Apple Inc.",
    });
    assert.match(prompt, /Financial Report/);
    assert.match(prompt, /Do not tag the ticker/);
  });

  it("applies filename fallback tags from package.md", () => {
    assert.deepEqual(
      fallbackTags({ type: "Document", primaryPath: "report.pdf" }),
      ["document", "pdf"],
    );
    assert.ok(
      fallbackTags({ type: "Document", primaryPath: "AAPL-10-K.pdf" }).includes(
        "sec-filing",
      ),
    );
  });
});
