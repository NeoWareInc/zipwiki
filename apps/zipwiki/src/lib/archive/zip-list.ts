/**
 * ZIP central-directory listing and payload inflate for store/deflate/zstd.
 *
 * Wraps NeoZipKit {@link ZipReaderNode}: EOCD tail + central-directory + per-entry
 * pread (no full-file mmap). Payload reads here are **unverified**; use
 * `integrity.ts` for CRC-32 / SHA-256 checks.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import {
  ZipReaderNode,
  inflateZipPayloadSync,
  type ZipReaderEntry,
  type ZipReaderRaw,
} from "neozipkit/node";
import {
  originToApiFields,
  parseOriginFromExtra,
  type OriginApiFields,
} from "./origin-extra.js";

export type ZipListEntry = {
  name: string;
  /** APPNOTE compression method (0 = store, 8 = deflate, 93 = zstd). */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  /** MS-DOS modification time (central directory). */
  dosTime: number;
  /** MS-DOS modification date (central directory). */
  dosDate: number;
  /** Central-directory Extra Field length (bytes). */
  extraFieldLength: number;
  localHeaderOffset: number;
  /** Central-directory Extra Field bytes. */
  extra: Buffer;
} & OriginApiFields;

export type ZipHandle = {
  path: string;
  /** NeoZipKit reader holding the open fd + parsed central directory. */
  reader: ZipReaderNode;
  size: number;
  mtimeMs: number;
  ino: number;
  entries: ZipListEntry[];
};

/** Bytes read via pread for tests (listing a huge archive should stay near CD size). */
export let zipPreadBytes = 0;

export function resetZipPreadBytes(): void {
  zipPreadBytes = 0;
}

const zipHandleAls = new AsyncLocalStorage<ZipHandle>();

/** Reader `preadBytes` already folded into the module-level counter. */
const preadCounted = new WeakMap<ZipReaderNode, number>();

function syncPreadBytes(reader: ZipReaderNode): void {
  const seen = preadCounted.get(reader) ?? 0;
  const now = reader.preadBytes;
  if (now > seen) {
    zipPreadBytes += now - seen;
    preadCounted.set(reader, now);
  }
}

/** Map a kit reader entry onto the ZipWiki list shape (origin fields from 0x014F). */
function toListEntry(e: ZipReaderEntry): ZipListEntry {
  return {
    name: e.name,
    method: e.method,
    compressedSize: e.compressedSize,
    uncompressedSize: e.uncompressedSize,
    crc32: e.crc32,
    dosTime: e.dosTime,
    dosDate: e.dosDate,
    extraFieldLength: e.centralExtra.length,
    extra: e.centralExtra,
    localHeaderOffset: e.localHeaderOffset,
    ...originToApiFields(parseOriginFromExtra(e.centralExtra)),
  };
}

/** Rebuild a kit reader entry from a list entry (stateless raw reads). */
function toReaderEntry(entry: ZipListEntry): ZipReaderEntry {
  return {
    name: entry.name,
    method: entry.method,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    crc32: entry.crc32,
    dosTime: entry.dosTime,
    dosDate: entry.dosDate,
    localHeaderOffset: entry.localHeaderOffset,
    centralExtra: entry.extra,
    flags: 0,
    comment: "",
    externalAttr: 0,
    internalAttr: 0,
  };
}

const bufferReaders = new WeakMap<Buffer, ZipReaderNode>();

function readerForBuffer(buf: Buffer): ZipReaderNode {
  let reader = bufferReaders.get(buf);
  if (!reader) {
    reader = ZipReaderNode.fromBuffer(buf);
    bufferReaders.set(buf, reader);
  }
  return reader;
}

/** Always re-parses the central directory (callers may mutate `buf` between calls). */
export function listZipEntriesFromBuffer(buf: Buffer): ZipListEntry[] {
  const reader = ZipReaderNode.fromBuffer(buf);
  bufferReaders.set(buf, reader);
  return reader.entries().map(toListEntry);
}

/** Open a ZIP, parse the central directory via ranged reads, keep the fd. */
export function openZipHandle(zipPath: string): ZipHandle {
  const path = resolve(zipPath);
  const reader = ZipReaderNode.open(path);
  try {
    const st = statSync(path);
    syncPreadBytes(reader);
    return {
      path,
      reader,
      size: reader.size,
      mtimeMs: st.mtimeMs,
      ino: st.ino,
      entries: reader.entries().map(toListEntry),
    };
  } catch (err) {
    reader.close();
    throw err;
  }
}

export function closeZipHandle(handle: ZipHandle): void {
  try {
    syncPreadBytes(handle.reader);
    handle.reader.close();
  } catch {
    // already closed
  }
}

