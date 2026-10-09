import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPackageDigest,
  packageDigestIndexText,
  resolvePackageDigest,
} from "./package-digest-ai.js";
import { PACKAGE_DIGEST_MAX_CHARS } from "./package-digest.js";

const entries = [
  { href: "a.md", title: "Alpha deed", description: "Warranty deed for Oak Street." },
  { href: "m.md", title: "Middle lease", description: "Commercial lease for a warehouse." },
  { href: "z.md", title: "Zoning memo", description: "County zoning limits on the parcel." },
];

describe("package digest model", () => {
  it("asks the model and keeps the document count inside 1000 characters", async () => {
    let seen = "";
    const digest = await resolvePackageDigest({
      entries,
      useAi: true,
      generate: async (input) => {
        seen = input.index;
        assert.equal(input.count, 3);
        assert.match(input.index, /# Files/);
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

  it("keeps every index bullet when the file is long", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      href: `f${i}.md`,
      title: `Title ${i}`,
      description: "x".repeat(4_000),
    }));
    const index = packageDigestIndexText(many, undefined, 2_000);
    assert.ok(index.length <= 2_000);
    assert.match(index, /# Files/);
    assert.match(index, /Title 0/);
    assert.match(index, /Title 39/);
  });

  it("sends the on-disk index instead of a rebuilt list", async () => {
    const indexMarkdown = [
      "---",
      'okf_version: "0.2"',
      "---",
      "",
      "# Files",
      "",
      "* [Marchetti note](m.md) - Marchetti hospice admission.",
      "* [Ostrander note](o.md) - Ostrander cardiology consult.",
      "",
    ].join("\n");
    let seen = "";
    await resolvePackageDigest({
      entries,
      indexMarkdown,
      useAi: true,
      generate: async (input) => {
        seen = input.index;
        return "Marchetti hospice care and an Ostrander cardiology consult.";
      },
    });
    assert.equal(seen, indexMarkdown.trim());
  });

  it("sends every patient and rewrites a summary that names only the first", async () => {
    const records = [
      ...Array.from({ length: 3 }, (_, i) => ({
        href: `m${i}.md`,
        title: `Marchetti note ${i}`,
        description: `Marchetti visit ${i} for pancreatic cancer follow-up.`,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        href: `o${i}.md`,
        title: `Ostrander note ${i}`,
        description: `Ostrander cardiology visit ${i} with medication changes.`,
      })),
    ];
    const calls: string[][] = [];
    const digest = await resolvePackageDigest({
      entries: records,
      useAi: true,
      generate: async (input) => {
        calls.push(input.missing ?? []);
        assert.match(input.index, /# Files/);
        assert.match(input.index, /Marchetti note 2/);
        assert.match(input.index, /Ostrander note 4/);
        if (!input.missing?.length) return "Care for Marchetti during cancer treatment.";
        return "Marchetti cancer care and Ostrander cardiology visits.";
      },
    });
    assert.deepEqual(calls[0], []);
    assert.deepEqual(calls[1], ["Ostrander"]);
    assert.match(digest!, /Ostrander/);
    assert.match(digest!, /Marchetti/);
    assert.ok(digest!.length <= PACKAGE_DIGEST_MAX_CHARS);
  });

  it("names every patient when the model fails and the joined line would be cut off", async () => {
    const records = [
      ...Array.from({ length: 8 }, (_, i) => ({
        href: `m${i}.md`,
        title: `Marchetti note ${i}`,
        description: `Marchetti ${"imaging ".repeat(30)}report ${i}.`,
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        href: `o${i}.md`,
        title: `Ostrander note ${i}`,
        description: `Ostrander ${"cardiology ".repeat(30)}visit ${i}.`,
      })),
    ];
    const digest = await resolvePackageDigest({
      entries: records,
      useAi: true,
      generate: async () => {
        throw new Error("model down");
      },
    });
    assert.match(digest!, /Marchetti/);
    assert.match(digest!, /Ostrander/);
    assert.ok(digest!.length <= PACKAGE_DIGEST_MAX_CHARS);
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
