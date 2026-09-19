import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasLlamaParseQuota,
  hasZipcodexOkfQuota,
} from "./entitlements.js";

describe("client entitlements", () => {
  it("free has no LlamaParse quota", () => {
    assert.equal(
      hasLlamaParseQuota(
        { slug: "free", maxParsesPerMonth: 0, maxOkfPerMonth: 0 },
        { parseCount: 0, okfCount: 0 },
      ),
      false,
    );
  });

  it("exhausted standard has no LlamaParse quota", () => {
    assert.equal(
      hasLlamaParseQuota(
        { slug: "standard", maxParsesPerMonth: 2000, maxOkfPerMonth: 2000 },
        { parseCount: 2000, okfCount: 0 },
      ),
      false,
    );
  });

  it("okf exhausted → no zipwiki OKF", () => {
    assert.equal(
      hasZipcodexOkfQuota(
        { slug: "pro", maxParsesPerMonth: 20_000, maxOkfPerMonth: 20_000 },
        { parseCount: 0, okfCount: 20_000 },
      ),
      false,
    );
  });
});
