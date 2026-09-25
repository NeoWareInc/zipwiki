import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  findOrphanParses,
  listZipEntries,
  loadPackageInventory,
  originCrc32Hex,
  originCrc32Of,
  parsedPathFor,
  readCompressedPayload,
  unixTimeSeconds,
  writeNzipCollectionBundle,
  writeZipBuffer,
} from "../archive/index.js";
import { loadCopyableArchive, sortPackOrder } from "../archive/rewrite.js";
import { enrichOkf } from "./enrich.js";
import { parseUpdateSpecs, updatePackage } from "./update.js";

describe("updatePackage", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipwiki-update-"));
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const parseHook = (label: string) => async (abs: string) => ({
    markdown: `# ${label}\n\n${readFileSync(abs, "utf8")}\n`,
    documentType: "Generic",
  });

  it("parseUpdateSpecs accepts FILE or ZIPPATH=FILE", () => {
    assert.throws(() => parseUpdateSpecs(["=b.pdf"]), /Invalid --update/);
    assert.deepEqual(parseUpdateSpecs(["a.pdf=./b.pdf"]), [
      { entry: "a.pdf", file: "./b.pdf" },
    ]);
    assert.deepEqual(parseUpdateSpecs(["./docs/report.pdf"]), [
      { entry: "report.pdf", file: "./docs/report.pdf" },
    ]);
  });

  it("copies compressed PDF across delete of another member", async () => {
    const pdf = join(dir, "keep.pdf");
    const pdfBytes = Buffer.alloc(3000, 0x25);
    pdfBytes.write("%PDF", 0);
    writeFileSync(pdf, pdfBytes);
    const drop = join(dir, "drop.txt");
    writeFileSync(drop, "drop me\n");
    const out = join(dir, "copy-keep.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: false,
      members: [
        {
          originalPath: pdf,
          originalName: "keep.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# keep\n",
          originUri: "https://example.com/keep.pdf",
        },
        {
          originalPath: drop,
          originalName: "drop.txt",
          structuredMarkdown: "# drop\n",
        },
      ],
    });
    const before = listZipEntries(out);
    const keepBefore = before.find((e) => e.name === "keep.pdf")!;
    const bufBefore = readFileSync(out);
    const compressedBefore = readCompressedPayload(bufBefore, keepBefore);
    const extraLenBefore = keepBefore.extraFieldLength;
    const originUriBefore = keepBefore.originUri;
    const methodBefore = keepBefore.method;
    const crcBefore = keepBefore.crc32;
    const dosBefore = { t: keepBefore.dosTime, d: keepBefore.dosDate };

    await updatePackage({
      package: out,
      quiet: true,
      del: ["drop.txt"],
      noAiOkf: true,
      noOkf: true,
    });

    const after = listZipEntries(out);
    assert.ok(!after.some((e) => e.name === "drop.txt"));
    assert.ok(!after.some((e) => e.name === "wiki/parsed/drop.txt.md"));
    const keepAfter = after.find((e) => e.name === "keep.pdf")!;
    const bufAfter = readFileSync(out);
    assert.equal(keepAfter.method, methodBefore);
    assert.equal(keepAfter.crc32, crcBefore);
    assert.equal(keepAfter.dosTime, dosBefore.t);
    assert.equal(keepAfter.dosDate, dosBefore.d);
    assert.equal(keepAfter.extraFieldLength, extraLenBefore);
    assert.equal(keepAfter.originUri, originUriBefore);
    assert.deepEqual(
      readCompressedPayload(bufAfter, keepAfter),
      compressedBefore,
    );
  });

  it("add colliding basename uses content/2 without renaming original", async () => {
    const origDir = join(dir, "orig-dir");
    const addDir = join(dir, "add-dir");
    mkdirSync(origDir, { recursive: true });
    mkdirSync(addDir, { recursive: true });
    const orig = join(origDir, "report.txt");
    const extra = join(addDir, "report.txt");
    writeFileSync(orig, "original report\n");
    writeFileSync(extra, "second report\n");
    const out = join(dir, "collide.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      members: [
        {
          originalPath: orig,
          originalName: "report.txt",
          structuredMarkdown: "# original\n",
        },
      ],
      okf: {
        files: [
          {
            name: "report.md",
            data: "---\ntype: Document\ntitle: Original\ndescription: orig\ntags: []\n---\n",
          },
        ],
      },
    });

    const result = await updatePackage({
      package: out,
      quiet: true,
      add: [extra],
      noAiOkf: true,
      omitOriginalDocuments: false,
      hooks: { parse: parseHook("second") },
    });
    assert.deepEqual(result.added, ["content/2/report.txt"]);
    const names = listZipEntries(out).map((e) => e.name);
    assert.ok(names.includes("report.txt"));
    assert.ok(names.includes("content/2/report.txt"));
    assert.ok(names.includes("wiki/parsed/report.txt.md"));
    assert.ok(names.includes("wiki/parsed/content/2/report.txt.md"));
    assert.ok(
      result.warnings.some((w) => /Skipped OKF.*stem already used/.test(w)),
    );
    const inv = loadPackageInventory(out);
    assert.ok(inv.primaries.has("report.txt"));
    assert.ok(inv.primaries.has("content/2/report.txt"));
  });

  it("update same P updates parse and origin CRC/size/mtime", async () => {
    const pdf = join(dir, "report.pdf");
    const v1 = Buffer.from("%PDF-v1\n");
    writeFileSync(pdf, v1);
    const t1 = 1_577_836_800;
    utimesSync(pdf, t1, t1);
    const out = join(dir, "replace.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: true,
      members: [
        {
          originalPath: pdf,
          originalName: "report.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# v1\n",
          originUri: "https://example.com/report.pdf",
        },
      ],
    });
    const parsedBefore = listZipEntries(out).find(
      (e) => e.name === "wiki/parsed/report.pdf.md",
    )!;
    assert.equal(parsedBefore.originCrc32, originCrc32Hex(originCrc32Of(v1)));

    const v2path = join(dir, "report-v2.pdf");
    const v2 = Buffer.from("%PDF-v2-replaced-bytes\n");
    writeFileSync(v2path, v2);
    const t2 = 1_609_459_200;
    utimesSync(v2path, t2, t2);

    await updatePackage({
      package: out,
      quiet: true,
      update: [{ entry: "report.pdf", file: v2path }],
      omitOriginalDocuments: true,
      originFile: true,
      noAiOkf: true,
      hooks: { parse: parseHook("v2") },
    });

    const parsed = listZipEntries(out).find(
      (e) => e.name === "wiki/parsed/report.pdf.md",
    )!;
    assert.equal(parsed.originCrc32, originCrc32Hex(originCrc32Of(v2)));
    assert.equal(parsed.originSize, v2.length);
    assert.equal(parsed.originMtime, unixTimeSeconds(new Date(t2 * 1000)));
    const md = loadCopyableArchive(out).entries.find(
      (e) => e.name === parsedPathFor("report.pdf"),
    )!;
    assert.match(md.data.toString("utf8"), /v2/);
    assert.ok(!listZipEntries(out).some((e) => e.name === "report.pdf"));
  });

  it("delete removes parse, assets, OKF, and index row", async () => {
    const keep = join(dir, "keep.txt");
    const gone = join(dir, "gone.txt");
    writeFileSync(keep, "keep text\n");
    writeFileSync(gone, "gone text\n");
    const out = join(dir, "cascade.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      members: [
        {
          originalPath: keep,
          originalName: "keep.txt",
          structuredMarkdown: "# keep\n",
        },
        {
          originalPath: gone,
          originalName: "gone.txt",
          structuredMarkdown: "# gone\n",
        },
      ],
      okf: {
        files: [
          {
            name: "keep.md",
            data: [
              "---",
              "type: Document",
              "title: Keep",
              "description: stay",
              "tags: []",
              "sources:",
              '  - resource: "../../gone.txt"',
              "    description: other",
              "---",
              "",
            ].join("\n"),
          },
          {
            name: "gone.md",
            data: "---\ntype: Document\ntitle: Gone\ndescription: drop\ntags: []\n---\n",
          },
          {
            name: "index.md",
            data: "# Files\n\n- [Gone](gone.md)\n- [Keep](keep.md)\n",
          },
        ],
      },
    });
    const loaded = loadCopyableArchive(out);
    loaded.entries.push({
      name: "wiki/parsed/gone.txt.assets/img.png",
      data: Buffer.from([1, 2, 3]),
    });
    writeFileSync(out, writeZipBuffer(sortPackOrder(loaded.entries)));

    await updatePackage({
      package: out,
      quiet: true,
      del: ["gone.txt"],
      noAiOkf: true,
      noOkf: true,
    });

    const names = listZipEntries(out).map((e) => e.name);
    assert.ok(!names.includes("gone.txt"));
    assert.ok(!names.includes("wiki/parsed/gone.txt.md"));
    assert.ok(!names.includes("wiki/parsed/gone.txt.assets/img.png"));
    assert.ok(!names.includes("wiki/okf/gone.md"));
    assert.ok(names.includes("keep.txt"));
    assert.ok(names.includes("wiki/okf/keep.md"));
    const after = loadCopyableArchive(out);
    const index = after.entries.find((e) => e.name === "wiki/okf/index.md")!;
    assert.doesNotMatch(index.data.toString("utf8"), /gone\.md/);
    const keepOkf = after.entries.find((e) => e.name === "wiki/okf/keep.md")!;
    assert.doesNotMatch(keepOkf.data.toString("utf8"), /gone\.txt/);
    assert.deepEqual(findOrphanParses(names), []);
  });

  it("delete omitted original by parse-member key", async () => {
    const pdf = join(dir, "deed.pdf");
    writeFileSync(pdf, Buffer.from("%PDF-deed\n"));
    const keep = join(dir, "keep-omit.txt");
    writeFileSync(keep, "keep\n");
    const out = join(dir, "omit-del.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: true,
      members: [
        {
          originalPath: keep,
          originalName: "keep-omit.txt",
          structuredMarkdown: "# keep\n",
        },
        {
          originalPath: pdf,
          originalName: "deed.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# deed\n",
        },
      ],
    });
    await updatePackage({
      package: out,
      quiet: true,
      del: ["wiki/parsed/deed.pdf.md"],
      noAiOkf: true,
      noOkf: true,
    });
    const names = listZipEntries(out).map((e) => e.name);
    assert.ok(!names.includes("wiki/parsed/deed.pdf.md"));
    assert.ok(!names.includes("deed.pdf"));
    assert.ok(names.includes("wiki/parsed/keep-omit.txt.md"));
  });

  it("combined add and delete in one rewrite", async () => {
    const keep = join(dir, "combo-keep.txt");
    const drop = join(dir, "combo-drop.txt");
    const add = join(dir, "combo-add.txt");
    writeFileSync(keep, "keep\n");
    writeFileSync(drop, "drop\n");
    writeFileSync(add, "added\n");
    const out = join(dir, "combo.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      members: [
        {
          originalPath: keep,
          originalName: "keep.txt",
          structuredMarkdown: "# keep\n",
        },
        {
          originalPath: drop,
          originalName: "drop.txt",
          structuredMarkdown: "# drop\n",
        },
      ],
    });
    const result = await updatePackage({
      package: out,
      quiet: true,
      add: [add],
      del: ["drop.txt"],
      noAiOkf: true,
      hooks: { parse: parseHook("added") },
    });
    assert.deepEqual(result.added, ["combo-add.txt"]);
    assert.deepEqual(result.removed, ["drop.txt"]);
    const names = listZipEntries(out).map((e) => e.name);
    assert.ok(names.includes("combo-add.txt"));
    assert.ok(names.includes("wiki/parsed/combo-add.txt.md"));
    assert.ok(!names.includes("drop.txt"));
  });

  it("rebuilds topic pages when a primary is removed", async () => {
    const alpha = join(dir, "alpha.txt");
    const beta = join(dir, "beta.txt");
    const gamma = join(dir, "gamma.txt");
    writeFileSync(alpha, "alpha\n");
    writeFileSync(beta, "beta\n");
    writeFileSync(gamma, "gamma\n");
    const out = join(dir, "topics.zipwiki");
    const card = (title: string, file: string) =>
      [
        "---",
        "type: Document",
        `title: ${title}`,
        "description: shared warehouse note",
        "tags: [warehouse, pdf]",
        "sources:",
        `  - resource: "../../${file}"`,
        "    description: primary",
        "---",
        "",
      ].join("\n");
    writeNzipCollectionBundle({
      outputPath: out,
      members: [
        { originalPath: alpha, originalName: "alpha.txt", structuredMarkdown: "# alpha\n" },
        { originalPath: beta, originalName: "beta.txt", structuredMarkdown: "# beta\n" },
        { originalPath: gamma, originalName: "gamma.txt", structuredMarkdown: "# gamma\n" },
      ],
      okf: {
        files: [
          { name: "alpha.md", data: card("Alpha", "alpha.txt") },
          { name: "beta.md", data: card("Beta", "beta.txt") },
          { name: "gamma.md", data: card("Gamma", "gamma.txt") },
        ],
      },
    });
    await updatePackage({
      package: out,
      quiet: true,
      del: ["gamma.txt"],
      noAiOkf: true,
      noOkf: true,
    });
    const after = loadCopyableArchive(out);
    const names = after.entries.map((e) => e.name);
    assert.ok(!names.includes("gamma.txt"));
    assert.ok(!names.includes("wiki/okf/gamma.md"));
    assert.ok(names.includes("wiki/okf/topics/warehouse.md"));
    assert.ok(!names.includes("wiki/okf/topics/pdf.md"));
    const topic = after.entries.find((e) => e.name === "wiki/okf/topics/warehouse.md")!;
    const topicMd = topic.data.toString("utf8");
    assert.match(topicMd, /\]\(\.\.\/alpha\.md\)/);
    assert.match(topicMd, /\]\(\.\.\/beta\.md\)/);
    assert.doesNotMatch(topicMd, /gamma/);
    const index = after.entries.find((e) => e.name === "wiki/okf/index.md")!;
    const indexMd = index.data.toString("utf8");
    assert.match(indexMd, /# Topics/);
    assert.doesNotMatch(indexMd, /topics\/pdf\.md/);
    assert.doesNotMatch(indexMd, /gamma\.md/);
    assert.ok(!names.includes("wiki/okf/log.md"));
    assert.ok(!names.includes("wiki/search.json"));
  });

  it("refuses to seal when a remaining concept cites a missing primary", async () => {
    const keep = join(dir, "cite-keep.txt");
    const gone = join(dir, "cite-gone.txt");
    writeFileSync(keep, "keep\n");
    writeFileSync(gone, "gone\n");
    const out = join(dir, "dangling.zipwiki");
    writeNzipCollectionBundle({
      outputPath: out,
      members: [
        { originalPath: keep, originalName: "cite-keep.txt", structuredMarkdown: "# keep\n" },
        { originalPath: gone, originalName: "cite-gone.txt", structuredMarkdown: "# gone\n" },
      ],
      okf: {
        files: [
          {
            name: "cite-keep.md",
            data: [
              "---",
              "type: Document",
              "title: Keep",
              "description: stay",
              "tags: []",
              "sources:",
              '  - resource: "../../missing.txt"',
              "    description: absent",
              '  - resource: "../../cite-gone.txt"',
              "    description: other",
              "---",
              "",
            ].join("\n"),
          },
        ],
      },
    });
    await assert.rejects(
      () =>
        updatePackage({
          package: out,
          quiet: true,
          del: ["cite-gone.txt"],
          noAiOkf: true,
          noOkf: true,
        }),
      /missing member: cite-keep\.md → missing\.txt/,
    );
    const names = listZipEntries(out).map((e) => e.name);
    assert.ok(names.includes("cite-gone.txt"));
  });
});

