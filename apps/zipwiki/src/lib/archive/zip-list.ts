/**
 * ZIP central-directory listing and payload inflate for store/deflate/zstd.
 * Disk reads use EOCD tail + central-directory + per-entry pread (no full-file mmap).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync, zstdDecompressSync } from "node:zlib";
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
  fd: number;
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

function preadAll(fd: number, length: number, position: number): Buffer {
  if (length <= 0) return Buffer.alloc(0);
  const buf = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const n = readSync(fd, buf, offset, length - offset, position + offset);
    if (n === 0) {
      throw new Error(
        `Unexpected EOF reading ZIP at offset ${position + offset}`,
      );
    }
    offset += n;
  }
  zipPreadBytes += length;
  return buf;
}

function findEocdOffset(scan: Buffer): number {
  const maxScan = Math.min(scan.length, 65536 + 22);
  for (let i = scan.length - 22; i >= scan.length - maxScan; i--) {
    if (i < 0) break;
    if (scan.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function parseCentralDirectory(
  cd: Buffer,
  totalEntries: number,
): ZipListEntry[] {
  const entries: ZipListEntry[] = [];
  let offset = 0;
  for (let n = 0; n < totalEntries; n++) {
    if (offset + 46 > cd.length || cd.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid central directory signature at ${offset}`);
    }
    const method = cd.readUInt16LE(offset + 10);
    const dosTime = cd.readUInt16LE(offset + 12);
    const dosDate = cd.readUInt16LE(offset + 14);
    const crc32 = cd.readUInt32LE(offset + 16);
    const compressedSize = cd.readUInt32LE(offset + 20);
    const uncompressedSize = cd.readUInt32LE(offset + 24);
    const nameLen = cd.readUInt16LE(offset + 28);
    const extraLen = cd.readUInt16LE(offset + 30);
    const commentLen = cd.readUInt16LE(offset + 32);
    const localHeaderOffset = cd.readUInt32LE(offset + 42);
    const recEnd = offset + 46 + nameLen + extraLen + commentLen;
    if (recEnd > cd.length) {
      throw new Error(`Truncated central directory at entry ${n}`);
    }
    const name = cd.subarray(offset + 46, offset + 46 + nameLen).toString("utf-8");
    const extraStart = offset + 46 + nameLen;
    const centralExtra = Buffer.from(
      cd.subarray(extraStart, extraStart + extraLen),
    );
    const origin = parseOriginFromExtra(centralExtra);
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      crc32,
      dosTime,
      dosDate,
      extraFieldLength: extraLen,
      extra: centralExtra,
      localHeaderOffset,
      ...originToApiFields(origin),
    });
    offset = recEnd;
  }
  return entries;
}

function listFromEocdWindow(
  scan: Buffer,
  fileSize: number,
  readCd: (offset: number, size: number) => Buffer,
): ZipListEntry[] {
  const eocdRel = findEocdOffset(scan);
  if (eocdRel < 0) throw new Error("ZIP EOCD not found");
  const eocdAbs = fileSize - scan.length + eocdRel;
  const totalEntries = scan.readUInt16LE(eocdRel + 10);
  const cdSizeField = scan.readUInt32LE(eocdRel + 12);
  const centralOffset = scan.readUInt32LE(eocdRel + 16);
  const cdSize =
    cdSizeField > 0 ? cdSizeField : Math.max(0, eocdAbs - centralOffset);
  const cd = readCd(centralOffset, cdSize);
  return parseCentralDirectory(cd, totalEntries);
}

export function listZipEntriesFromBuffer(buf: Buffer): ZipListEntry[] {
  const maxScan = Math.min(buf.length, 65536 + 22);
  const scan = buf.subarray(buf.length - maxScan);
  return listFromEocdWindow(scan, buf.length, (offset, size) =>
    Buffer.from(buf.subarray(offset, offset + size)),
  );
}

function listZipEntriesFromFd(fd: number, fileSize: number): ZipListEntry[] {
  const maxScan = Math.min(fileSize, 65536 + 22);
  const scanStart = fileSize - maxScan;
  const scan = preadAll(fd, maxScan, scanStart);
  return listFromEocdWindow(scan, fileSize, (offset, size) =>
    preadAll(fd, size, offset),
  );
}

/** Open a ZIP, parse the central directory via ranged reads, keep the fd. */
export function openZipHandle(zipPath: string): ZipHandle {
  const path = resolve(zipPath);
  const fd = openSync(path, "r");
  try {
    const st = fstatSync(fd);
    const entries = listZipEntriesFromFd(fd, st.size);
    return {
      path,
      fd,
      size: st.size,
      mtimeMs: st.mtimeMs,
      ino: st.ino,
      entries,
    };
  } catch (err) {
    closeSync(fd);
    throw err;
  }
}

