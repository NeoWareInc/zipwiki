/**
 * Golden `.zipwiki` fixtures built by `writeZipBuffer` in `../nzip.ts`, which
 * delegates to NeoZipKit `buildZipBufferSync` (see `../neozipkit-writer.ts`).
 *
 * Purpose: byte-stable reference archives. The pre-kit writer's fixtures were
 * semantically identical (`compareArchives`); only the header "version needed /
 * made by" words differ (kit: 30 zstd / 10 store+deflate; old: 63 / 20).
 * Do not hand-edit the generated `.zipwiki` files.
 *
 * Regenerate:
 *   pnpm --filter @zipwiki/zipwiki exec tsx src/lib/archive/__fixtures__/generate.ts
 *
 * Determinism:
 * - Every entry gets the same fixed `mtime` (a local-time `Date`, because
 *   `toDosDateTime` reads local components — so the DOS stamp is the same in
 *   every timezone).
 * - The manifest `createdAt` is a fixed string.
 * - `writeNzipCollectionBundle` is deliberately not used: it stamps pack time
 *   (`new Date()`) into the manifest and wiki entries and reads primary mtimes
 *   from disk. The fixtures instead assemble the same layout (manifest → wiki →
 *   primaries) from `buildNeoZipManifest` + `writeZipBuffer`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildNeoZipManifest,
  parsedPathFor,
  serializeNeoZipManifest,
  writeZipBuffer,
  type NeoZipAiPrimary,
  type ZipArchiveEntry,
} from "../nzip.js";
import {
  originLocatorFromOriginal,
  type OriginLocator,
} from "../origin-extra.js";

/** Fixed pack time. Local components → DOS stamp 2026-01-15 12:00:00 everywhere. */
export const GOLDEN_MTIME = new Date(2026, 0, 15, 12, 0, 0);
/** Unix seconds (UTC) recorded as the original's mtime in Extra Field 0x014F. */
export const GOLDEN_ORIGIN_MTIME = Math.floor(
  new Date("2026-01-15T12:00:00Z").getTime() / 1000,
);
export const GOLDEN_CREATED_AT = "2026-01-15T12:00:00.000Z";

export const GOLDEN_FIXTURE_NAMES = [
  "minimal.zipwiki",
  "with-origin.zipwiki",
  "omit-original.zipwiki",
] as const;
export type GoldenFixtureName = (typeof GOLDEN_FIXTURE_NAMES)[number];

/** Repetitive so zstd always wins over store (method 93, not 0). */
const DOC_TXT = `${"ZipWiki golden fixture primary text.\n".repeat(12)}`;
const DOC_PARSED = `# doc.txt\n\n${"Parsed extract of the golden fixture primary.\n\n".repeat(
  12,
)}`;
const SAMPLE_PDF = Buffer.from("%PDF-1.4\n%%EOF\n", "latin1");
const SAMPLE_PDF_PARSED = `# sample.pdf\n\n${"Parsed extract of the tiny PDF-like sample.\n\n".repeat(
  12,
)}`;

const WRITE_OPTS = { compression: "zstd", level: 7 } as const;

function entry(
  name: string,
  data: Buffer | string,
  origin?: OriginLocator,
): ZipArchiveEntry {
  return {
    name,
    data: Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8"),
    mtime: GOLDEN_MTIME,
    ...(origin ? { origin } : {}),
  };
}

function manifestEntry(primaries: NeoZipAiPrimary[]): ZipArchiveEntry {
  const manifest = buildNeoZipManifest({
    createdAt: GOLDEN_CREATED_AT,
    aiRoot: "wiki",
    primaries,
    parserEngine: "liteparse",
  });
  return entry("META-INF/manifest.json", serializeNeoZipManifest(manifest));
}

/** META-INF + parse + a small primary `doc.txt` + stored `sample.pdf`. */
function buildMinimal(): Buffer {
  const entries: ZipArchiveEntry[] = [
    manifestEntry([
      { path: "doc.txt", mimeType: "text/plain", hasParsed: true },
      { path: "sample.pdf", mimeType: "application/pdf", hasParsed: false },
    ]),
    entry(parsedPathFor("doc.txt"), DOC_PARSED),
    entry("doc.txt", DOC_TXT),
    entry("sample.pdf", SAMPLE_PDF),
  ];
  return writeZipBuffer(entries, WRITE_OPTS);
}

/** Original bytes locator as pack would record it (CRC-32 + size + mtime + URI). */
function pdfOrigin(): OriginLocator {
  return {
    ...originLocatorFromOriginal({
      data: SAMPLE_PDF,
      uri: "https://example.com/files/sample.pdf",
    }),
    mtime: GOLDEN_ORIGIN_MTIME,
  };
}

/** Parse members carry Extra Field 0x014F; originals stay in the archive. */
function buildWithOrigin(): Buffer {
  const docOrigin: OriginLocator = {
    ...originLocatorFromOriginal({
      data: Buffer.from(DOC_TXT, "utf-8"),
      uri: "https://example.com/files/doc.txt",
    }),
    mtime: GOLDEN_ORIGIN_MTIME,
  };
  const entries: ZipArchiveEntry[] = [
    manifestEntry([
      { path: "doc.txt", mimeType: "text/plain", hasParsed: true },
      { path: "sample.pdf", mimeType: "application/pdf", hasParsed: true },
    ]),
    entry(parsedPathFor("doc.txt"), DOC_PARSED, docOrigin),
    entry(parsedPathFor("sample.pdf"), SAMPLE_PDF_PARSED, pdfOrigin()),
    entry("doc.txt", DOC_TXT),
    entry("sample.pdf", SAMPLE_PDF),
  ];
  return writeZipBuffer(entries, WRITE_OPTS);
}

/**
 * `sample.pdf` original omitted (`sourceIncluded: false`); its parse member
 * keeps the 0x014F locator so the original can be fetched and CRC-verified.
 */
function buildOmitOriginal(): Buffer {
  const entries: ZipArchiveEntry[] = [
    manifestEntry([
      { path: "doc.txt", mimeType: "text/plain", hasParsed: true },
      {
        path: "sample.pdf",
        mimeType: "application/pdf",
        hasParsed: true,
        sourceIncluded: false,
      },
    ]),
    entry(parsedPathFor("doc.txt"), DOC_PARSED),
    entry(parsedPathFor("sample.pdf"), SAMPLE_PDF_PARSED, pdfOrigin()),
    entry("doc.txt", DOC_TXT),
  ];
  return writeZipBuffer(entries, WRITE_OPTS);
}

/** Build every golden fixture in memory (same inputs the checked-in files use). */
export function buildGoldenFixtures(): Record<GoldenFixtureName, Buffer> {
  return {
    "minimal.zipwiki": buildMinimal(),
    "with-origin.zipwiki": buildWithOrigin(),
    "omit-original.zipwiki": buildOmitOriginal(),
  };
}

export const GOLDEN_FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

export function writeGoldenFixtures(dir: string = GOLDEN_FIXTURES_DIR): void {
  mkdirSync(dir, { recursive: true });
  const fixtures = buildGoldenFixtures();
  for (const name of GOLDEN_FIXTURE_NAMES) {
    const buf = fixtures[name];
    writeFileSync(join(dir, name), buf);
    console.log(`${name}\t${buf.length} bytes`);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) writeGoldenFixtures();
