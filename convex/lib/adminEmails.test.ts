import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bootstrapAdminEmails, isBootstrapAdminEmail } from "./adminEmails.js";

describe("adminEmails", () => {
  it("includes steve and admin@neoware.io by default", () => {
    const emails = bootstrapAdminEmails({});
    assert.ok(emails.includes("steve@neoware.io"));
    assert.ok(emails.includes("admin@neoware.io"));
  });

  it("merges AUTH_ADMIN_EMAILS", () => {
    const emails = bootstrapAdminEmails({
      AUTH_ADMIN_EMAILS: "Ops@NeoWare.io, steve@neoware.io",
    });
    assert.ok(emails.includes("ops@neoware.io"));
    assert.equal(emails.filter((e) => e === "steve@neoware.io").length, 1);
  });

  it("matches allowlisted emails case-insensitively", () => {
    assert.equal(isBootstrapAdminEmail("Steve@NeoWare.io", {}), true);
    assert.equal(isBootstrapAdminEmail("other@example.com", {}), false);
  });
});
