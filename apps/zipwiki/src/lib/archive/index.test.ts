import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { describe, it } from "node:test";
import {
  BUNDLE_PATHS,
  NZIP_EXTENSION,
  PACKAGE_SPEC_VERSION,
  assignContentPaths,
  buildNeoZipManifest,
  buildStructuredPack,
  classifyEntry,
  computeArchiveMerkleRoot,
  contentDigest,
  contentMerkleRoot,
  findOrphanParses,
  isNzipPath,
  isOmittableDocumentSource,
  leafHashV1,
  listZipEntries,
  matchMerkleRoot,
  normalizeMerklePath,
  makeOriginExtra,
  originCrc32Hex,
  originCrc32Of,
  originMtimeIso,
  originSha256Of,
  unixTimeSeconds,
  parentHash,
  parsedPathFor,
  parsedMarkdownFileName,
  readStructuredPackMember,
  readZipEntry,
  serializeNeoZipManifest,
  toDosDateTime,
  writeNzipBundle,
  writeNzipCollectionBundle,
} from "./index.js";
import {
  buildWikiSearchIndex,
  serializeWikiSearchIndex,
} from "../okf/search-index.js";

describe("archive schema", () => {
  it("exposes in-bundle layout paths", () => {
    assert.equal(BUNDLE_PATHS.manifest, "META-INF/manifest.json");
    assert.equal(BUNDLE_PATHS.aiRoot, "wiki");
    assert.equal(BUNDLE_PATHS.parsed, "wiki/parsed/");
    assert.equal(BUNDLE_PATHS.okfRoot, "wiki/okf/");
    assert.equal(NZIP_EXTENSION, ".zipwiki");
  });

  it("detects omittable document sources", () => {
    assert.equal(isOmittableDocumentSource("report.pdf"), true);
    assert.equal(isOmittableDocumentSource("a.DOCX"), true);
    assert.equal(isOmittableDocumentSource("notes.txt"), false);
    assert.equal(isOmittableDocumentSource("photo.png"), true);
    assert.equal(isOmittableDocumentSource("scan.TIF"), true);
  });

  it("detects .zipwiki and legacy .nzip filenames", () => {
    assert.equal(isNzipPath("report.pdf.zipwiki"), true);
    assert.equal(isNzipPath("report.pdf.nzip"), true);
    assert.equal(isNzipPath("notes.zip"), false);
  });

  it("classifies meta / ai / primary and builds parse paths", () => {
    assert.equal(classifyEntry("META-INF/manifest.json"), "meta");
    assert.equal(classifyEntry("wiki/parsed/a.pdf.md"), "ai");
    assert.equal(classifyEntry("a.pdf"), "primary");
    assert.equal(parsedPathFor("docs/a.pdf"), "wiki/parsed/docs/a.pdf.md");
    assert.equal(parsedMarkdownFileName("docs/a.pdf"), "a.pdf.md");
    assert.equal(parsedMarkdownFileName("apple-10k-2024-sm.pdf"), "apple-10k-2024-sm.pdf.md");
    assert.deepEqual(
      findOrphanParses(["wiki/parsed/missing.pdf.md", "other.pdf"]),
      ["wiki/parsed/missing.pdf.md"],
    );
    assert.deepEqual(
      findOrphanParses(["report.pdf", "wiki/parsed/report.pdf.md"]),
      [],
    );
  });

  it("buildNeoZipManifest assembles ai.parser + okf + primaries", () => {
    const manifest = buildNeoZipManifest({
      createdAt: "2026-08-29T12:00:00.000Z",
      digest: "Sample packet.",
      primaries: [
        {
          path: "report.pdf",
          mimeType: "application/pdf",
          documentType: "Financial_Report",
          hasParsed: true,
        },
        {
          path: "scan.png",
          mimeType: "image/png",
          documentType: "Receipt_Scan",
          hasParsed: false,
        },
      ],
      okf: {
        present: true,
        root: "wiki/okf/",
        version: "0.2",
      },
      parserEngine: "liteparse",
    });
    assert.equal(manifest.format, "neozip");
    assert.equal(manifest.specVersion, PACKAGE_SPEC_VERSION);
    assert.equal(manifest.createdAt, "2026-08-29T12:00:00.000Z");
    assert.equal(manifest.ai?.root, "wiki");
    assert.equal(manifest.ai?.primaryCount, 2);
    assert.equal(manifest.ai?.parsedCount, 1);
    assert.equal(manifest.ai?.digest, "Sample packet.");
    assert.equal(manifest.ai?.okf?.present, true);
    assert.equal(manifest.ai?.okf?.root, "wiki/okf/");
    assert.equal(manifest.ai?.parser?.engine, "liteparse");
    assert.equal(manifest.ai?.primaries?.length, 2);
    assert.equal(manifest.ai?.primaries?.[0]?.hasParsed, true);
    assert.equal(manifest.ai?.primaries?.[1]?.hasParsed, false);
    assert.equal(manifest.ai?.primaries?.[0]?.originalName, undefined);
    assert.equal(manifest.ai?.primaries?.[0]?.contentSha256, undefined);
    assert.equal(manifest.ai?.primaries?.[0]?.digest, undefined);
    assert.match(serializeNeoZipManifest(manifest), /"format": "neozip"/);
  });

  it("writes a .nzip with thin AI manifest, primary, and wiki/parsed", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-"));
    const original = join(dir, "hello.txt");
    writeFileSync(original, "hello neo\n");
    const out = join(dir, "hello.txt.nzip");
    const result = writeNzipBundle({
      outputPath: out,
      originalPath: original,
      originalName: "hello.txt",
      mimeType: "text/plain",
      documentType: "Generic",
      structuredMarkdown: "# Hello\n",
      digest: "A tiny test file.",
      computeMerkle: true,
    });
    assert.equal(result.contentSha256, undefined);
    assert.equal(result.merkleRoot?.length, 64);

    const listing = listZipEntries(out);
    assert.ok(
      listing.every((e) => e.dosDate !== 0 || e.dosTime !== 0),
      "entries should carry a non-epoch MS-DOS mtime",
    );
    assert.deepEqual(
      listing.map((e) => e.name),
      [
        "META-INF/manifest.json",
        "wiki/parsed/hello.txt.md",
        "hello.txt",
      ],
    );
    assert.equal(
      listing.find((e) => e.name === "hello.txt")?.uncompressedSize,
      Buffer.byteLength("hello neo\n"),
    );

    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.format, "neozip");
    assert.equal(manifest.specVersion, PACKAGE_SPEC_VERSION);
    assert.ok(manifest.profiles.includes("zipwiki"));
    assert.ok(!manifest.profiles.includes("integrity"));
    assert.equal(manifest.ai.root, "wiki");
    assert.equal(manifest.ai.primaryCount, 1);
    assert.equal(manifest.ai.parsedCount, 1);
    assert.equal(manifest.ai.digest, "A tiny test file.");
    assert.equal(manifest.ai.okf, undefined);
    assert.equal(manifest.content, undefined);
    assert.equal(manifest.merkleRoot, undefined);
    assert.equal(manifest.codex, undefined);
    assert.equal(manifest.ai.primaries.length, 1);
    assert.equal(manifest.ai.primaries[0].path, "hello.txt");
    assert.equal(manifest.ai.primaries[0].mimeType, "text/plain");
    assert.equal(manifest.ai.primaries[0].documentType, "Generic");
    assert.equal(manifest.ai.primaries[0].hasParsed, true);
    assert.equal(manifest.ai.primaries[0].originalName, undefined);
    assert.equal(manifest.ai.primaries[0].contentSha256, undefined);
    assert.equal(manifest.ai.primaries[0].digest, undefined);

    assert.equal(
      readZipEntry(out, "wiki/parsed/hello.txt.md").toString("utf-8"),
      "# Hello\n",
    );

    // Merkle includes primary + parse leaf.
    const expected = contentMerkleRoot([
      { path: "hello.txt", content: Buffer.from("hello neo\n") },
      {
        path: "wiki/parsed/hello.txt.md",
        content: Buffer.from("# Hello\n"),
      },
    ]);
    assert.equal(result.merkleRoot, expected);

    // Default: ZIP CRC-32 only (no Extra Field 0x014E).
    assert.equal(listing[1]?.extraFieldLength, 0);
    assert.equal(result.contentSha256, undefined);
  });

  it("writes OKF under wiki/okf/ and declares ai.okf", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-okf-"));
    const original = join(dir, "hello.txt");
    writeFileSync(original, "hello neo\n");
    const out = join(dir, "hello.txt.nzip");
    const okfDoc = [
      "---",
      "type: Document",
      'title: hello.txt',
      "description: A tiny test file.",
      "---",
      "",
      "# hello.txt",
      "",
    ].join("\n");
    const indexMd = '---\nokf_version: "0.2"\n---\n\n# Concepts\n';
    const result = writeNzipBundle({
      outputPath: out,
      originalPath: original,
      originalName: "hello.txt",
      structuredMarkdown: "# Hello\n",
      digest: "A tiny test file.",
      computeMerkle: true,
      okf: {
        files: [
          { name: "index.md", data: indexMd },
          { name: "document.md", data: okfDoc },
          { name: "log.md", data: "# log\n" },
        ],
        version: "0.2",
      },
    });

    const names = listZipEntries(out).map((e) => e.name);
    assert.deepEqual(names, [
      "META-INF/manifest.json",
      "wiki/okf/document.md",
      "wiki/okf/index.md",
      "wiki/okf/log.md",
      "wiki/parsed/hello.txt.md",
      "wiki/search.json",
      "hello.txt",
    ]);

    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.ai.okf.present, true);
    assert.equal(manifest.ai.okf.root, "wiki/okf/");
    assert.equal(manifest.ai.okf.index, "wiki/okf/index.md");
    assert.equal(manifest.ai.okf.version, "0.2");

    const expected = contentMerkleRoot([
      { path: "hello.txt", content: Buffer.from("hello neo\n") },
      {
        path: "wiki/parsed/hello.txt.md",
        content: Buffer.from("# Hello\n"),
      },
      { path: "wiki/okf/index.md", content: Buffer.from(indexMd) },
      { path: "wiki/okf/document.md", content: Buffer.from(okfDoc) },
      { path: "wiki/okf/log.md", content: Buffer.from("# log\n") },
      {
        path: "wiki/search.json",
        content: Buffer.from(
          serializeWikiSearchIndex(
            buildWikiSearchIndex([
              { name: "wiki/okf/document.md", data: okfDoc },
            ]),
          ),
        ),
      },
    ]);
    assert.equal(result.merkleRoot, expected);
  });

  it("embeds parser complexity and OCR confidence in the AI manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-parser-"));
    const original = join(dir, "hello.txt");
    writeFileSync(original, "hello neo\n");
    const out = join(dir, "hello.txt.nzip");
    writeNzipBundle({
      outputPath: out,
      originalPath: original,
      originalName: "hello.txt",
      structuredMarkdown: "# Hello\n",
      digest: "A tiny test file.",
      parser: {
        engine: "liteparse",
        engineVersion: "2.9.0",
        includeComplexity: true,
        complexity: {
          pageCount: 1,
          needsOcrCount: 0,
          needsOcrRatio: 0,
          layoutComplexCount: 1,
          layoutComplexRatio: 1,
          reasonCounts: {},
          layoutReasonCounts: { "multi-column": 1 },
          maxColumnCount: 2,
          pages: [
            {
              page: 1,
              needsOcr: false,
              reasons: [],
              layoutComplex: true,
              layoutReasons: ["multi-column"],
              columnCount: 2,
            },
          ],
        },
        ocrConfidence: {
          totalItemCount: 10,
          scoredItemCount: 2,
          mean: 0.8,
          min: 0.7,
          max: 0.9,
        },
      },
    });

    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.ai.parser.engine, "liteparse");
    assert.equal(manifest.ai.parser.engineVersion, "2.9.0");
    assert.equal(manifest.ai.parser.includeComplexity, true);
    assert.equal(manifest.ai.parser.complexity.layoutComplexCount, 1);
    assert.equal(manifest.ai.parser.complexity.pages[0].columnCount, 2);
    assert.equal(manifest.ai.parser.ocrConfidence.mean, 0.8);
  });

  it("writes manifest, primary, parse, and OKF into the .nzip only", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-direct-"));
    const original = join(dir, "hello.txt");
    writeFileSync(original, "hello neo\n");
    const out = join(dir, "hello.txt.nzip");
    const okfDoc = "---\ntype: Document\ntitle: hello.txt\n---\n\n# hello\n";
    const indexMd = '---\nokf_version: "0.2"\n---\n\n# Concepts\n';
    writeNzipBundle({
      outputPath: out,
      originalPath: original,
      originalName: "hello.txt",
      structuredMarkdown: "# Hello\n",
      digest: "A tiny test file.",
      okf: {
        files: [
          { name: "index.md", data: indexMd },
          { name: "document.md", data: okfDoc },
          { name: "log.md", data: "# log\n" },
        ],
        version: "0.2",
      },
    });

    const names = listZipEntries(out).map((e) => e.name);
    assert.deepEqual(names, [
      "META-INF/manifest.json",
      "wiki/okf/document.md",
      "wiki/okf/index.md",
      "wiki/okf/log.md",
      "wiki/parsed/hello.txt.md",
      "wiki/search.json",
      "hello.txt",
    ]);
    assert.equal(readZipEntry(out, "hello.txt").toString("utf-8"), "hello neo\n");
    assert.equal(
      readZipEntry(out, "wiki/parsed/hello.txt.md").toString("utf-8"),
      "# Hello\n",
    );
    assert.equal(
      readZipEntry(out, "wiki/okf/document.md").toString("utf-8"),
      okfDoc,
    );
    assert.equal(
      readZipEntry(out, "wiki/okf/index.md").toString("utf-8"),
      indexMd,
    );
  });
});

