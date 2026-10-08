import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, after } from "node:test";
import { writeNzipCollectionBundle } from "@zipwiki/zipwiki/archive";
import {
  CATALOG_RESULT_FIELDS,
  CATALOG_ROW_FIELDS,
  buildCatalog,
} from "@zipwiki/zipwiki/access";
import { pathToFileURL } from "node:url";
import { ask, list, open, origin, query, readOkf, readOkfIndex, readParsed, search } from "./handlers.js";

const dir = mkdtempSync(join(tmpdir(), "mcp-nzip-"));
const primary = join(dir, "lease.txt");
const sample = join(dir, "kb.zipwiki");

writeFileSync(primary, "Commercial lease for 100 Main Street warehouse.\n");
const deed = join(dir, "property-deed.pdf");
writeFileSync(deed, "%PDF-1.1\nWarranty deed for 12 Oak Street.\n");
writeNzipCollectionBundle({
  outputPath: sample,
  members: [
    {
      originalPath: primary,
      originalName: "lease.txt",
      structuredMarkdown:
        "# Lease\n\nCommercial lease for 100 Main Street warehouse terms and rent.\n",
      originUri: pathToFileURL(primary).href,
    },
    {
      originalPath: deed,
      originalName: "property-deed.pdf",
      mimeType: "application/pdf",
      structuredMarkdown:
        "# Property Deed\n\nWarranty deed conveying 12 Oak Street.\n",
    },
  ],
  okf: {
    files: [
      {
        name: "lease.md",
        data: [
          "---",
          'type: "Contract"',
          'title: "Warehouse Lease"',
          'description: "Lease covering Main Street warehouse."',
          "tags: [lease, warehouse, commercial]",
          "---",
          "",
          "# Key facts",
          "",
          "- Address: 100 Main Street",
          "",
        ].join("\n"),
      },
      {
        name: "property-deed.md",
        data: [
          "---",
          'type: "Deed"',
          'title: "Property Deed"',
          'description: "Warranty deed for 12 Oak Street."',
          "tags: [deed, property, real-estate]",
          "sources:",
          "  - resource: ../parsed/property-deed.pdf.md",
          "---",
          "",
          "# Key facts",
          "",
          "- 12 Oak Street warranty deed",
          "",
        ].join("\n"),
      },
      {
        name: "index.md",
        data: '---\nokf_version: "0.2"\n---\n\n# Files\n\n* [Warehouse Lease](lease.md) - Lease covering Main Street warehouse.\n* [Property Deed](property-deed.md) - Warranty deed for 12 Oak Street.\n',
      },
    ],
    version: "0.2",
  },
});

