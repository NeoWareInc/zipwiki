import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { allowedAuthOrigins, resolveAuthRedirect } from "./authRedirects.js";

describe("authRedirects", () => {
  const prev = {
    SITE_URL: process.env.SITE_URL,
    WEB_ORIGIN: process.env.WEB_ORIGIN,
  };

  afterEach(() => {
    if (prev.SITE_URL === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev.SITE_URL;
    if (prev.WEB_ORIGIN === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = prev.WEB_ORIGIN;
  });

  it("allows localhost even when SITE_URL is Vercel", () => {
    process.env.SITE_URL = "https://zipwiki.ai";
    process.env.WEB_ORIGIN =
      "https://zipwiki.ai,http://localhost:5173";
    assert.equal(
      resolveAuthRedirect("http://localhost:5173/dashboard"),
      "http://localhost:5173/dashboard",
    );
    assert.equal(
      resolveAuthRedirect("https://zipwiki.ai/dashboard"),
      "https://zipwiki.ai/dashboard",
    );
  });

  it("prefixes relative paths with SITE_URL", () => {
    process.env.SITE_URL = "https://zipwiki.ai";
    assert.equal(
      resolveAuthRedirect("/dashboard"),
      "https://zipwiki.ai/dashboard",
    );
  });

  it("rejects unknown origins", () => {
    process.env.SITE_URL = "https://zipwiki.ai";
    process.env.WEB_ORIGIN = "https://zipwiki.ai";
    assert.throws(() => resolveAuthRedirect("https://evil.example/phish"));
    assert.throws(() =>
      resolveAuthRedirect("https://evil-neoware.vercel.app/dashboard"),
    );
  });

  it("allows any localhost port", () => {
    process.env.SITE_URL = "https://zipwiki.ai";
    delete process.env.WEB_ORIGIN;
    assert.equal(
      resolveAuthRedirect("http://localhost:5174/signed-in"),
      "http://localhost:5174/signed-in",
    );
  });

  it("allows this project's Vercel aliases without listing each one", () => {
    process.env.SITE_URL = "https://zipwiki-web.vercel.app";
    delete process.env.WEB_ORIGIN;
    assert.equal(
      resolveAuthRedirect("https://zipwiki-web-dev.vercel.app/dashboard"),
      "https://zipwiki-web-dev.vercel.app/dashboard",
    );
    assert.equal(
      resolveAuthRedirect("https://zipwiki-cr0jjilji-neoware.vercel.app/login"),
      "https://zipwiki-cr0jjilji-neoware.vercel.app/login",
    );
  });

  it("always includes localhost:5173 in the allowlist", () => {
    process.env.SITE_URL = "https://zipwiki.ai";
    delete process.env.WEB_ORIGIN;
    assert.ok(allowedAuthOrigins().includes("http://localhost:5173"));
    assert.ok(allowedAuthOrigins().includes("http://localhost:3000"));
  });
});