describe("structured pack (legacy helper)", () => {
  it("round-trips member slices without scanning siblings", () => {
    const { pack, members } = buildStructuredPack([
      { markdown: "# One\n" },
      { markdown: "# Two longer body\n" },
    ]);
    assert.equal(members.length, 2);
    const second = readStructuredPackMember(
      pack,
      members[1]!.offset,
      members[1]!.length,
    );
    assert.equal(second, "# Two longer body\n");
    assert.ok(members[1]!.offset >= members[0]!.length);
  });
});

describe("merkle", () => {
  it("normalizes paths for v1 ordering", () => {
    assert.equal(normalizeMerklePath("foo\\bar"), "foo/bar");
    assert.equal(normalizeMerklePath("./a/b"), "a/b");
    assert.equal(normalizeMerklePath("/a/b"), "a/b");
    const nfd = "cafe\u0301";
    assert.equal(normalizeMerklePath(nfd), "café".normalize("NFC"));
  });

  it("v1 single-leaf root is domain-separated, not bare 0x014E", () => {
    const content = Buffer.from("hello world");
    const bare = contentDigest(content).toString("hex");
    const leaf = leafHashV1(content).toString("hex");
    const root = contentMerkleRoot([{ path: "hello.txt", content }]);
    assert.equal(root, leaf);
    assert.notEqual(root, bare);
  });

  it("v1 is deterministic with path-normalized sort and 0x01 parents", () => {
    const a = Buffer.from("aaa");
    const b = Buffer.from("bbb");
    const leafA = leafHashV1(a);
    const leafB = leafHashV1(b);
    const root1 = contentMerkleRoot([
      { path: "b.txt", content: b },
      { path: "./a.txt", content: a },
    ]);
    const root2 = contentMerkleRoot([
      { path: "a.txt", content: a },
      { path: "b.txt", content: b },
    ]);
    assert.equal(root1, root2);
    assert.equal(root1, parentHash(leafA, leafB, "v1").toString("hex"));
  });

  it("v1 promotes the last node when level count is odd", () => {
    const c1 = Buffer.from("1");
    const c2 = Buffer.from("2");
    const c3 = Buffer.from("3");
    const l1 = leafHashV1(c1);
    const l2 = leafHashV1(c2);
    const l3 = leafHashV1(c3);
    const root = contentMerkleRoot([
      { path: "a", content: c1 },
      { path: "b", content: c2 },
      { path: "c", content: c3 },
    ]);
    const mid = parentHash(l1, l2, "v1");
    assert.equal(root, parentHash(mid, l3, "v1").toString("hex"));
  });

  it("v0 duplicates odd last leaf (legacy)", () => {
    const d1 = Buffer.alloc(32, 0x01);
    const d2 = Buffer.alloc(32, 0x02);
    const d3 = Buffer.alloc(32, 0x03);
    const root = contentMerkleRoot(
      [
        { path: "a", contentSha256: d1 },
        { path: "b", contentSha256: d2 },
        { path: "c", contentSha256: d3 },
      ],
      "v0",
    );
    const mid = parentHash(d1, d2, "v0");
    const lastPair = parentHash(d3, d3, "v0");
    assert.equal(root, parentHash(mid, lastPair, "v0").toString("hex"));
  });

  it("excludes META-INF/** from leaves", () => {
    const content = Buffer.from("x");
    const root = computeArchiveMerkleRoot(
      [
        { path: "META-INF/TOKEN.NZIP", content },
        { path: "meta-inf/manifest.json", content },
        { path: "data.bin", content },
      ],
      "v1",
    );
    assert.equal(root, leafHashV1(content).toString("hex"));
  });

  it("matchMerkleRoot prefers v1 then falls back to v0", () => {
    const content = Buffer.from("payload");
    const v1 = contentMerkleRoot([{ path: "f", content }]);
    assert.deepEqual(matchMerkleRoot([{ path: "f", content }], v1), {
      algorithm: "v1",
      security: "high",
    });
    const dig = contentDigest(content).toString("hex");
    assert.deepEqual(
      matchMerkleRoot([{ path: "f", contentSha256: dig }], dig),
      { algorithm: "v0", security: "legacy" },
    );
  });
});

