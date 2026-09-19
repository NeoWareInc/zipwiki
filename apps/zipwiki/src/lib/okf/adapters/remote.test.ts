import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
});
