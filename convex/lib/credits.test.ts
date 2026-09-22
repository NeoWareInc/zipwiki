import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampUsdCents,
  creditSnapshot,
  creditsForUsdCents,
  zipwikiCreditsForLlamaCredits,
  crossedLowCreditThreshold,
  isLowCredits,
  remainingCredits,
  shouldStartAutoReload,
  DEFAULT_USD_CENTS,
  MIN_USD_CENTS,
  MAX_USD_CENTS,
  LOW_CREDITS_THRESHOLD,
} from "./credits.js";

describe("credits", () => {
  it("clamps to $5–$10,000", () => {
    assert.equal(clampUsdCents(100), MIN_USD_CENTS);
    assert.equal(clampUsdCents(DEFAULT_USD_CENTS), DEFAULT_USD_CENTS);
    assert.equal(clampUsdCents(2_000_000), MAX_USD_CENTS);
  });

  it("converts LlamaParse job credits at $1.25 per 1,000", () => {
    assert.equal(zipwikiCreditsForLlamaCredits(0), 0);
    assert.equal(zipwikiCreditsForLlamaCredits(1), 1);
    assert.equal(zipwikiCreditsForLlamaCredits(8), 1);
    assert.equal(zipwikiCreditsForLlamaCredits(10), 2);
    assert.equal(zipwikiCreditsForLlamaCredits(80), 10);
    assert.equal(zipwikiCreditsForLlamaCredits(100), 13);
  });

  it("grants 100 credits per dollar", () => {
    assert.equal(creditsForUsdCents(1_000), 1_000); // $10
    assert.equal(creditsForUsdCents(500), 500); // $5
    assert.equal(creditsForUsdCents(2_550), 2_550); // $25.50
  });

  it("computes remaining balance", () => {
    assert.equal(
      remainingCredits({ creditsPurchased: 1000, creditsSpent: 200 }),
      800,
    );
    assert.equal(
      remainingCredits({ creditsUnlimited: true, creditsPurchased: 0 }),
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("flags low balance at ≤500", () => {
    assert.equal(isLowCredits(LOW_CREDITS_THRESHOLD), true);
    assert.equal(isLowCredits(501), false);
    assert.equal(isLowCredits(0, true), false);
  });

  it("synthesizes a plan slug from prepaid credits", () => {
    assert.equal(creditSnapshot({ creditsPurchased: 0 }).plan.slug, "free");
    assert.equal(
      creditSnapshot({ creditsPurchased: 10 }).plan.slug,
      "credits",
    );
    assert.equal(
      creditSnapshot({ creditsUnlimited: true }).plan.slug,
      "unlimited",
    );
  });

  it("emails once when a debit crosses the low-credit line", () => {
    assert.equal(
      crossedLowCreditThreshold({ before: 501, after: 500 }),
      true,
    );
    assert.equal(
      crossedLowCreditThreshold({ before: 400, after: 399 }),
      false,
    );
    assert.equal(
      crossedLowCreditThreshold({
        before: 501,
        after: 500,
        notifiedAt: 1,
      }),
      false,
    );
    assert.equal(
      crossedLowCreditThreshold({ before: 501, after: 500, unlimited: true }),
      false,
    );
  });

  it("starts auto-reload only under the threshold with a saved card", () => {
    const now = 1_000_000;
    assert.equal(
      shouldStartAutoReload({
        enabled: true,
        remaining: 100,
        threshold: 200,
        hasPaymentMethod: true,
        now,
      }),
      true,
    );
    assert.equal(
      shouldStartAutoReload({
        enabled: true,
        remaining: 100,
        threshold: 200,
        hasPaymentMethod: false,
        now,
      }),
      false,
    );
    assert.equal(
      shouldStartAutoReload({
        enabled: true,
        remaining: 100,
        threshold: 200,
        hasPaymentMethod: true,
        pending: true,
        pendingAt: now - 1000,
        now,
      }),
      false,
    );
  });
});
