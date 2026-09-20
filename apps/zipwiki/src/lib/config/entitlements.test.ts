import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasHostedCredits,
  hasLlamaParseQuota,
  hasZipcodexOkfQuota,
} from "./entitlements.js";

describe("client entitlements", () => {
  it("no credits → no hosted LlamaParse", () => {
    assert.equal(hasHostedCredits({ creditsRemaining: 0 }), false);
    assert.equal(
      hasLlamaParseQuota({ creditsRemaining: 0, creditsUnlimited: false }),
      false,
    );
  });

  it("remaining credits unlock hosted parse and OKF", () => {
    assert.equal(hasHostedCredits({ creditsRemaining: 1 }), true);
    assert.equal(
      hasLlamaParseQuota({ creditsRemaining: 50 }),
      true,
    );
    assert.equal(
      hasZipcodexOkfQuota({ creditsRemaining: 50 }),
      true,
    );
  });

  it("unlimited bypasses balance", () => {
    assert.equal(
      hasHostedCredits({ creditsRemaining: 0, creditsUnlimited: true }),
      true,
    );
  });
});
