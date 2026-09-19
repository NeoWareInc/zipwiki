import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, after } from "node:test";
import { writeNzipCollectionBundle } from "../archive/index.js";
import { enrichOkf, openPackage, searchPackage, buildCatalog, formatCatalogText, CATALOG_ROW_FIELDS, CATALOG_RESULT_FIELDS } from "./index.js";

describe("zipaccess", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipaccess-"));
  const primary = join(dir, "lease.txt");
  const deed = join(dir, "property-deed.pdf");
  const out = join(dir, "kb.nzip");

  writeFileSync(primary, "Commercial lease for 100 Main Street warehouse.\n");
  writeFileSync(deed, "%PDF-1.1\nWarranty deed for 12 Oak Street.\n");
  writeNzipCollectionBundle({
    outputPath: out,
    members: [
      {
        originalPath: primary,
        originalName: "lease.txt",
        structuredMarkdown:
          "# Lease\n\nCommercial lease for 100 Main Street warehouse terms and rent.\n",
      },
      {
        originalPath: deed,
        originalName: "property-deed.pdf",
        mimeType: "application/pdf",
        structuredMarkdown:
          "# Property Deed\n\nWarranty deed conveying 12 Oak Street.\n",
      },
    ],
    okf: {
      files: [
        {
          name: "lease.md",
          data: [
            "---",
            'type: "Contract"',
            'title: "Warehouse Lease"',
            'description: "Lease covering Main Street warehouse."',
            "tags: [lease, warehouse, commercial]",
            "---",
            "",
            "# Key facts",
            "",
            "- Address: 100 Main Street",
            "",
          ].join("\n"),
        },
        {
          name: "property-deed.md",
          data: [
            "---",
            'type: "Deed"',
            'title: "Property Deed"',
            'description: "Warranty deed for 12 Oak Street."',
            "tags: [deed, property, real-estate]",
            "---",
            "",
            "# Key facts",
            "",
            "- 12 Oak Street warranty deed",
            "",
          ].join("\n"),
        },
      ],
    },
    digest: "lease package",
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("openPackage reports OKF and openSequence with search", () => {
    const open = openPackage(out);
    assert.equal(open.package, out);
    assert.ok(open.okf.present);
    assert.ok(open.okf.conceptCount >= 1);
    assert.ok(open.openSequence.some((s) => s.includes("search")));
    assert.ok(open.catalog.rows.length >= 1);
    const row = open.catalog.rows.find((r) => r.primary === "lease.txt");
    assert.ok(row);
    assert.equal(row!.title, "Warehouse Lease");
    assert.equal(row!.type, "Contract");
    assert.equal(row!.hasOkf, true);
    assert.equal(row!.hasParsed, true);
    assert.equal(row!.hasOriginal, true);
    assert.ok(row!.readHints.next.some((h) => h.includes("--okf")));
  });

  it("searchPackage ranks OKF lease hit", () => {
    const result = searchPackage({ package: out, query: "warehouse lease" });
    assert.ok(result.hits.length >= 1);
    assert.equal(result.hits[0]!.kind, "okf");
    assert.match(result.hits[0]!.path, /lease/);
    assert.ok(result.hits[0]!.readHints?.next.some((h) => h.includes("--okf")));
  });

  it("buildCatalog / formatCatalogText are readable", () => {
    const catalog = buildCatalog(out);
    const text = formatCatalogText(catalog);
    assert.match(text, /PRIMARY/);
    assert.match(text, /Warehouse Lease/);
    assert.match(text, /read --okf/);
    for (const key of CATALOG_RESULT_FIELDS) {
      assert.ok(key in catalog, `catalog missing ${key}`);
    }
    for (const key of CATALOG_ROW_FIELDS) {
      assert.ok(key in catalog.rows[0]!, `catalog row missing ${key}`);
    }
  });

  it("search deed finds the property deed and catalog lists it", () => {
    const catalog = buildCatalog(out);
    const text = formatCatalogText(catalog);
    assert.ok(catalog.rows.some((r) => r.primary === "property-deed.pdf"));
    assert.match(text, /property-deed/);
    const result = searchPackage({ package: out, query: "deed" });
    assert.ok(result.hits.length >= 1);
    assert.ok(
      result.hits.some(
        (h) =>
          /deed/i.test(h.path) ||
          /deed/i.test(h.title ?? "") ||
          /deed/i.test(h.snippet),
      ),
    );
    assert.ok(result.hits[0]!.readHints?.next.some((h) => h.includes("read --")));
  });

  it("enrichOkf writes host enrichment", async () => {
    const result = await enrichOkf({
      package: out,
      stem: "lease.txt",
      enrichment: {
        title: "Updated Lease Card",
        description: "Host LLM enriched description of the warehouse lease.",
        type: "Contract",
        tags: ["lease", "host-llm"],
        keyFacts: ["Enriched by host", "Main Street"],
      },
    });
    assert.equal(result.title, "Updated Lease Card");
    const open = openPackage(out);
    assert.ok(open.okf.present);
    const search = searchPackage({ package: out, query: "host-llm enriched" });
    assert.ok(search.hits.some((h) => h.path.includes("lease")));
  });
});
