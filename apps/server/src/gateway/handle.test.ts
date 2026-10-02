import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApp } from "../app.js";
import { handleOkf, handleParse, handleQueryAnswer } from "./handle.js";
import type { ConvexGateway } from "./types.js";

function convex(partial: Partial<ConvexGateway> & Pick<ConvexGateway, "validateKey">): ConvexGateway {
  return {
    recordUsage: async () => ({
      creditsRemaining: 10,
      lowCredits: false,
      autoReload: false,
    }),
    getAccountSettings: async () => ({
      settings: {},
      setupComplete: true,
      setupCompletedAt: null,
      updatedAt: null,
      setupUrl: null,
    }),
    putAccountSettings: async () => ({
      settings: {},
      setupComplete: true,
      setupCompletedAt: null,
      updatedAt: null,
      setupUrl: null,
    }),
    getClientConfig: async () => ({}),
    recordLiteparse: async () => {},
    recordActivity: async () => {},
    queryBilling: async () => ({
      ok: true as const,
      accountId: "acc",
      disabled: false,
      creditsRemaining: 10,
      creditsUnlimited: false,
      creditsLocked: false,
    }),
    recordQuery: async () => ({
      creditsCharged: 1,
      creditsRemaining: 9,
      creditsUnlimited: false,
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

  it("debits the LlamaParse job credits after a successful parse", async () => {
    const recorded: Array<{
      provider?: string;
      pages?: number;
      llamaCredits?: number;
    }> = [];
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
          if (href.includes("/api/v2/parse/upload")) {
            return json({ id: "job1", status: "PENDING" });
          }
          if (href.includes("/api/v2/parse/job1")) {
            return json({
              job: { id: "job1", status: "COMPLETED", usage: { credits: 20 } },
              markdown: {
                pages: [
                  { page_number: 1, markdown: "# Deed" },
                  { page_number: 2, markdown: "Grantor" },
                ],
              },
            });
          }
          throw new Error(`unexpected ${href}`);
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
    assert.equal(recorded[0]?.llamaCredits, 20);
  });

  it("falls back to LiteParse when LlamaParse times out", async () => {
    const progress: Array<{ status: string; progress?: number }> = [];
    let now = 0;
    const realDateNow = Date.now;
    Date.now = () => now;
    try {
      const result = await handleParse(
        {
          convex: convex({
            async validateKey() {
              return {
                ok: true,
                accountId: "acc",
                billable: true,
                fallback: false,
              };
            },
            async recordUsage() {
              throw new Error("should not debit on timeout");
            },
          }),
          env: { LLAMA_CLOUD_API_KEY: "master" },
          sleep: async () => {
            now += 30_000;
          },
          llamaWait: {
            maxWaitMs: 90_000,
            progressEveryMs: 60_000,
            pollIntervalMs: 1,
          },
          fetchImpl: async (url) => {
            const href = String(url);
            if (href.includes("/api/v2/parse/upload")) {
              return json({ id: "slow", status: "PENDING" });
            }
            if (href.includes("/api/v2/parse/slow")) {
              return json({
                job: { id: "slow", status: "PENDING" },
              });
            }
            throw new Error(`unexpected ${href}`);
          },
        },
        {
          token: "zw",
          filename: "big.pdf",
          bytes: new Uint8Array([1]),
          onProgress: (info) =>
            progress.push({ status: info.status, progress: info.progress }),
        },
      );
      assert.equal(result.status, 200);
      const body = result.body as {
        forcedEngine?: string;
        fallbackReason?: string;
        lastStatus?: string;
      };
      assert.equal(body.forcedEngine, "liteparse");
      assert.equal(body.fallbackReason, "llamaparse_timeout");
      assert.equal(body.lastStatus, "PENDING");
      assert.ok(progress.length >= 1);
      assert.equal(progress[0]?.status, "PENDING");
      assert.equal(progress[0]?.progress, undefined);
    } finally {
      Date.now = realDateNow;
    }
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

describe("POST /api/query/answer", () => {
  it("rejects a caller that does not present the worker secret", async () => {
    const app = await buildApp({
      env: { ZIPWIKI_WORKER_SECRET: "worker", ANTHROPIC_API_KEY: "master" },
      fetchImpl: async () => {
        throw new Error("should not call Claude");
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/query/answer",
      headers: { "content-type": "application/json" },
      payload: {
        question: "Who signed it?",
        excerpts: [{ path: "wiki/okf/deed.md", kind: "okf", text: "Grantor signed." }],
      },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  it("returns the model answer when the worker secret matches", async () => {
    let prompt = "";
    const app = await buildApp({
      env: { ZIPWIKI_WORKER_SECRET: "worker", ANTHROPIC_API_KEY: "master" },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: Array<{ content?: string }>;
        };
        prompt = body.messages?.[0]?.content ?? "";
        return json({
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: "The grantor signed the deed." }],
          usage: { input_tokens: 12, output_tokens: 8 },
        });
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/query/answer",
      headers: {
        "content-type": "application/json",
        "x-zipwiki-worker-secret": "worker",
      },
      payload: {
        question: "Who signed it?",
        excerpts: [
          {
            path: "wiki/okf/deed.md",
            kind: "okf",
            text: "Grantor signed.",
            documents: ["wiki/parsed/deed.pdf.md"],
          },
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { answer: string; inputTokens: number };
    assert.equal(body.answer, "The grantor signed the deed.");
    assert.equal(body.inputTokens, 12);
    assert.match(prompt, /wiki\/parsed\/deed\.pdf\.md/);
    const answered = res.json() as { status: string };
    assert.equal(answered.status, "answer");
    await app.close();
  });

  it("returns one read when the model asks for a package path", async () => {
    const app = await buildApp({
      env: { ZIPWIKI_WORKER_SECRET: "worker", ANTHROPIC_API_KEY: "master" },
      fetchImpl: async () =>
        json({
          model: "claude-haiku-4-5",
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "read_zipwiki",
              input: { path: "wiki/parsed/deed.pdf.md" },
            },
          ],
          usage: { input_tokens: 4, output_tokens: 2 },
        }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/query/answer",
      headers: {
        "content-type": "application/json",
        "x-zipwiki-worker-secret": "worker",
      },
      payload: {
        question: "What parcel?",
        excerpts: [
          { path: "wiki/okf/deed.md", kind: "okf", text: "See the deed." },
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      status: string;
      reads: Array<{ id: string; path: string }>;
    };
    assert.equal(body.status, "read");
    assert.deepEqual(body.reads, [
      { id: "tool_1", path: "wiki/parsed/deed.pdf.md" },
    ]);
    await app.close();
  });

  it("forwards an unparsed binary so the caller can refuse it", async () => {
    const app = await buildApp({
      env: { ZIPWIKI_WORKER_SECRET: "worker", ANTHROPIC_API_KEY: "master" },
      fetchImpl: async () =>
        json({
          model: "claude-haiku-4-5",
          content: [
            {
              type: "tool_use",
              id: "tool_2",
              name: "read_zipwiki",
              input: { path: "legacy.docx" },
            },
          ],
          usage: { input_tokens: 4, output_tokens: 2 },
        }),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/query/answer",
      headers: {
        "content-type": "application/json",
        "x-zipwiki-worker-secret": "worker",
      },
      payload: {
        question: "What is in the legacy file?",
        excerpts: [
          {
            path: "legacy.docx",
            kind: "gap",
            text: "No extracted text was stored for this file at pack time.",
          },
        ],
      },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { reads: Array<{ path: string }> };
    assert.equal(body.reads[0]?.path, "legacy.docx");
    await app.close();
  });

  it("reports the key missing without calling Claude", async () => {
    const result = await handleQueryAnswer(
      {
        convex: convex({
          async validateKey() {
            return { ok: true, accountId: "acc", billable: true, fallback: false };
          },
        }),
        env: { ZIPWIKI_WORKER_SECRET: "worker" },
        fetchImpl: async () => {
          throw new Error("should not call Claude");
        },
      },
      {
        question: "Who signed it?",
        excerpts: [{ path: "wiki/okf/deed.md", kind: "okf", text: "Grantor signed." }],
      },
    );
    assert.equal(result.status, 503);
    assert.equal((result.body as { error: string }).error, "anthropic_not_configured");
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
