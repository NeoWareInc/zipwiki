import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCliLoginAccountChoice } from "./auth-cmd.js";

describe("resolveCliLoginAccountChoice", () => {
  it("keeps the active account when not refreshing", () => {
    assert.deepEqual(
      resolveCliLoginAccountChoice({
        selected: "steve@neoware.io",
        active: "steve@neoware.io",
      }),
      { action: "keep" },
    );
  });

  it("forces browser re-auth for the active account when refreshing", () => {
    assert.deepEqual(
      resolveCliLoginAccountChoice({
        selected: "steve@neoware.io",
        active: "steve@neoware.io",
        forceRefresh: true,
      }),
      { action: "browser" },
    );
  });

  it("activates a different saved account", () => {
    assert.deepEqual(
      resolveCliLoginAccountChoice({
        selected: "other@example.com",
        active: "steve@neoware.io",
        forceRefresh: true,
      }),
      { action: "activate", email: "other@example.com" },
    );
  });

  it("treats other-account as browser", () => {
    assert.deepEqual(
      resolveCliLoginAccountChoice({
        selected: "__other__",
        active: "steve@neoware.io",
      }),
      { action: "browser" },
    );
  });
});