export function closeZipHandle(handle: ZipHandle): void {
  try {
    closeSync(handle.fd);
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

function inflateZipPayload(
  compressed: Buffer,
  entry: ZipListEntry,
): Buffer {
  if (entry.method === 0) {
    return Buffer.from(compressed);
  }
  if (entry.method === 8) {
    return inflateRawSync(compressed);
  }
  if (entry.method === 93) {
    return zstdDecompressSync(compressed);
  }
  throw new Error(
    `ZIP entry "${entry.name}" uses unsupported method ${entry.method}`,
  );
}

type LocalLayout = {
  extra: Buffer;
  compressed: Buffer;
};

function localLayoutFromBuffer(buf: Buffer, entry: ZipListEntry): LocalLayout {
  const local = entry.localHeaderOffset;
  if (buf.readUInt32LE(local) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const extraStart = local + 30 + nameLen;
  const dataStart = extraStart + extraLen;
  return {
    extra: Buffer.from(buf.subarray(extraStart, extraStart + extraLen)),
    compressed: Buffer.from(
      buf.subarray(dataStart, dataStart + entry.compressedSize),
    ),
  };
}

function localLayoutFromFd(fd: number, entry: ZipListEntry): LocalLayout {
  const local = entry.localHeaderOffset;
  const header = preadAll(fd, 30, local);
  if (header.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }
  const nameLen = header.readUInt16LE(26);
  const extraLen = header.readUInt16LE(28);
  const extraStart = local + 30 + nameLen;
  const extra = extraLen > 0 ? preadAll(fd, extraLen, extraStart) : Buffer.alloc(0);
  const dataStart = extraStart + extraLen;
  const compressed =
    entry.compressedSize > 0
      ? preadAll(fd, entry.compressedSize, dataStart)
      : Buffer.alloc(0);
  return { extra, compressed };
}

export function readLocalExtraFieldFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): Buffer {
  return localLayoutFromFd(handle.fd, entry).extra;
}

export function readInflatedWithExtraFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): { extra: Buffer; data: Buffer } {
  const layout = localLayoutFromFd(handle.fd, entry);
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
  return inflateZipPayload(localLayoutFromBuffer(buf, entry).compressed, entry);
}

/** Compressed payload bytes for one CD entry (no inflate). */
export function readCompressedPayload(buf: Buffer, entry: ZipListEntry): Buffer {
  return localLayoutFromBuffer(buf, entry).compressed;
}

export function readCompressedPayloadFromHandle(
  handle: ZipHandle,
  entry: ZipListEntry,
): Buffer {
  return localLayoutFromFd(handle.fd, entry).compressed;
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

/**
 * Summary line after an archive listing: source document count/size vs
 * on-disk `.nzip` size, with Info-ZIP-style compression % (bytes saved).
 */
export function formatOriginalsSummary(input: {
  documentCount: number;
  originalBytes: number;
  archiveBytes: number;
}): string {
  const n = input.documentCount;
  const cmpr = formatCompressionPercent(
    input.archiveBytes,
    input.originalBytes,
  );
  return (
    `Originals: ${n.toLocaleString()} document${n === 1 ? "" : "s"}, ${input.originalBytes.toLocaleString()} bytes → ` +
    `archive ${input.archiveBytes.toLocaleString()} bytes (${cmpr})`
  );
}
