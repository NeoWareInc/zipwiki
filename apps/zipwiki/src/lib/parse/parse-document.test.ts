import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_ZIPWIKI_CONFIG,
  type ResolvedZipwikiConfig,
} from "../config/index.js";
import { LiteParseAdapter } from "./adapters/liteparse.js";
import {
  LlamaParseAdapter,
  setLlamaCloudFactory,
  type LlamaCloudClient,
} from "./adapters/llamaparse.js";
import { parseDocument } from "./parse-document.js";
import {
  buildParserManifestFromParts,
  shouldEscalateToLlamaParse,
} from "./parse-quality.js";
import type { DocumentParseResult } from "./types.js";

function project(
  overlay: Partial<ResolvedZipwikiConfig["parser"]> = {},
): ResolvedZipwikiConfig {
  return {
    ...DEFAULT_ZIPWIKI_CONFIG,
    parser: {
      ...DEFAULT_ZIPWIKI_CONFIG.parser,
      ...overlay,
      liteparse: {
        ...DEFAULT_ZIPWIKI_CONFIG.parser.liteparse,
        ...overlay.liteparse,
      },
      llamaparse: {
        ...DEFAULT_ZIPWIKI_CONFIG.parser.llamaparse,
        ...overlay.llamaparse,
      },
      escalate: {
        ...DEFAULT_ZIPWIKI_CONFIG.parser.escalate,
        ...overlay.escalate,
      },
    },
  };
}

function fakeLiteResult(
  overrides: Partial<DocumentParseResult> = {},
): DocumentParseResult {
  return {
    engine: "liteparse",
    text: "# lite\n\nbody",
    complexity: {
      pageCount: 2,
      needsOcrCount: 1,
      needsOcrRatio: 0.5,
      layoutComplexCount: 0,
      layoutComplexRatio: 0,
      reasonCounts: { scanned: 1 },
      layoutReasonCounts: {},
      maxColumnCount: 1,
      pages: [
        {
          page: 1,
          needsOcr: true,
          reasons: ["scanned"],
          textCoverage: 0.1,
          isGarbled: false,
        },
        {
          page: 2,
          needsOcr: false,
          reasons: [],
          textCoverage: 0.9,
          isGarbled: false,
        },
      ],
    },
    ...overrides,
  };
}

describe("shouldEscalateToLlamaParse", () => {
  it("escalates on needsOcrRatio", () => {
    const d = shouldEscalateToLlamaParse(fakeLiteResult().complexity, {
      minNeedsOcrRatio: 0.25,
      minLayoutComplexRatio: 0.5,
    });
    assert.equal(d.escalate, true);
    assert.match(d.reason ?? "", /needsOcrRatio/);
  });

  it("does not escalate below thresholds", () => {
    const d = shouldEscalateToLlamaParse(
      {
        pageCount: 2,
        needsOcrCount: 0,
        needsOcrRatio: 0,
        layoutComplexCount: 0,
        layoutComplexRatio: 0,
        reasonCounts: {},
        layoutReasonCounts: {},
        maxColumnCount: 1,
        pages: [],
      },
      { minNeedsOcrRatio: 0.25, minLayoutComplexRatio: 0.5 },
    );
    assert.equal(d.escalate, false);
  });
});

describe("buildParserManifestFromParts", () => {
  it("records engine and route", () => {
    const m = buildParserManifestFromParts({
      engine: "llamaparse",
      engineVersion: "1.0.0",
      text: "x",
      route: {
        mode: "auto",
        escalatedFrom: "liteparse",
        reason: "needsOcrRatio 0.5 >= 0.25",
      },
    });
    assert.equal(m.engine, "llamaparse");
    assert.equal(m.route?.escalatedFrom, "liteparse");
    assert.equal(m.engineVersion, "1.0.0");
  });
});