describe("MCP handlers", () => {
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("opens a local .zipwiki", async () => {
    const res = await open({ package: sample });
    assert.equal(res.isError, undefined, res.content[0]?.text);
    const text = res.content[0]?.text ?? "";
    assert.match(text, /kb\.zipwiki/);
    assert.match(text, /openSequence/);
    assert.match(text, /"catalog"/);
    const body = JSON.parse(text) as {
      catalog: { rows: Array<{ primary: string; title: string | null; readHints: { next: string[] } }> };
    };
    assert.ok(body.catalog.rows.some((r) => r.primary === "lease.txt"));
    const row = body.catalog.rows.find((r) => r.primary === "lease.txt")!;
    assert.equal(row.title, "Warehouse Lease");
    assert.ok(row.readHints.next.some((h) => h.includes("--okf")));
  });

  it("open catalog matches zipaccess library buildCatalog fields", async () => {
    const res = await open({ package: sample });
    const body = JSON.parse(res.content[0]?.text ?? "{}") as {
      catalog: Record<string, unknown> & {
        rows: Array<Record<string, unknown>>;
      };
    };
    const cli = buildCatalog(sample);
    for (const key of CATALOG_RESULT_FIELDS) {
      assert.ok(key in body.catalog, `MCP open.catalog missing ${key}`);
    }
    assert.equal(body.catalog.primaryCount, cli.primaryCount);
    assert.equal(body.catalog.okfPresent, cli.okfPresent);
    assert.equal(body.catalog.conceptCount, cli.conceptCount);
    assert.deepEqual(body.catalog.rows, cli.rows);
    const row = body.catalog.rows[0]!;
    for (const key of CATALOG_ROW_FIELDS) {
      assert.ok(key in row, `catalog row missing ${key}`);
    }
  });

  it("search deed then read_okf then read_parsed", async () => {
    const found = await search({ package: sample, query: "deed" });
    assert.equal(found.isError, undefined, found.content[0]?.text);
    const searchBody = JSON.parse(found.content[0]?.text ?? "{}") as {
      hits: Array<{
        path: string;
        readHints?: { okfStem?: string; parsedName?: string; next: string[] };
      }>;
    };
    const hit = searchBody.hits.find(
      (h) =>
        /deed/i.test(h.path) ||
        h.readHints?.okfStem === "property-deed" ||
        h.readHints?.parsedName === "property-deed.pdf",
    );
    assert.ok(hit, "expected a deed hit");
    const stem = hit!.readHints?.okfStem ?? "property-deed";
    const parsedName = hit!.readHints?.parsedName ?? "property-deed.pdf";

    const okf = await readOkf({ package: sample, stem });
    assert.equal(okf.isError, undefined, okf.content[0]?.text);
    const okfBody = JSON.parse(okf.content[0]?.text ?? "{}") as { text?: string };
    assert.match(okfBody.text ?? "", /deed/i);

    const parsed = await readParsed({ package: sample, name: parsedName });
    assert.equal(parsed.isError, undefined, parsed.content[0]?.text);
    const parsedBody = JSON.parse(parsed.content[0]?.text ?? "{}") as {
      text?: string;
    };
    assert.match(parsedBody.text ?? "", /Oak Street/);
  });

  it("lists entries", async () => {
    const res = await list({ package: sample });
    assert.equal(res.isError, undefined, res.content[0]?.text);
    assert.match(res.content[0]?.text ?? "", /META-INF\/manifest\.json/);
  });

  it("reads okf index or concept list", async () => {
    const res = await readOkfIndex({ package: sample });
    assert.equal(res.isError, undefined, res.content[0]?.text);
    assert.ok((res.content[0]?.text ?? "").length > 10);
  });

  it("query returns hits and top-K bodies", async () => {
    const res = await query({
      package: sample,
      query: "warehouse lease",
      readTopK: 1,
    });
    assert.equal(res.isError, undefined, res.content[0]?.text);
    const body = JSON.parse(res.content[0]?.text ?? "{}") as {
      hits: Array<{ path: string; readHints?: { next: string[] } }>;
      topK: Array<{ path: string; text?: string }>;
    };
    assert.ok(body.hits.length >= 1);
    assert.ok(body.hits[0]!.readHints?.next.some((h) => h.includes("read --")));
    assert.ok(body.topK.length >= 1);
    assert.match(body.topK[0]!.text ?? "", /Main Street/);
  });

  it("origin returns URI and fetch verifies CRC-32", async () => {
    const loc = await origin({ package: sample, path: "lease.txt" });
    assert.equal(loc.isError, undefined, loc.content[0]?.text);
    const body = JSON.parse(loc.content[0]?.text ?? "{}") as {
      originUri?: string;
      originCrc32?: string;
      originMtimeUtc?: string;
      primaryPath?: string;
    };
    assert.equal(body.primaryPath, "lease.txt");
    assert.ok(body.originUri?.startsWith("file:"));
    assert.equal(typeof body.originCrc32, "string");
    assert.match(body.originCrc32 ?? "", /^[0-9a-f]{8}$/);

    const fetched = await origin({
      package: sample,
      path: "wiki/parsed/lease.txt.md",
      fetch: true,
    });
    assert.equal(fetched.isError, undefined, fetched.content[0]?.text);
    const verify = JSON.parse(fetched.content[0]?.text ?? "{}") as {
      verified: boolean;
      crc32: { matched?: boolean };
    };
    assert.equal(verify.verified, true);
    assert.equal(verify.crc32.matched, true);

    const parsed = await readParsed({ package: sample, name: "lease.txt" });
    const parsedBody = JSON.parse(parsed.content[0]?.text ?? "{}") as {
      origin?: { originUri?: string };
    };
    assert.ok(parsedBody.origin?.originUri?.startsWith("file:"));
  });

  it("ask does not call the model when nothing matches", async () => {
    let called = 0;
    const res = await ask({
      package: sample,
      question: "zzqqqqqq",
      env: { ZIPWIKI_API_URL: "https://example.test", ZIPWIKI_API_KEY: "test" },
      fetchImpl: async () => {
        called += 1;
        return new Response("{}", { status: 200 });
      },
    });
    assert.equal(res.isError, undefined, res.content[0]?.text);
    assert.equal(called, 0);
    const body = JSON.parse(res.content[0]?.text ?? "{}") as { answer?: string; model?: string };
    assert.match(body.answer ?? "", /No matching text was found/);
    assert.equal(body.model, "");
  });

  it("ask sends parsed passages before the concept card", async () => {
    const res = await ask({
      package: sample,
      question: "Oak Street warranty",
      env: { ZIPWIKI_API_URL: "https://example.test", ZIPWIKI_API_KEY: "test" },
      fetchImpl: async (_url, init) => {
        const payload = JSON.parse(String(init?.body)) as {
          excerpts: Array<{ kind: string; path: string }>;
        };
        const parsedAt = payload.excerpts.findIndex(
          (row) => row.kind === "parsed" && row.path.includes("wiki/parsed/"),
        );
        const cardAt = payload.excerpts.findIndex((row) => row.kind === "okf");
        assert.ok(parsedAt >= 0);
        assert.ok(cardAt > parsedAt);
        return new Response(
          JSON.stringify({
            status: "answer",
            answer: "Warranty deed conveying 12 Oak Street.",
            model: "claude-haiku-5-5",
            creditsCharged: 2,
            creditsRemaining: 40,
            creditsUnlimited: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assert.equal(res.isError, undefined, res.content[0]?.text);
    const body = JSON.parse(res.content[0]?.text ?? "{}") as {
      answer?: string;
      creditsCharged?: number;
      creditsRemaining?: number;
      model?: string;
    };
    assert.match(body.answer ?? "", /12 Oak Street/);
    assert.equal(body.model, "claude-haiku-5-5");
    assert.equal(body.creditsCharged, 2);
    assert.equal(body.creditsRemaining, 40);
  });

  it("ask rejects a blank question and missing login without calling the model", async () => {
    let called = 0;
    const fetchImpl: typeof fetch = async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    };
    const blank = await ask({
      package: sample,
      question: "   ",
      env: { ZIPWIKI_API_URL: "https://example.test", ZIPWIKI_API_KEY: "test" },
      fetchImpl,
    });
    assert.equal(blank.isError, true);
    assert.match(blank.content[0]?.text ?? "", /question is required/);

    const signedOut = await ask({
      package: sample,
      question: "Oak Street",
      env: {},
      fetchImpl,
    });
    assert.equal(signedOut.isError, true);
    assert.match(signedOut.content[0]?.text ?? "", /zipwiki login/);
    assert.equal(called, 0);
  });
});
