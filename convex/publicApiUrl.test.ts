import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalPublicApiUrl } from "./publicApiUrl.js";

describe("canonicalPublicApiUrl", () => {
  it("uses the dev Fly API for the dev Convex site even when env is localhost", () => {
    assert.equal(
      canonicalPublicApiUrl({
        CONVEX_SITE_URL: "https://dashing-cod-224.convex.site",
        ZIPWIKI_API_URL: "http://localhost:3001",
      }),
      "https://zipwiki-api-dev.fly.dev",
    );
  });

  it("uses production when the site is not dev and the env URL is local", () => {
    assert.equal(
      canonicalPublicApiUrl({
        CONVEX_SITE_URL: "https://example.convex.site",
        ZIPWIKI_API_URL: "http://localhost:3001",
      }),
      "https://api.zipwiki.ai",
    );
  });

  it("normalizes the production Fly host to api.zipwiki.ai", () => {
    assert.equal(
      canonicalPublicApiUrl({
        ZIPWIKI_API_URL: "https://zipwiki-api-prod.fly.dev/",
      }),
      "https://api.zipwiki.ai",
    );
  });
});