describe("parseDocument router", () => {
  it("fixed liteparse uses lite adapter", async () => {
    const lite = {
      id: "liteparse" as const,
      parse: async () => fakeLiteResult({ text: "from-lite" }),
    };
    const result = await parseDocument("/tmp/doc.pdf", {
      project: project({ engine: "liteparse", mode: "fixed" }),
      liteparse: lite as LiteParseAdapter,
    });
    assert.equal(result.engine, "liteparse");
    assert.equal(result.text, "from-lite");
  });

  it("auto escalates to llamaparse when thresholds fire", async () => {
    const lite = {
      id: "liteparse" as const,
      parse: async () => fakeLiteResult(),
    };
    const llama = {
      id: "llamaparse" as const,
      parse: async () =>
        ({
          engine: "llamaparse",
          text: "from-cloud",
        }) satisfies DocumentParseResult,
    };
    const result = await parseDocument("/tmp/doc.pdf", {
      project: project({
        mode: "auto",
        escalate: {
          enabled: true,
          minNeedsOcrRatio: 0.25,
          minLayoutComplexRatio: 0.5,
          onMissingApiKey: "fallback",
        },
      }),
      liteparse: lite as LiteParseAdapter,
      llamaparse: llama as LlamaParseAdapter,
    });
    assert.equal(result.engine, "llamaparse");
    assert.equal(result.text, "from-cloud");
    assert.equal(result.route?.escalatedFrom, "liteparse");
    assert.ok(result.complexity);
  });

  it("auto falls back when key missing and onMissingApiKey=fallback", async () => {
    // Ensure .env.local is applied once, then clear the key for this case.
    const { loadEnvFiles } = await import("../config/index.js");
    loadEnvFiles();
    const prev = process.env.LLAMA_CLOUD_API_KEY;
    delete process.env.LLAMA_CLOUD_API_KEY;
    try {
      const lite = {
        id: "liteparse" as const,
        parse: async () => fakeLiteResult(),
      };
      const result = await parseDocument("/tmp/doc.pdf", {
        project: project({
          mode: "auto",
          escalate: {
            enabled: true,
            minNeedsOcrRatio: 0.25,
            minLayoutComplexRatio: 0.5,
            onMissingApiKey: "fallback",
          },
        }),
        liteparse: lite as LiteParseAdapter,
      });
      assert.equal(result.engine, "liteparse");
      assert.match(result.route?.reason ?? "", /no API key/);
    } finally {
      if (prev !== undefined) process.env.LLAMA_CLOUD_API_KEY = prev;
      else delete process.env.LLAMA_CLOUD_API_KEY;
    }
  });

  it("fixed llamaparse falls back to liteparse when key missing", async () => {
    const { loadEnvFiles } = await import("../config/index.js");
    loadEnvFiles();
    const prev = process.env.LLAMA_CLOUD_API_KEY;
    delete process.env.LLAMA_CLOUD_API_KEY;
    try {
      const lite = {
        id: "liteparse" as const,
        parse: async () => fakeLiteResult({ text: "from-lite-fallback" }),
      };
      const result = await parseDocument("/tmp/doc.pdf", {
        project: project({
          engine: "llamaparse",
          mode: "fixed",
          escalate: {
            enabled: false,
            minNeedsOcrRatio: 0.25,
            minLayoutComplexRatio: 0.5,
            onMissingApiKey: "fallback",
          },
        }),
        liteparse: lite as LiteParseAdapter,
      });
      assert.equal(result.engine, "liteparse");
      assert.equal(result.text, "from-lite-fallback");
      assert.match(result.route?.reason ?? "", /no API key/);
    } finally {
      if (prev !== undefined) process.env.LLAMA_CLOUD_API_KEY = prev;
      else delete process.env.LLAMA_CLOUD_API_KEY;
    }
  });

  it("fixed llamaparse uses llama when injected", async () => {
    const lite = {
      id: "liteparse" as const,
      parse: async () => fakeLiteResult({ text: "should-not-run" }),
    };
    const llama = {
      id: "llamaparse" as const,
      parse: async () =>
        ({
          engine: "llamaparse",
          text: "from-cloud",
        }) satisfies DocumentParseResult,
    };
    const result = await parseDocument("/tmp/doc.pdf", {
      project: project({ engine: "llamaparse", mode: "fixed" }),
      liteparse: lite as LiteParseAdapter,
      llamaparse: llama as LlamaParseAdapter,
    });
    assert.equal(result.engine, "llamaparse");
    assert.equal(result.text, "from-cloud");
  });

  it("fixed llamaparse falls back when llama throws", async () => {
    const lite = {
      id: "liteparse" as const,
      parse: async () => fakeLiteResult({ text: "from-lite-after-error" }),
    };
    const llama = {
      id: "llamaparse" as const,
      parse: async () => {
        throw new Error("cloud down");
      },
    };
    const result = await parseDocument("/tmp/doc.pdf", {
      project: project({
        engine: "llamaparse",
        mode: "fixed",
        escalate: {
          enabled: false,
          minNeedsOcrRatio: 0.25,
          minLayoutComplexRatio: 0.5,
          onMissingApiKey: "fallback",
        },
      }),
      liteparse: lite as LiteParseAdapter,
      llamaparse: llama as LlamaParseAdapter,
    });
    assert.equal(result.engine, "liteparse");
    assert.match(result.route?.reason ?? "", /cloud down/);
  });
});

describe("LlamaParseAdapter", () => {
  it("joins markdown pages from mocked client", async () => {
    const client: LlamaCloudClient = {
      parsing: {
        parse: async () => ({
          markdown: {
            pages: [
              { pageNum: 1, markdown: "# One" },
              { pageNum: 2, markdown: "## Two" },
            ],
          },
        }),
      },
    };
    setLlamaCloudFactory(() => client);
    const tmp = join(tmpdir(), `zc-llama-${Date.now()}.pdf`);
    writeFileSync(tmp, "%PDF-1.4 mock");
    try {
      const adapter = new LlamaParseAdapter(() => client);
      const result = await adapter.parse(tmp, {
        project: DEFAULT_ZIPWIKI_CONFIG,
      });
      assert.equal(result.engine, "llamaparse");
      assert.equal(result.text, "# One\n\n## Two");
      assert.equal(result.pages?.length, 2);
    } finally {
      setLlamaCloudFactory(undefined);
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });

  it("sends disable_ocr to LlamaParse when --no-ocr is set", async () => {
    let seen: Record<string, unknown> | undefined;
    const client: LlamaCloudClient = {
      parsing: {
        parse: async (args) => {
          seen = args;
          return {
            markdown: { pages: [{ pageNum: 1, markdown: "# Native text" }] },
          };
        },
      },
    };
    const tmp = join(tmpdir(), `zc-llama-noocr-${Date.now()}.pdf`);
    writeFileSync(tmp, "%PDF-1.4 mock");
    try {
      const adapter = new LlamaParseAdapter(() => client);
      await adapter.parse(tmp, {
        project: DEFAULT_ZIPWIKI_CONFIG,
        cli: { noOcr: true },
      });
      assert.equal(seen?.disable_ocr, true);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  });
});
