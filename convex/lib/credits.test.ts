import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampUsdCents,
  creditSnapshot,
  creditsForUsdCents,
  zipwikiCreditsForLlamaCredits,
  zipwikiCreditsForAnthropicTokens,
  resolveHostedOkfModel,
  approxAgenticPagesForUsd,
  approxPagesForUsd,
  crossedLowCreditThreshold,
  creditsSpendBlocked,
  isLowCredits,
  llamaCreditsPerPageForTier,
  remainingCredits,
  resolveLlamaParseTier,
  shouldStartAutoReload,
  DEFAULT_LLAMA_PARSE_TIER,
  DEFAULT_USD_CENTS,
  DEFAULT_HOSTED_OKF_MODEL,
  MIN_USD_CENTS,
  MAX_USD_CENTS,
  LOW_CREDITS_THRESHOLD,
  CREDIT_COST_LLM,
} from "./credits.js";

describe("credits", () => {
  it("clamps to $5–$10,000", () => {
    assert.equal(clampUsdCents(100), MIN_USD_CENTS);
    assert.equal(clampUsdCents(DEFAULT_USD_CENTS), DEFAULT_USD_CENTS);
    assert.equal(clampUsdCents(2_000_000), MAX_USD_CENTS);
  });

  it("converts LlamaParse job credits at $1.25/1k with 20% margin", () => {
    assert.equal(zipwikiCreditsForLlamaCredits(0), 0);
    assert.equal(zipwikiCreditsForLlamaCredits(1), 1);
    assert.equal(zipwikiCreditsForLlamaCredits(8), 2);
    assert.equal(zipwikiCreditsForLlamaCredits(10), 2);
    assert.equal(zipwikiCreditsForLlamaCredits(80), 13);
    assert.equal(zipwikiCreditsForLlamaCredits(100), 16);
  });

  it("defaults hosted OKF model to Haiku", () => {
    assert.equal(resolveHostedOkfModel(undefined), DEFAULT_HOSTED_OKF_MODEL);
    assert.equal(resolveHostedOkfModel("nope"), DEFAULT_HOSTED_OKF_MODEL);
    assert.equal(
      resolveHostedOkfModel("claude-sonnet-4-5"),
      "claude-sonnet-4-5",
    );
  });

  it("prices Anthropic OKF tokens with 20% margin", () => {
    assert.equal(zipwikiCreditsForAnthropicTokens({}), CREDIT_COST_LLM);
    assert.equal(
      zipwikiCreditsForAnthropicTokens({
        model: "claude-haiku-4-5",
        inputTokens: 0,
        outputTokens: 0,
      }),
      CREDIT_COST_LLM,
    );
    // Haiku: 1M in + 1M out = $1 + $5 = $6 cost → $7.50 sell → 750 credits.
    assert.equal(
      zipwikiCreditsForAnthropicTokens({
        model: "claude-haiku-4-5",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
      750,
    );
    assert.equal(
      zipwikiCreditsForAnthropicTokens({
        model: "claude-haiku-4-5",
        inputTokens: 100,
        outputTokens: 50,
      }),
      1,
    );
    const haiku = zipwikiCreditsForAnthropicTokens({
      model: "claude-haiku-4-5",
      inputTokens: 100_000,
      outputTokens: 10_000,
    });
    const sonnet = zipwikiCreditsForAnthropicTokens({
      model: "claude-sonnet-4-5",
      inputTokens: 100_000,
      outputTokens: 10_000,
    });
    const opus = zipwikiCreditsForAnthropicTokens({
      model: "claude-opus-4-5",
      inputTokens: 100_000,
      outputTokens: 10_000,
    });
    assert.ok(sonnet > haiku);
    assert.ok(opus > sonnet);
    assert.equal(
      zipwikiCreditsForAnthropicTokens({
        model: "claude-mystery",
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
      zipwikiCreditsForAnthropicTokens({
        model: "claude-haiku-4-5",
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    );
  });

  it("prices Parse tiers at distinct Llama credits/page", () => {
    assert.equal(DEFAULT_LLAMA_PARSE_TIER, "cost_effective");
    assert.equal(resolveLlamaParseTier("turbo"), "cost_effective");
    assert.equal(llamaCreditsPerPageForTier("cost_effective"), 3);
    assert.equal(llamaCreditsPerPageForTier("agentic"), 10);
    assert.equal(llamaCreditsPerPageForTier("agentic_plus"), 45);
    assert.ok(
      zipwikiCreditsForLlamaCredits(3) <
        zipwikiCreditsForLlamaCredits(10),
    );
    assert.ok(
      zipwikiCreditsForLlamaCredits(10) <
        zipwikiCreditsForLlamaCredits(45),
    );
  });

  it("estimates pages for $10 by Parse tier at 20% margin", () => {
    assert.equal(approxPagesForUsd(10, "cost_effective"), 2133);
    assert.equal(approxAgenticPagesForUsd(10), 640);
    assert.equal(approxPagesForUsd(10, "agentic_plus"), 142);
    assert.equal(approxAgenticPagesForUsd(0), 0);
  });

  it("grants 100 credits per dollar", () => {
    assert.equal(creditsForUsdCents(1_000), 1_000);
    assert.equal(creditsForUsdCents(500), 500);
    assert.equal(creditsForUsdCents(2_550), 2_550);
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

  it("blocks credit spend when the account or the platform is locked", () => {
    assert.equal(creditsSpendBlocked({}), false);
    assert.equal(creditsSpendBlocked({ accountLocked: true }), true);
    assert.equal(creditsSpendBlocked({ globalLocked: true }), true);
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
