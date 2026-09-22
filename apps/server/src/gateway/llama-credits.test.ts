import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llamaCreditsFromPayload } from "./llama-credits.js";

describe("llamaCreditsFromPayload", () => {
  it("reads v2 job.usage.credits", () => {
    assert.equal(
      llamaCreditsFromPayload({
        job: { id: "pjb-1", status: "COMPLETED", usage: { credits: 30 } },
      }),
      30,
    );
  });

  it("reads a flat credits_used field", () => {
    assert.equal(llamaCreditsFromPayload({ credits_used: 4 }), 4);
  });

  it("returns null until billing records the job", () => {
    assert.equal(
      llamaCreditsFromPayload({ job: { id: "pjb-1", usage: { credits: null } } }),
      null,
    );
  });
});
