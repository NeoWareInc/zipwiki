import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_ZIPWIKI_CONFIG,
  type ResolvedZipwikiConfig,
} from "../../config/index.js";
import { RemoteParseAdapter } from "./remote.js";
import type { DocumentParseResult } from "../types.js";

function project(): ResolvedZipwikiConfig {
  return { ...DEFAULT_ZIPWIKI_CONFIG };
}

describe("RemoteParseAdapter", () => {
  it("POSTs multipart to /api/parse and maps JSON", async () => {
    const tmp = join(tmpdir(), `remote-parse-${Date.now()}.txt`);
    writeFileSync(tmp, "Remote parse adapter integration body text for yield.", "utf8");

    const fakeResult: DocumentParseResult = {
      engine: "liteparse",
      text: "# Remote\n\nparsed body",
    };

    let seenUrl = "";
    let seenAuth = "";
    const fetchImpl = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      seenUrl = String(url);
      const headers = init?.headers as Record<string, string> | undefined;
      seenAuth = headers?.Authorization ?? "";
      assert.ok(init?.body instanceof FormData);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fakeResult),
      } as Response;
    };

    const adapter = new RemoteParseAdapter({
      api: { url: "http://api.example.com", key: "test-key" },
      fetchImpl,
    });

    const result = await adapter.parse(tmp, {
      project: project(),
      cli: { maxPages: 2, noOcr: true },
    });

    unlinkSync(tmp);

    assert.equal(seenUrl, "http://api.example.com/api/parse");
    assert.equal(seenAuth, "Bearer test-key");
    assert.equal(result.text, fakeResult.text);
    assert.equal(result.engine, "liteparse");
  });

  it("throws when ZIPWIKI_API_URL is missing", async () => {
    const tmp = join(tmpdir(), `remote-parse-${Date.now()}.txt`);
    writeFileSync(tmp, "body", "utf8");
    const adapter = new RemoteParseAdapter({ api: { url: undefined } });
    await assert.rejects(
      () => adapter.parse(tmp, { project: project() }),
      /ZIPWIKI_API_URL/,
    );
    unlinkSync(tmp);
  });

  it("throws a quota code so the caller can use LiteParse", async () => {
    const tmp = join(tmpdir(), `remote-parse-${Date.now()}.txt`);
    writeFileSync(tmp, "body", "utf8");
    const fetchImpl = async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            engine: "liteparse",
            text: "",
            forcedEngine: "liteparse",
            fallbackReason: "quota_fallback_free",
          }),
      }) as Response;
    const adapter = new RemoteParseAdapter({
      api: { url: "http://api.example.com", key: "k" },
      fetchImpl,
    });
    await assert.rejects(
      () => adapter.parse(tmp, { project: project(), cli: { quiet: true } }),
      (err: unknown) =>
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "quota_fallback_free",
    );
    unlinkSync(tmp);
  });

  it("surfaces API errors from JSON body", async () => {
    const tmp = join(tmpdir(), `remote-parse-${Date.now()}.txt`);
    writeFileSync(tmp, "body", "utf8");

    const fetchImpl = async (): Promise<Response> =>
      ({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({ error: "parse_yield_failed", reason: "empty" }),
      }) as Response;

    const adapter = new RemoteParseAdapter({
      api: { url: "http://api.example.com", key: "k" },
      fetchImpl,
    });

    await assert.rejects(
      () => adapter.parse(tmp, { project: project() }),
      /422.*parse_yield_failed/,
    );
    unlinkSync(tmp);
  });
});
