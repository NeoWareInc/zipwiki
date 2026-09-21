import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../app.js";
import { handleOkf, handleParse } from "./handle.js";
import type { ConvexGateway } from "./types.js";

function convex(partial: Partial<ConvexGateway> & Pick<ConvexGateway, "validateKey">): ConvexGateway {
  return {
    recordUsage: async () => ({
      creditsRemaining: 10,
      lowCredits: false,
      autoReload: false,
    }),
    ...partial,
  };
}

describe("hosted gateway", () => {
  it("returns the LiteParse fallback without calling LlamaParse", async () => {
    let fetched = false;
    const result = await handleParse(
      {
        convex: convex({
          async validateKey() {
            return {
              ok: true,
              accountId: "acc",
              billable: false,
              fallback: true,
            };
          },
        }),
        fetchImpl: async () => {
          fetched = true;
          throw new Error("vendor");
        },
        env: { LLAMA_CLOUD_API_KEY: "master" },
      },
      { token: "zw", filename: "a.pdf", bytes: new Uint8Array([1]) },
    );
    assert.equal(result.status, 200);
    assert.equal(fetched, false);
    const body = result.body as { fallbackReason?: string; forcedEngine?: string };
    assert.equal(body.fallbackReason, "quota_fallback_free");
    assert.equal(body.forcedEngine, "liteparse");
  });

  it("debits one parse after LlamaParse succeeds", async () => {
    const recorded: Array<{ provider?: string; pages?: number }> = [];
    const result = await handleParse(
      {
        convex: convex({
          async validateKey() {
            return { ok: true, accountId: "acc", billable: true, fallback: false };
          },
          async recordUsage(args) {
            recorded.push(args.usage);
            return { creditsRemaining: 9, lowCredits: false, autoReload: false };
          },
        }),
        env: { LLAMA_CLOUD_API_KEY: "master" },
        sleep: async () => {},
        fetchImpl: async (url) => {
          const href = String(url);
          if (href.endsWith("/upload")) {
            return json({ id: "job1", status: "PENDING" });
          }
          if (href.endsWith("/job/job1")) {
            return json({ id: "job1", status: "SUCCESS" });
          }
          return json({
            pages: [{ page: 1, md: "# Deed" }, { page: 2, md: "Grantor" }],
          });
        },
      },
      { token: "zw", filename: "deed.pdf", bytes: new Uint8Array([1, 2, 3]) },
    );
    assert.equal(result.status, 200);
    const body = result.body as { engine: string; text: string };
    assert.equal(body.engine, "llamaparse");
    assert.match(body.text, /Deed/);
    assert.equal(recorded[0]?.provider, "llamaparse");
    assert.equal(recorded[0]?.pages, 2);
  });

  it("returns okf_fallback_host_llm without calling Claude", async () => {
    const app = await buildApp({
      convex: convex({
        async validateKey() {
          return { ok: true, accountId: "acc", billable: false, fallback: true };
        },
        async recordUsage() {
          throw new Error("should not debit");
        },
      }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/okf/enrich",
      headers: {
        authorization: "Bearer test-key",
        "content-type": "application/json",
      },
      payload: { primaries: [{ path: "deed.pdf" }] },
    });
    assert.equal(res.statusCode, 402);
    assert.equal(res.json().code, "okf_fallback_host_llm");
    await app.close();
  });

  it("debits one completion after Claude succeeds", async () => {
    const recorded: string[] = [];
    const result = await handleOkf(
      {
        convex: convex({
          async validateKey() {
            return { ok: true, accountId: "acc", billable: true, fallback: false };
          },
          async recordUsage(args) {
            recorded.push(args.usage.provider);
            return { creditsRemaining: 4, lowCredits: true, autoReload: false };
          },
        }),
        env: { ANTHROPIC_API_KEY: "master" },
        fetchImpl: async () =>
          json({
            model: "claude-haiku-4-5",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  title: "Warranty deed",
                  description: "A deed transferring property.",
                  type: "Deed",
                  tags: ["deed"],
                  keyFacts: ["Grantor signs the deed"],
                }),
              },
            ],
            usage: { input_tokens: 20, output_tokens: 30 },
          }),
      },
      { token: "zw", input: { primaries: [{ path: "deed.pdf" }] } },
    );
    assert.equal(result.status, 200);
    const body = result.body as { title: string };
    assert.equal(body.title, "Warranty deed");
    assert.deepEqual(recorded, ["anthropic"]);
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
