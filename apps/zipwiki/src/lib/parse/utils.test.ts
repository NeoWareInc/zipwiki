import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extensionForFormat, parseTargetPages } from "./utils.js";

describe("parse utils", () => {
  it("maps output formats to file extensions", () => {
    assert.equal(extensionForFormat("json"), ".json");
    assert.equal(extensionForFormat("markdown"), ".md");
    assert.equal(extensionForFormat("text"), ".txt");
  });

  it("parses target page ranges", () => {
    assert.deepEqual(parseTargetPages("1-3,5"), [1, 2, 3, 5]);
  });
});
