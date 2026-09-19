import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSessionCookie } from "./zipwiki-api.js";

describe("extractSessionCookie", () => {
  it("parses a single Set-Cookie header", () => {
    assert.equal(
      extractSessionCookie("zipwiki_session=abc123; Path=/; HttpOnly"),
      "abc123",
    );
  });

  it("parses getSetCookie-style arrays", () => {
    assert.equal(
      extractSessionCookie([
        "other=1; Path=/",
        "zipwiki_session=sess-xyz; Path=/; HttpOnly",
      ]),
      "sess-xyz",
    );
  });
});