describe("enrichOkf preserves origins", () => {
  const dir = mkdtempSync(join(tmpdir(), "zipwiki-enrich-origin-"));
  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps Extra Field 0x014F after enrich", async () => {
    const pdf = join(dir, "deed.pdf");
    const bytes = Buffer.from("%PDF-deed\n");
    writeFileSync(pdf, bytes);
    const out = join(dir, "deed.zipwiki");
    const uri = "https://example.com/deed.pdf";
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: true,
      members: [
        {
          originalPath: pdf,
          originalName: "deed.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# Deed\n",
          originUri: uri,
        },
      ],
    });
    const before = listZipEntries(out).find(
      (e) => e.name === "wiki/parsed/deed.pdf.md",
    )!;
    assert.equal(before.originUri, uri);
    const bufBefore = readFileSync(out);
    const compressedBefore = readCompressedPayload(bufBefore, before);

    await enrichOkf({
      package: out,
      quiet: true,
      stem: "deed",
      enrichment: {
        title: "Deed card",
        description: "Host enriched deed",
        type: "Contract",
        tags: ["deed"],
      },
    });

    const after = listZipEntries(out).find(
      (e) => e.name === "wiki/parsed/deed.pdf.md",
    )!;
    assert.equal(after.originUri, uri);
    assert.equal(after.originCrc32, before.originCrc32);
    assert.equal(after.method, before.method);
    assert.deepEqual(
      readCompressedPayload(readFileSync(out), after),
      compressedBefore,
    );
  });
});