describe("multi-primary package", () => {
  it("assigns content/ paths on basename collision", () => {
    assert.deepEqual(assignContentPaths(["a/report.pdf", "b/report.pdf"]), [
      "report.pdf",
      "content/2/report.pdf",
    ]);
  });

  it("writes a single-member package via the collection/bundle writer", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-one-"));
    const f1 = join(dir, "solo.txt");
    writeFileSync(f1, "solo-bytes\n");
    const out = join(dir, "solo.nzip");
    const result = writeNzipCollectionBundle({
      outputPath: out,
      digest: "One file bundle.",
      members: [
        {
          originalPath: f1,
          originalName: "solo.txt",
          mimeType: "text/plain",
          documentType: "Generic",
          structuredMarkdown: "# Solo\n",
          digest: "Solo digest",
        },
      ],
    });
    assert.equal(result.memberPaths.length, 1);
    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.ai.primaryCount, 1);
    assert.equal(manifest.ai.primaries.length, 1);
    assert.equal(manifest.ai.primaries[0].path, "solo.txt");
    assert.equal(manifest.ai.primaries[0].hasParsed, true);
  });

  it("writes multi-primary with per-file parses under wiki/parsed/", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-coll-"));
    const f1 = join(dir, "one.txt");
    const f2 = join(dir, "two.txt");
    writeFileSync(f1, "file-one-bytes\n");
    writeFileSync(f2, "file-two-bytes\n");
    const out = join(dir, "pair.nzip");

    const result = writeNzipCollectionBundle({
      outputPath: out,
      title: "pair",
      digest: "Two tiny text files.",
      computeMerkle: true,
      members: [
        {
          originalPath: f1,
          originalName: "one.txt",
          mimeType: "text/plain",
          documentType: "Generic",
          structuredMarkdown: "# Member one\n",
          digest: "First",
        },
        {
          originalPath: f2,
          originalName: "two.txt",
          mimeType: "text/plain",
          documentType: "Technical_Doc",
          structuredMarkdown: "# Member two\n",
          digest: "Second",
        },
      ],
    });

    assert.equal(result.merkleRoot?.length, 64);
    const names = listZipEntries(out).map((e) => e.name);
    assert.deepEqual(names, [
      "META-INF/manifest.json",
      "wiki/parsed/one.txt.md",
      "wiki/parsed/two.txt.md",
      "one.txt",
      "two.txt",
    ]);

    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.ok(manifest.profiles.includes("zipwiki"));
    assert.equal(manifest.ai.root, "wiki");
    assert.equal(manifest.ai.primaryCount, 2);
    assert.equal(manifest.ai.parsedCount, 2);
    assert.equal(manifest.ai.digest, "Two tiny text files.");
    assert.equal(manifest.codex, undefined);
    assert.equal(manifest.merkleRoot, undefined);
    assert.equal(manifest.ai.primaries.length, 2);
    assert.deepEqual(
      manifest.ai.primaries.map((p: { path: string }) => p.path),
      ["one.txt", "two.txt"],
    );
    assert.equal(manifest.ai.primaries[0].documentType, "Generic");
    assert.equal(manifest.ai.primaries[1].documentType, "Technical_Doc");
    assert.equal(manifest.ai.primaries[0].hasParsed, true);
    assert.equal(manifest.ai.primaries[0].contentSha256, undefined);
    assert.equal(manifest.ai.primaries[0].originalName, undefined);
    assert.equal(manifest.ai.primaries[0].digest, undefined);

    assert.equal(
      readZipEntry(out, "wiki/parsed/two.txt.md").toString("utf-8"),
      "# Member two\n",
    );
    assert.equal(findOrphanParses(names).length, 0);

    const expected = contentMerkleRoot([
      { path: "one.txt", content: Buffer.from("file-one-bytes\n") },
      { path: "two.txt", content: Buffer.from("file-two-bytes\n") },
      {
        path: "wiki/parsed/one.txt.md",
        content: Buffer.from("# Member one\n"),
      },
      {
        path: "wiki/parsed/two.txt.md",
        content: Buffer.from("# Member two\n"),
      },
    ]);
    assert.equal(result.merkleRoot, expected);
  });

  it("omits parse entry when structuredMarkdown is missing (failed extract)", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-noparse-"));
    const original = join(dir, "scan.pdf");
    writeFileSync(original, "%PDF-scan\n");
    const out = join(dir, "scan.pdf.nzip");
    const result = writeNzipCollectionBundle({
      outputPath: out,
      digest: "scanned primary only",
      members: [
        {
          originalPath: original,
          originalName: "scan.pdf",
          mimeType: "application/pdf",
          documentType: "Receipt_Scan",
          digest: "scan.pdf",
        },
      ],
    });
    const listing = listZipEntries(out).map((e) => e.name);
    assert.deepEqual(listing, ["META-INF/manifest.json", "scan.pdf"]);
    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.ai.parsedCount, 0);
    assert.equal(manifest.ai.primaries[0].hasParsed, false);
    assert.equal(result.memberPaths[0], "scan.pdf");
  });

  it("omits PDF and image originals when parsed and omitOriginalDocuments is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-omit-"));
    const pdf = join(dir, "report.pdf");
    const png = join(dir, "junkfax_0005.png");
    const txt = join(dir, "notes.txt");
    writeFileSync(pdf, "%PDF-report\n");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(txt, "plain notes\n");
    const out = join(dir, "mixed.nzip");
    const result = writeNzipCollectionBundle({
      outputPath: out,
      digest: "omit pdf/png keep txt",
      omitOriginalDocuments: true,
      members: [
        {
          originalPath: pdf,
          originalName: "report.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# Report\n",
          digest: "report",
        },
        {
          originalPath: png,
          originalName: "junkfax_0005.png",
          mimeType: "image/png",
          structuredMarkdown: "# Fax\n",
          digest: "fax",
        },
        {
          originalPath: txt,
          originalName: "notes.txt",
          mimeType: "text/plain",
          structuredMarkdown: "# Notes\n",
          digest: "notes",
        },
      ],
    });

    const names = listZipEntries(out).map((e) => e.name);
    assert.deepEqual(names, [
      "META-INF/manifest.json",
      "wiki/parsed/junkfax_0005.png.md",
      "wiki/parsed/notes.txt.md",
      "wiki/parsed/report.pdf.md",
      "notes.txt",
    ]);
    assert.deepEqual(result.memberPaths, ["notes.txt"]);

    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.ai.primaryCount, 3);
    assert.equal(manifest.ai.parsedCount, 3);
    const pdfPrimary = manifest.ai.primaries.find(
      (p: { path: string }) => p.path === "report.pdf",
    );
    assert.equal(pdfPrimary.hasParsed, true);
    assert.equal(pdfPrimary.sourceIncluded, false);
    const pngPrimary = manifest.ai.primaries.find(
      (p: { path: string }) => p.path === "junkfax_0005.png",
    );
    assert.equal(pngPrimary.hasParsed, true);
    assert.equal(pngPrimary.sourceIncluded, false);
    const txtPrimary = manifest.ai.primaries.find(
      (p: { path: string }) => p.path === "notes.txt",
    );
    assert.equal(txtPrimary.hasParsed, true);
    assert.equal(txtPrimary.sourceIncluded, undefined);
  });

  it("writes Extra Field 0x014F on parsed entry with original CRC + URI", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-origin-"));
    const pdf = join(dir, "Ch_2025-001.pdf");
    const pdfBytes = Buffer.from("%PDF-florida\n");
    writeFileSync(pdf, pdfBytes);
    const sourceUnix = 1_592_231_444;
    utimesSync(pdf, sourceUnix, sourceUnix);
    const out = join(dir, "florida.nzip");
    const uri = "https://laws.flrules.org/2025/1";
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: true,
      members: [
        {
          originalPath: pdf,
          originalName: "Ch_2025-001.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# Ch 2025-1\n",
          originUri: uri,
        },
      ],
    });
    const listing = listZipEntries(out);
    const parsed = listing.find((e) => e.name === "wiki/parsed/Ch_2025-001.pdf.md");
    assert.ok(parsed);
    const mtime = unixTimeSeconds(statSync(pdf).mtime);
    const originExtra = makeOriginExtra({
      uri,
      crc32: originCrc32Of(pdfBytes),
      size: pdfBytes.length,
      mtime,
    });
    // Extra Field 0x014F only (CRC-32 default; no 0x014E).
    assert.equal(parsed!.extraFieldLength, originExtra.length);
    assert.equal(parsed!.originUri, uri);
    assert.equal(parsed!.originCrc32, originCrc32Hex(originCrc32Of(pdfBytes)));
    assert.equal(parsed!.originSize, pdfBytes.length);
    assert.equal(parsed!.originMtime, mtime);
    assert.equal(parsed!.originMtimeUtc, originMtimeIso(mtime));
    assert.ok(!listing.some((e) => e.name === "Ch_2025-001.pdf"));
  });

  it("writes 0x014F size/mtime/crc on omit-original even without a URI", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-origin-stats-"));
    const pdf = join(dir, "report.pdf");
    const pdfBytes = Buffer.from("%PDF-report\n");
    writeFileSync(pdf, pdfBytes);
    const sourceUnix = 1_577_836_800;
    utimesSync(pdf, sourceUnix, sourceUnix);
    const out = join(dir, "stats.nzip");
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: true,
      members: [
        {
          originalPath: pdf,
          originalName: "report.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# report\n",
        },
      ],
    });
    const parsed = listZipEntries(out).find(
      (e) => e.name === "wiki/parsed/report.pdf.md",
    );
    assert.ok(parsed);
    assert.equal(parsed!.originUri, undefined);
    assert.equal(parsed!.originCrc32, originCrc32Hex(originCrc32Of(pdfBytes)));
    assert.equal(parsed!.originSize, pdfBytes.length);
    assert.equal(parsed!.originMtime, unixTimeSeconds(statSync(pdf).mtime));
  });

  it("writes Extra Field 0x014E when sha256Extra is requested", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-sha-"));
    const original = join(dir, "hello.txt");
    writeFileSync(original, "hello neo\n");
    const out = join(dir, "hello.txt.nzip");
    const result = writeNzipBundle({
      outputPath: out,
      originalPath: original,
      originalName: "hello.txt",
      structuredMarkdown: "# Hello\n",
      sha256Extra: true,
    });
    const listing = listZipEntries(out);
    const primary = listing.find((e) => e.name === "hello.txt");
    const parsed = listing.find((e) => e.name === "wiki/parsed/hello.txt.md");
    assert.equal(primary?.extraFieldLength, 36);
    assert.equal(parsed?.extraFieldLength, 36);
    assert.equal(result.contentSha256?.length, 64);
    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.ok(manifest.profiles.includes("integrity"));
  });

  it("writes origin SHA-256 on Extra Field 0x014F when originSha256 is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-origin-sha-"));
    const pdf = join(dir, "report.pdf");
    const pdfBytes = Buffer.from("%PDF-report\n");
    writeFileSync(pdf, pdfBytes);
    const out = join(dir, "report.nzip");
    writeNzipCollectionBundle({
      outputPath: out,
      omitOriginalDocuments: true,
      originSha256: true,
      members: [
        {
          originalPath: pdf,
          originalName: "report.pdf",
          mimeType: "application/pdf",
          structuredMarkdown: "# report\n",
        },
      ],
    });
    const parsed = listZipEntries(out).find(
      (e) => e.name === "wiki/parsed/report.pdf.md",
    );
    assert.ok(parsed);
    assert.equal(parsed!.originSha256, originSha256Of(pdfBytes).toString("hex"));
    assert.equal(parsed!.originCrc32, undefined);
    const originExtra = makeOriginExtra({
      size: pdfBytes.length,
      mtime: parsed!.originMtime,
      sha256: originSha256Of(pdfBytes),
    });
    assert.equal(parsed!.extraFieldLength, originExtra.length);
  });

  it("stamps original ZIP dates from source mtime; parsed dates follow the flag", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-mtime-"));
    const pdf = join(dir, "report.pdf");
    const txt = join(dir, "notes.txt");
    writeFileSync(pdf, "%PDF-report\n");
    writeFileSync(txt, "plain notes\n");
    const sourceTime = new Date(2020, 5, 15, 14, 30, 44);
    utimesSync(pdf, sourceTime, sourceTime);
    utimesSync(txt, sourceTime, sourceTime);
    const expected = toDosDateTime(statSync(pdf).mtime);
    const outDefault = join(dir, "default.nzip");
    const outParsed = join(dir, "parsed-date.nzip");
    const members = [
      {
        originalPath: pdf,
        originalName: "report.pdf",
        mimeType: "application/pdf",
        structuredMarkdown: "# Report\n",
        digest: "report",
      },
      {
        originalPath: txt,
        originalName: "notes.txt",
        mimeType: "text/plain",
        structuredMarkdown: "# Notes\n",
        digest: "notes",
      },
    ];

    writeNzipCollectionBundle({
      outputPath: outDefault,
      digest: "mtime default",
      omitOriginalDocuments: false,
      members,
      okf: { files: [{ name: "index.md", data: "# index\n" }] },
    });
    writeNzipCollectionBundle({
      outputPath: outParsed,
      digest: "mtime parsed from original",
      omitOriginalDocuments: false,
      parsedMtimeFromOriginal: true,
      members,
      okf: { files: [{ name: "index.md", data: "# index\n" }] },
    });

    const byName = (zip: string) =>
      Object.fromEntries(listZipEntries(zip).map((e) => [e.name, e]));

    const def = byName(outDefault);
    assert.equal(def["report.pdf"]?.dosDate, expected.date);
    assert.equal(def["report.pdf"]?.dosTime, expected.time);
    assert.equal(def["notes.txt"]?.dosDate, expected.date);
    assert.equal(def["notes.txt"]?.dosTime, expected.time);
    assert.notEqual(def["wiki/parsed/report.pdf.md"]?.dosDate, expected.date);
    assert.equal(
      def["wiki/parsed/report.pdf.md"]?.dosDate,
      def["META-INF/manifest.json"]?.dosDate,
    );
    assert.equal(
      def["wiki/okf/index.md"]?.dosDate,
      def["META-INF/manifest.json"]?.dosDate,
    );

    const stamped = byName(outParsed);
    assert.equal(stamped["report.pdf"]?.dosDate, expected.date);
    assert.equal(stamped["wiki/parsed/report.pdf.md"]?.dosDate, expected.date);
    assert.equal(stamped["wiki/parsed/report.pdf.md"]?.dosTime, expected.time);
    assert.equal(stamped["wiki/parsed/notes.txt.md"]?.dosDate, expected.date);
    assert.notEqual(
      stamped["wiki/okf/index.md"]?.dosDate,
      expected.date,
    );
    assert.equal(
      stamped["META-INF/manifest.json"]?.dosDate,
      stamped["wiki/okf/index.md"]?.dosDate,
    );
  });

  it("writes wiki tree to a named wikiDir before zipping", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-wikidir-"));
    const original = join(dir, "hello.txt");
    writeFileSync(original, "hello neo\n");
    const wikiDir = join(dir, "package-root");
    const out = join(dir, "hello.txt.nzip");
    const result = writeNzipCollectionBundle({
      outputPath: out,
      wikiDir,
      digest: "wiki dir test",
      members: [
        {
          originalPath: original,
          originalName: "hello.txt",
          structuredMarkdown: "# Hello\n",
          digest: "wiki dir test",
        },
      ],
      okf: {
        files: [{ name: "index.md", data: "# Concepts\n" }],
        version: "0.2",
      },
    });

    assert.equal(result.wikiDir, wikiDir);
    assert.equal(
      existsSync(join(wikiDir, "META-INF/manifest.json")),
      true,
    );
    assert.equal(
      readFileSync(join(wikiDir, "wiki/parsed/hello.txt.md"), "utf-8"),
      "# Hello\n",
    );
    assert.equal(
      readFileSync(join(wikiDir, "wiki/okf/index.md"), "utf-8"),
      "# Concepts\n",
    );
    assert.deepEqual(listZipEntries(out).map((e) => e.name), [
      "META-INF/manifest.json",
      "wiki/okf/index.md",
      "wiki/parsed/hello.txt.md",
      "hello.txt",
    ]);
  });

  it("writes a 3-primary package with advisory primaries into the .nzip only", () => {
    const dir = mkdtempSync(join(tmpdir(), "nzip-tri-"));
    const files = ["a.txt", "b.txt", "c.txt"].map((name) => {
      const path = join(dir, name);
      writeFileSync(path, `${name}-bytes\n`);
      return path;
    });
    const out = join(dir, "sample-docs.nzip");

    const result = writeNzipCollectionBundle({
      outputPath: out,
      digest: "Three sample docs.",
      members: files.map((originalPath, i) => ({
        originalPath,
        originalName: basename(originalPath),
        mimeType: "text/plain",
        documentType: i === 0 ? "Financial_Report" : "Technical_Doc",
        structuredMarkdown: `# ${basename(originalPath)}\n`,
        digest: `Digest ${basename(originalPath)}`,
      })),
      okf: {
        files: [
          { name: "index.md", data: '---\nokf_version: "0.2"\n---\n' },
          { name: "document.md", data: "# Concept\n" },
          { name: "log.md", data: "# log\n" },
        ],
        version: "0.2",
      },
    });

    assert.equal(result.bundlePath, out);
    const names = listZipEntries(out).map((e) => e.name);
    assert.deepEqual(names, [
      "META-INF/manifest.json",
      "wiki/okf/document.md",
      "wiki/okf/index.md",
      "wiki/okf/log.md",
      "wiki/parsed/a.txt.md",
      "wiki/parsed/b.txt.md",
      "wiki/parsed/c.txt.md",
      "wiki/search.json",
      "a.txt",
      "b.txt",
      "c.txt",
    ]);

    const manifest = JSON.parse(
      readZipEntry(out, "META-INF/manifest.json").toString("utf-8"),
    );
    assert.equal(manifest.ai.primaryCount, 3);
    assert.equal(manifest.ai.primaries.length, 3);
    assert.deepEqual(
      manifest.ai.primaries.map((p: { path: string }) => p.path),
      names.filter((n) => !n.startsWith("META-INF/") && !n.startsWith("wiki/")),
    );
  });
});
