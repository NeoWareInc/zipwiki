import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNoIndexHost, shouldNoIndexBuild } from "./robots-policy";

describe("isNoIndexHost", () => {
  it("flags the rehearsal host", () => {
    assert.equal(isNoIndexHost("dev.zipwiki.ai"), true);
  });

  it("flags the Vercel dev-branch alias", () => {
    assert.equal(isNoIndexHost("zipwiki-web-git-dev-neoware.vercel.app"), true);
  });

  it("allows production hosts", () => {
    assert.equal(isNoIndexHost("zipwiki.ai"), false);
    assert.equal(isNoIndexHost("www.zipwiki.ai"), false);
  });
});

describe("shouldNoIndexBuild", () => {
  it("indexes production builds", () => {
    assert.equal(shouldNoIndexBuild({ VERCEL_ENV: "production" }), false);
  });

  it("noindexes preview and the dev branch", () => {
    assert.equal(shouldNoIndexBuild({ VERCEL_ENV: "preview" }), true);
    assert.equal(shouldNoIndexBuild({ VERCEL_GIT_COMMIT_REF: "dev" }), true);
    assert.equal(
      shouldNoIndexBuild({ SITE_URL: "https://dev.zipwiki.ai" }),
      true,
    );
  });
});
