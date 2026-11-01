import {
  ZipReaderBrowser,
  parseOriginFromExtra,
  type OriginLocator,
  type ZipReaderBrowserEntry,
} from "neozipkit/browser";

/** Canonical .nzip paths (APPNOTE 0.2) — mirrored for browser use. */
export const BUNDLE_PATHS = {
  metaInf: "META-INF/",
  manifest: "META-INF/manifest.json",
  aiRoot: "wiki",
  parsed: "wiki/parsed/",
  okfRoot: "wiki/okf/",
  okfIndex: "wiki/okf/index.md",
} as const;

export type ZipListEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  /** Central-directory MS-DOS last-mod time. */
  dosTime: number;
  /** Central-directory MS-DOS last-mod date. */
  dosDate: number;
  /** Unix seconds from DOS last-mod (local calendar fields). */
  mtimeSeconds: number;
  originUri?: string;
  originCrc32?: string;
  originSize?: number;
  originMtime?: number;
  originMtimeUtc?: string;
  originSha256?: string;
};

/** Decode MS-DOS date/time to Unix seconds (local wall clock). */
export function dosDateTimeToUnixSeconds(
  dosTime: number,
  dosDate: number,
): number {
  const year = 1980 + ((dosDate >> 9) & 0x7f);
  const month = (dosDate >> 5) & 0x0f;
  const day = dosDate & 0x1f;
  const hours = (dosTime >> 11) & 0x1f;
  const minutes = (dosTime >> 5) & 0x3f;
  const seconds = (dosTime & 0x1f) * 2;
  if (month < 1 || month > 12 || day < 1 || day > 31) return 0;
  const ms = new Date(year, month - 1, day, hours, minutes, seconds).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.floor(ms / 1000);
}

export function zipMethodLabel(method: number): string {
  if (method === 0) return "Stored";
  if (method === 8) return "Deflate";
  if (method === 93) return "Zstd";
  return `Unk:${String(method).padStart(3, "0")}`;
}

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function originCrc32Hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function originMtimeIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Map a kit `0x014F` locator onto the flat API fields used by the web UI. */
function originToApiFields(loc: OriginLocator | null): {
  originUri?: string;
  originCrc32?: string;
  originSize?: number;
  originMtime?: number;
  originMtimeUtc?: string;
  originSha256?: string;
} {
  if (!loc) return {};
  const sha =
    loc.sha256 === undefined
      ? undefined
      : typeof loc.sha256 === "string"
        ? loc.sha256.toLowerCase()
        : hexOf(loc.sha256);
  return {
    ...(loc.uri ? { originUri: loc.uri } : {}),
    ...(loc.crc32 !== undefined ? { originCrc32: originCrc32Hex(loc.crc32) } : {}),
    ...(loc.size !== undefined ? { originSize: loc.size } : {}),
    ...(loc.mtime !== undefined
      ? { originMtime: loc.mtime, originMtimeUtc: originMtimeIso(loc.mtime) }
      : {}),
    ...(sha ? { originSha256: sha } : {}),
  };
}

/** Open a package for positioned, verified entry reads (central directory only). */
export async function createPackageReader(
  buf: ArrayBuffer,
): Promise<ZipReaderBrowser> {
  return ZipReaderBrowser.fromArrayBuffer(buf);
}

/** Map a kit reader entry (+ Extra Field 0x014F) onto the web list shape. */
export function toZipListEntry(e: ZipReaderBrowserEntry): ZipListEntry {
  // `centralExtra` is a Buffer at runtime (kit uses the `buffer` package in browsers).
  const origin = parseOriginFromExtra(
    e.centralExtra as Parameters<typeof parseOriginFromExtra>[0],
  );
  return {
    name: e.name,
    method: e.method,
    compressedSize: e.compressedSize,
    uncompressedSize: e.uncompressedSize,
    crc32: e.crc32,
    localHeaderOffset: e.localHeaderOffset,
    dosTime: e.dosTime,
    dosDate: e.dosDate,
    mtimeSeconds: dosDateTimeToUnixSeconds(e.dosTime, e.dosDate),
    ...originToApiFields(origin),
  };
}

export function listZipEntries(reader: ZipReaderBrowser): ZipListEntry[] {
  return reader.entries().map(toZipListEntry);
}

/**
 * Inflate one entry. The kit checks size, CRC-32, and any 0x014E SHA-256
 * and throws on mismatch.
 */
export async function readZipEntryPayload(
  reader: ZipReaderBrowser,
  entry: ZipListEntry,
): Promise<Uint8Array> {
  return reader.readEntry(entry.name);
}

export async function readZipEntryText(
  reader: ZipReaderBrowser,
  entryName: string,
  maxBytes = 256 * 1024,
): Promise<string> {
  if (!reader.getEntry(entryName)) {
    throw new Error(`ZIP entry not found: ${entryName}`);
  }
  const raw = await reader.readEntry(entryName);
  const slice = raw.byteLength > maxBytes ? raw.subarray(0, maxBytes) : raw;
  return new TextDecoder("utf-8").decode(slice);
}
