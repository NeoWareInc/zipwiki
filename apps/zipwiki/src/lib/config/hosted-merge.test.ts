import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientConfig } from "@zipwiki/api-client";
import { formatClientUsageSummary } from "./hosted-merge.js";

function config(partial: {
  creditsRemaining?: number;
  creditsUnlimited?: boolean;
  usage?: ClientConfig["usage"];
}): ClientConfig {
  return {
    packageSpecVersion: "0.2",
    apiKeysRequired: true,
    plan: {
      slug: "credits",
      maxParsesPerMonth: 10_000,
      maxOkfPerMonth: 10_000,
      maxPagesPerDocument: null,
    },
    usage: partial.usage ?? null,
    creditsRemaining: partial.creditsRemaining ?? 1000,
    creditsUnlimited: partial.creditsUnlimited,
    parse: {
      engines: ["liteparse", "llamaparse"],
      modes: ["fixed", "auto"],
      defaults: { engine: "llamaparse", mode: "fixed" },
      parserReady: true,
      llamaparseConfigured: true,
      maxUploadBytes: null,
      supportedExtensions: [".pdf"],
    },
    okf: { provider: "anthropic", model: "claude-haiku-4-5", configured: true },
    features: { mcp: true, packages: true },
  };
}

describe("formatClientUsageSummary", () => {
  it("shows only credits at start", () => {
    assert.equal(
      formatClientUsageSummary(config({ creditsRemaining: 1350 }), "start"),
      "[zipwiki] credits available 1350",
    );
  });

  it("at done shows only services used this run, then remaining", () => {
    const previous = config({
      creditsRemaining: 1350,
      usage: {
        parseCount: 325,
        okfCount: 325,
        liteparseSuccessCount: 3,
        liteparseFailCount: 0,
        parseCreditsSpent: 320,
        okfCreditsSpent: 320,
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-10-01T00:00:00.000Z",
      },
    });
    const current = config({
      creditsRemaining: 1341,
      usage: {
        parseCount: 329,
        okfCount: 330,
        liteparseSuccessCount: 3,
        liteparseFailCount: 0,
        parseCreditsSpent: 328,
        okfCreditsSpent: 325,
        periodStart: "2026-09-01T00:00:00.000Z",
        periodEnd: "2026-10-01T00:00:00.000Z",
      },
    });
    assert.equal(
      formatClientUsageSummary(current, "done", previous),
      [
        "[zipwiki] done",
        "[zipwiki]   LlamaParse   4 files · 8 credits",
        "[zipwiki]   ZipWiki OKF  5 files · 5 credits",
        "[zipwiki]   remaining    1341",
      ].join("\n"),
    );
  });

  it("lists a user LlamaParse key apart from ZipWiki credits", () => {
    const previous = config({
      creditsRemaining: 770,
      usage: {
        parseCount: 0,
        okfCount: 0,
        liteparseSuccessCount: 0,
        liteparseFailCount: 0,
        parseCreditsSpent: 0,
        okfCreditsSpent: 0,
        byoLlamaCount: 0,
        byoLlamaCredits: 0,
        periodStart: "2026-10-01T00:00:00.000Z",
        periodEnd: "2026-11-01T00:00:00.000Z",
      },
    });
    const current = config({
      creditsRemaining: 770,
      usage: {
        parseCount: 0,
        okfCount: 0,
        liteparseSuccessCount: 0,
        liteparseFailCount: 0,
        parseCreditsSpent: 0,
        okfCreditsSpent: 0,
        byoLlamaCount: 5,
        byoLlamaCredits: 441,
        periodStart: "2026-10-01T00:00:00.000Z",
        periodEnd: "2026-11-01T00:00:00.000Z",
      },
    });
    assert.equal(
      formatClientUsageSummary(current, "done", previous),
      [
        "[zipwiki] done",
        "[zipwiki]   LlamaParse   5 files · 441 Llama credits (your key)",
        "[zipwiki]   remaining    770",
      ].join("\n"),
    );
  });
});