/** Run `fn` with `handle` as the active archive (nested reads reuse it). */
export function runWithZipHandle<T>(handle: ZipHandle, fn: () => T): T {
  return zipHandleAls.run(handle, fn);
}

/**
 * Open (or reuse ALS) a handle for `zipPath`, run `fn`, close if this call opened it.
 */
export function useZipHandle<T>(
  zipPath: string,
  fn: (handle: ZipHandle) => T,
): T {
  const abs = resolve(zipPath);
  const existing = zipHandleAls.getStore();
  if (existing && existing.path === abs) {
    return fn(existing);
  }
  const handle = openZipHandle(abs);
  try {
    return zipHandleAls.run(handle, () => fn(handle));
  } finally {
    closeZipHandle(handle);
  }
}

export function listZipEntries(zipPath: string): ZipListEntry[] {
  return useZipHandle(zipPath, (h) => h.entries);
}

export function findZipEntry(
  entries: ZipListEntry[],
  entryName: string,
): ZipListEntry {
  const entry = entries.find((e) => e.name === entryName);
  if (!entry) {
    throw new Error(`ZIP entry not found: ${entryName}`);
  }
  return entry;
}

/** Inflate a compressed payload (store / deflate / zstd) without verification. */
export function inflateZipPayload(
  compressed: Buffer,
  entry: Pick<ZipListEntry, "name" | "method">,
): Buffer {
  if (entry.method !== 0 && entry.method !== 8 && entry.method !== 93) {
    throw new Error(
      `ZIP entry "${entry.name}" uses unsupported method ${entry.method}`,
    );
  }
  return inflateZipPayloadSync(entry.method, compressed);
}

type LocalLayout = {
  extra: Buffer;
  compressed: Buffer;
};

function localLayoutFromReader(
  reader: ZipReaderNode,
  entry: ZipListEntry,
): LocalLayout {
  const raw = reader.readRaw(toReaderEntry(entry));
  syncPreadBytes(reader);
  return { extra: raw.localExtra, compressed: raw.compressed };
}

export function readLocalExtraFieldFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): Buffer {
  return localLayoutFromReader(handle.reader, entry).extra;
}

export function readInflatedWithExtraFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): { extra: Buffer; data: Buffer } {
  const layout = localLayoutFromReader(handle.reader, entry);
  return {
    extra: layout.extra,
    data: inflateZipPayload(layout.compressed, entry),
  };
}

export function readZipEntryPayloadFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): Buffer {
  return readInflatedWithExtraFromHandle(handle, entry).data;
}

export function readZipEntryFromHandle(
  handle: ZipHandle,
  entryName: string,
): Buffer {
  const entry = findZipEntry(handle.entries, entryName);
  return readZipEntryPayloadFromHandle(handle, entry);
}

/**
 * Read and inflate one entry's uncompressed payload (ranged I/O).
 */
export function readZipEntry(zipPath: string, entryName: string): Buffer {
  return useZipHandle(zipPath, (h) => readZipEntryFromHandle(h, entryName));
}

export function readZipEntryPayload(buf: Buffer, entry: ZipListEntry): Buffer {
  return inflateZipPayload(readCompressedPayload(buf, entry), entry);
}

/** Compressed payload bytes for one CD entry (no inflate). */
export function readCompressedPayload(buf: Buffer, entry: ZipListEntry): Buffer {
  return readerForBuffer(buf).readRaw(toReaderEntry(entry)).compressed;
}

export function readCompressedPayloadFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): Buffer {
  return localLayoutFromReader(handle.reader, entry).compressed;
}

/** Kit `readRaw` for one member of an in-memory archive (no inflate, no verify). */
export function readRawMemberFromBuffer(
  buf: Buffer,
  entry: ZipListEntry,
): ZipReaderRaw {
  return readerForBuffer(buf).readRaw(toReaderEntry(entry));
}

/** Local-header Extra Field for an entry in an in-memory archive. */
export function readLocalExtraFieldFromBuffer(
  buf: Buffer,
  entry: ZipListEntry,
): Buffer {
  return readerForBuffer(buf).readRaw(toReaderEntry(entry)).localExtra;
}

