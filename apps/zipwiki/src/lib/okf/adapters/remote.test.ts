import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OKF_PARSE_SAMPLE_CHARS } from "../parse-sample.js";
import { RemoteOkfAdapter } from "./remote.js";

describe("RemoteOkfAdapter", () => {
  it("POSTs JSON to /api/okf/enrich", async () => {
    let seenUrl = "";
    const adapter = new RemoteOkfAdapter({
      api: { url: "http://api.example.com", key: "k" },
      fetchImpl: async (url) => {
        seenUrl = String(url);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              title: "Test",
              description: "Desc",
              type: "Document",
              tags: ["test"],
              keyFacts: ["a", "b", "c"],
            }),
        } as Response;
      },
    });

    const enrichment = await adapter.enrich({
      primaries: [{ path: "doc.pdf", documentType: "Generic" }],
      parsedMarkdown: "# Sample\n\nBody text for OKF enrichment testing.",
      useAi: true,
    });

    assert.equal(seenUrl, "http://api.example.com/api/okf/enrich");
    assert.equal(enrichment.title, "Test");
  });

  it("posts only the OKF parse sample when the parse is large", async () => {
    let posted = "";
    const adapter = new RemoteOkfAdapter({
      api: { url: "http://api.example.com", key: "k" },
      fetchImpl: async (_url, init) => {
        posted = String(init?.body ?? "");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              title: "Chapter",
              description: "Desc",
              type: "Document",
              tags: ["law"],
              keyFacts: ["a", "b", "c"],
            }),
        } as Response;
      },
    });

    const parsedMarkdown = "A".repeat(2_500_000);
    await adapter.enrich({
      primaries: [{ path: "Ch_2025-198.pdf", documentType: "Generic" }],
      parsedMarkdown,
      useAi: true,
    });

    const body = JSON.parse(posted) as { parsedMarkdown: string };
    assert.ok(body.parsedMarkdown.startsWith("A".repeat(100)));
    assert.ok(body.parsedMarkdown.length < OKF_PARSE_SAMPLE_CHARS + 80);
    assert.ok(posted.length < 100_000);
  });
});
