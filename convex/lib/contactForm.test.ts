import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTACT_MAX_PER_EMAIL,
  CONTACT_WINDOW_MS,
  contactHtml,
  contactRateLimited,
  normalizeContact,
} from "./contactForm.js";

const now = 1_700_000_000_000;

describe("normalizeContact", () => {
  it("trims fields and lowercases the email", () => {
    const parsed = normalizeContact({
      name: "  Ada   Lovelace ",
      email: "Ada@Example.com",
      subject: "  Pack help ",
      message: "  How do I pack a folder?\n",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.value, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      subject: "Pack help",
      message: "How do I pack a folder?",
    });
  });

  it("rejects a missing email", () => {
    const parsed = normalizeContact({
      name: "Ada",
      email: "not-an-email",
      subject: "Hi",
      message: "Hello",
    });
    assert.equal(parsed.ok, false);
  });
});

describe("contactRateLimited", () => {
  it("allows a first message", () => {
    assert.equal(
      contactRateLimited({ emailTimes: [], recentTimes: [], now }),
      null,
    );
  });

  it("stops a fourth message from the same email inside an hour", () => {
    const emailTimes = Array.from(
      { length: CONTACT_MAX_PER_EMAIL },
      (_, index) => now - index * 1000,
    );
    const reason = contactRateLimited({
      emailTimes,
      recentTimes: emailTimes,
      now,
    });
    assert.match(reason ?? "", /wait an hour/);
  });

  it("allows the same email after the window", () => {
    const old = now - CONTACT_WINDOW_MS - 1;
    assert.equal(
      contactRateLimited({
        emailTimes: [old, old, old],
        recentTimes: [old],
        now,
      }),
      null,
    );
  });
});

describe("contactHtml", () => {
  it("escapes message markup", () => {
    const html = contactHtml({
      name: "Ada",
      email: "ada@example.com",
      subject: "Hi",
      message: "<script>alert(1)</script>",
    });
    assert.equal(html.includes("<script>"), false);
    assert.match(html, /&lt;script&gt;/);
  });
});