/** Decode MS-DOS date/time to local calendar fields. */
export function fromDosDateTime(
  dosTime: number,
  dosDate: number,
): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } {
  return {
    year: 1980 + ((dosDate >> 9) & 0x7f),
    month: (dosDate >> 5) & 0x0f,
    day: dosDate & 0x1f,
    hours: (dosTime >> 11) & 0x1f,
    minutes: (dosTime >> 5) & 0x3f,
    seconds: (dosTime & 0x1f) * 2,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Info-ZIP Cmpr %; one decimal when above 90%. */
export function formatCompressionPercent(
  compressedBytes: number,
  uncompressedBytes: number,
): string {
  if (uncompressedBytes <= 0) return "0%";
  const raw = Math.max(0, (1 - compressedBytes / uncompressedBytes) * 100);
  if (raw > 90) {
    const tenths = Math.round(raw * 10) / 10;
    return `${tenths.toFixed(1)}%`;
  }
  return `${Math.round(raw)}%`;
}

/** Info-ZIP-style method label (Unk:093 matches stock unzip for zstd). */
export function zipMethodLabel(method: number): string {
  if (method === 0) return "Stored";
  if (method === 8) return "Defl:N";
  if (method === 93) return "Zstd";
  return `Unk:${String(method).padStart(3, "0")}`;
}

/**
 * One line of Info-ZIP / neounzip extract progress.
 * Stored → `extracting:`; Deflate → `inflating:`; Zstd → `decompress:`
 * (`decompressing` does not fit the 13-character Info-ZIP name column).
 */
export function zipExtractLine(name: string, method: number): string {
  const verb =
    method === 0
      ? " extracting: "
      : method === 93
        ? "decompress: "
        : "  inflating: ";
  return `${verb}${name}`;
}

const LISTING_RULE =
  "--------  ------  ------- ---- ---------- ----- --------  ----";

/**
 * Format entries like Info-ZIP `unzip -v` / `neolist`.
 */
export function formatZipListing(
  entries: ZipListEntry[],
  opts?: { archivePath?: string },
): string {
  const lines: string[] = [];
  if (opts?.archivePath) {
    lines.push(`Archive:  ${opts.archivePath}`);
  }
  lines.push(
    "  Length  Method     Size Cmpr Date       Time   CRC-32    Name",
  );
  lines.push(LISTING_RULE);

  let totalUnc = 0;
  let totalComp = 0;

  for (const e of entries) {
    totalUnc += e.uncompressedSize;
    totalComp += e.compressedSize;
    const cmpr = formatCompressionPercent(
      e.compressedSize,
      e.uncompressedSize,
    );
    const dt = fromDosDateTime(e.dosTime, e.dosDate);
    const dateStr = `${pad2(dt.month)}-${pad2(dt.day)}-${dt.year}`;
    const timeStr = `${pad2(dt.hours)}:${pad2(dt.minutes)}`;
    const method = zipMethodLabel(e.method).padEnd(6);
    const crc = (e.crc32 >>> 0).toString(16).padStart(8, "0");
    const cmprField = cmpr.padEnd(5);
    lines.push(
      `${String(e.uncompressedSize).padStart(8)}  ${method}  ${String(e.compressedSize).padStart(7)} ${cmprField}${dateStr} ${timeStr}  ${crc}  ${e.name}`,
    );
  }

  const totalCmpr = formatCompressionPercent(totalComp, totalUnc);
  lines.push(LISTING_RULE);
  lines.push(
    `${String(totalUnc).padStart(8)}          ${String(totalComp).padStart(7)}      ${totalCmpr}   `,
  );
  return lines.join("\n");
}

/** Byte size for the create summary. Megabytes and above use two decimals. */
export function formatByteSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Where the input documents live, matching the package overview. */
export function formatOriginalPlacement(input: {
  included: number;
  linked: number;
  omitted: number;
}): string {
  const included = input.included;
  const linked = input.linked;
  const omitted = input.omitted;
  const total = included + linked + omitted;
  if (total === 0 || omitted === total) return "not included";
  if (included === total) return "included in archive";
  if (linked === total) return "linked to originals";
  const parts: string[] = [];
  if (included > 0) parts.push(`${included} included in archive`);
  if (linked > 0) parts.push(`${linked} linked to originals`);
  if (omitted > 0) parts.push(`${omitted} not included`);
  return parts.join(", ");
}

/**
 * Closing lines after a create: archive name and size, then input documents,
 * their size, where the originals live, and compression when the archive
 * is smaller than those documents.
 */
export function formatOriginalsSummary(input: {
  fileName: string;
  documentCount: number;
  originalBytes: number;
  archiveBytes: number;
  included: number;
  linked: number;
  omitted: number;
}): string {
  const count = input.documentCount;
  const files = `${count.toLocaleString()} input document${count === 1 ? "" : "s"}`;
  const placement = formatOriginalPlacement(input);
  const compressed =
    input.originalBytes > 0 && input.archiveBytes < input.originalBytes
      ? ` · ${formatCompressionPercent(input.archiveBytes, input.originalBytes)} compressed`
      : "";
  return [
    `${input.fileName} · ${formatByteSize(input.archiveBytes)}`,
    `${files} · ${formatByteSize(input.originalBytes)} · ${placement}${compressed}`,
  ].join("\n");
}
