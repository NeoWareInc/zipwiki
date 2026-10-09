import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPackageDigest,
  packageDigestCatalog,
  resolvePackageDigest,
} from "./package-digest-ai.js";
import { PACKAGE_DIGEST_MAX_CHARS } from "./package-digest.js";

const entries = [
  { href: "a.md", title: "Alpha deed", description: "Warranty deed for Oak Street." },
  { href: "m.md", title: "Middle lease", description: "Commercial lease for a warehouse." },
  { href: "z.md", title: "Zoning memo", description: "County zoning limits on the parcel." },
];

describe("package digest model", () => {
  it("asks the model and keeps the document count inside 500 characters", async () => {
    let seen = "";
    const digest = await resolvePackageDigest({
      entries,
      useAi: true,
      generate: async (input) => {
        seen = input.catalog;
        assert.equal(input.count, 3);
        return "Property records covering a deed, a warehouse lease, and county zoning.";
      },
    });
    assert.match(seen, /Alpha deed/);
    assert.match(seen, /Zoning memo/);
    assert.equal(
      digest,
      "3 documents: Property records covering a deed, a warehouse lease, and county zoning.",
    );
    assert.ok(digest!.length <= PACKAGE_DIGEST_MAX_CHARS);
  });

  it("drops a count the model added and still prefixes the real count", () => {
    assert.equal(
      clampPackageDigest("12 documents: Deeds and leases.", 3),
      "3 documents: Deeds and leases.",
    );
  });

  it("cuts a long model summary at the cap", () => {
    const digest = clampPackageDigest("word ".repeat(200), 4);
    assert.ok(digest.length <= PACKAGE_DIGEST_MAX_CHARS);
    assert.match(digest, /^4 documents: /);
    assert.ok(digest.endsWith("…"));
  });

  it("gives every card a line when the catalog is long", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      href: `f${i}.md`,
      title: `Title ${i}`,
      description: "x".repeat(4_000),
    }));
    const catalog = packageDigestCatalog(many, 2_000);
    assert.equal(catalog.split("\n").length, 40);
    assert.ok(catalog.length <= 2_000 + 40);
    assert.match(catalog, /Title 0/);
    assert.match(catalog, /Title 39/);
  });

  it("keeps the local join when AI is off or the model fails", async () => {
    let calls = 0;
    const off = await resolvePackageDigest({
      entries,
      useAi: false,
      generate: async () => {
        calls += 1;
        return "should not run";
      },
    });
    assert.equal(calls, 0);
    assert.match(off!, /^3 documents: /);
    assert.match(off!, /Warranty deed for Oak Street/);

    const failed = await resolvePackageDigest({
      entries,
      useAi: true,
      generate: async () => {
        throw new Error("model down");
      },
    });
    assert.equal(failed, off);
  });
});
