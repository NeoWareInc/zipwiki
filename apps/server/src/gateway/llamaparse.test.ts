import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LLAMA_PARSE_CREDITS_MESSAGE,
  llamaParseUploadError,
} from "./llamaparse.js";

describe("llamaParseUploadError", () => {
  it("turns a Llama Cloud 402 into one sentence", () => {
    const err = llamaParseUploadError(
      402,
      '{"detail":"You\'ve exceeded the maximum number of credits for your plan. (Project ID: ad8d0631)"}',
    );
    assert.equal(err.message, LLAMA_PARSE_CREDITS_MESSAGE);
    assert.doesNotMatch(err.message, /Project ID/);
  });

  it("keeps other upload failures", () => {
    const err = llamaParseUploadError(500, "upstream unavailable");
    assert.match(err.message, /LlamaParse upload failed \(500\): upstream unavailable/);
  });
});
