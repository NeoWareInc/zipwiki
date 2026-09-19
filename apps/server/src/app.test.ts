import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "./app.js";

describe("ZipWiki API (Phase 1b)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  before(async () => {
    delete process.env.CONVEX_SITE_URL;
    delete process.env.CONVEX_URL;
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  it("GET /health reports ok without Convex", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      status: string;
      service: string;
      phase: string;
      database: boolean;
      convex: boolean;
      apiKeysRequired: boolean;
    };
    assert.equal(body.status, "ok");
    assert.equal(body.service, "zipwiki");
    assert.equal(body.phase, "1b");
    assert.equal(body.database, false);
    assert.equal(body.convex, false);
    assert.equal(body.apiKeysRequired, false);
  });

  it("GET / names the ZipWiki API", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { name: string; health: string };
    assert.equal(body.name, "zipwiki");
    assert.equal(body.health, "/health");
  });
});
