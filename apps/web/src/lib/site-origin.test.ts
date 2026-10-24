import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absoluteUrl, resolveSiteOrigin } from "./site-origin";

describe("resolveSiteOrigin", () => {
  it("prefers SITE_URL", () => {
    assert.equal(
      resolveSiteOrigin({ SITE_URL: "https://dev.zipwiki.ai/" }),
      "https://dev.zipwiki.ai",
    );
  });

  it("uses production when VERCEL_ENV is production", () => {
    assert.equal(
      resolveSiteOrigin({ VERCEL_ENV: "production" }),
      "https://zipwiki.ai",
    );
  });

  it("maps the dev branch to dev.zipwiki.ai", () => {
    assert.equal(
      resolveSiteOrigin({ VERCEL_GIT_COMMIT_REF: "dev" }),
      "https://dev.zipwiki.ai",
    );
  });
});

describe("absoluteUrl", () => {
  it("joins origin and path", () => {
    assert.equal(
      absoluteUrl("https://zipwiki.ai", "/resources/introducing-zipwiki"),
      "https://zipwiki.ai/resources/introducing-zipwiki",
    );
  });
});
