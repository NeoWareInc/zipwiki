import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCliEnv, parseCliEnv, parseCliEnvJson } from "./cli-env.js";

describe("cli-env", () => {
  it("round-trips URL and key", () => {
    const text = formatCliEnv({
      ZIPWIKI_API_URL: "https://api.zipwiki.ai/",
      ZIPWIKI_API_KEY: "zc_live_abc",
    });
    const parsed = parseCliEnv(text);
    assert.equal(parsed.ZIPWIKI_API_URL, "https://api.zipwiki.ai");
    assert.equal(parsed.ZIPWIKI_API_KEY, "zc_live_abc");
  });

  it("parses JSON twin", () => {
    const parsed = parseCliEnvJson({
      version: 1,
      apiUrl: "http://localhost:3001",
      apiKey: "zc_live_x",
    });
    assert.equal(parsed.ZIPWIKI_API_URL, "http://localhost:3001");
    assert.equal(parsed.ZIPWIKI_API_KEY, "zc_live_x");
  });
});
