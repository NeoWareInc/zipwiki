/**
 * Per-entry ZIP / NeoZip integrity: CRC-32 always; SHA-256 when 0x014E present.
 */

import { createHash } from "node:crypto";
import {
  findZipEntry,
  listZipEntriesFromBuffer,
  readInflatedWithExtraFromHandle,
  readZipEntryPayload,
  useZipHandle,
  type ZipHandle,
  type ZipListEntry,
} from "./zip-list.js";

/** NeoZip Extra Field: SHA-256 of uncompressed payload (APPNOTE). */
export const EF_NZIP_SHA256 = 0x014e;

export class ZipIntegrityError extends Error {
  readonly code = "integrity_failed" as const;
  readonly entryName: string;

  constructor(message: string, entryName: string) {
    super(message);
    this.name = "ZipIntegrityError";
    this.entryName = entryName;
  }
}

export type VerifyPayloadResult = {
  crcOk: boolean;
  /** Present when a SHA-256 expectation was available and checked. */
  sha256Ok?: boolean;
  expectedCrc32: number;
  actualCrc32: number;
  expectedSha256?: string;
  actualSha256?: string;
};

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Walk ZIP Extra Field blob for NeoZip 0x014E (32-byte digest). */
export function parseSha256FromExtra(extra: Buffer): Buffer | null {
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = extra.readUInt16LE(i);
    const size = extra.readUInt16LE(i + 2);
    i += 4;
    if (i + size > extra.length) break;
    if (id === EF_NZIP_SHA256 && size === 32) {
      return Buffer.from(extra.subarray(i, i + 32));
    }
    i += size;
  }
  return null;
}

/** Local-header Extra Field for an entry. */
export function readLocalExtraField(
  buf: Buffer,
  entry: ZipListEntry,
): Buffer {
  const local = entry.localHeaderOffset;
  if (buf.readUInt32LE(local) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const extraStart = local + 30 + nameLen;
  return Buffer.from(buf.subarray(extraStart, extraStart + extraLen));
}

/**
 * Verify uncompressed payload against central-directory CRC-32 and optional
 * SHA-256 (0x014E extra, or caller-supplied expectedSha256Hex e.g. from manifest).
 */
export function verifyUncompressedPayload(
  entry: ZipListEntry,
  data: Buffer,
  opts?: {
    /** Raw Extra Field (local or central). */
    extra?: Buffer;
    /** Hex SHA-256 when Extra Field is absent (e.g. manifest content[].sha256). */
    expectedSha256Hex?: string | null;
  },
): VerifyPayloadResult {
  const actualCrc32 = crc32(data);
  const expectedCrc32 = entry.crc32 >>> 0;
  const crcOk = actualCrc32 === expectedCrc32;

  let expectedSha256: string | undefined;
  if (opts?.extra && opts.extra.length > 0) {
    const dig = parseSha256FromExtra(opts.extra);
    if (dig) expectedSha256 = dig.toString("hex");
  }
  if (!expectedSha256 && opts?.expectedSha256Hex?.trim()) {
    expectedSha256 = opts.expectedSha256Hex.trim().toLowerCase();
  }

  let sha256Ok: boolean | undefined;
  let actualSha256: string | undefined;
  if (expectedSha256) {
    actualSha256 = sha256Hex(data);
    sha256Ok = actualSha256 === expectedSha256.toLowerCase();
  }

  return {
    crcOk,
    sha256Ok,
    expectedCrc32,
    actualCrc32,
    expectedSha256,
    actualSha256,
  };
}

export function assertPayloadIntegrity(
  entry: ZipListEntry,
  data: Buffer,
  opts?: {
    extra?: Buffer;
    expectedSha256Hex?: string | null;
  },
): VerifyPayloadResult {
  const result = verifyUncompressedPayload(entry, data, opts);
  if (!result.crcOk) {
    throw new ZipIntegrityError(
      `CRC-32 mismatch for ${entry.name}: expected ${result.expectedCrc32.toString(16).padStart(8, "0")}, got ${result.actualCrc32.toString(16).padStart(8, "0")}`,
      entry.name,
    );
  }
  if (result.sha256Ok === false) {
    throw new ZipIntegrityError(
      `SHA-256 mismatch for ${entry.name}: expected ${result.expectedSha256}, got ${result.actualSha256}`,
      entry.name,
    );
  }
  return result;
}

export function manifestSha256FromEntries(
  entries: ZipListEntry[],
  entryName: string,
  readManifest: () => Buffer,
): string | null {
  const man = entries.find((e) => e.name === "META-INF/manifest.json");
  if (!man) return null;
  try {
    const raw = readManifest().toString("utf8");
    const manifest = JSON.parse(raw) as {
      content?: Array<{ path?: string; sha256?: string }>;
    };
    const hit = manifest.content?.find((c) => c.path === entryName);
    const hex = hit?.sha256?.trim();
    return hex && /^[0-9a-fA-F]{64}$/.test(hex) ? hex.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Look up content[].sha256 from META-INF/manifest.json when present. */
export function manifestSha256ForPath(
  zipBuf: Buffer,
  entries: ZipListEntry[],
  entryName: string,
): string | null {
  return manifestSha256FromEntries(entries, entryName, () => {
    const man = entries.find((e) => e.name === "META-INF/manifest.json");
    if (!man) return Buffer.alloc(0);
    return readZipEntryPayload(zipBuf, man);
  });
}

function verifyEntry(
  entry: ZipListEntry,
  data: Buffer,
  extra: Buffer,
  expectedSha256Hex: string | null,
): VerifyPayloadResult {
  return assertPayloadIntegrity(entry, data, {
    extra,
    expectedSha256Hex: parseSha256FromExtra(extra) ? null : expectedSha256Hex,
  });
}

/**
 * Inflate one entry and verify CRC-32 (+ SHA-256 when available).
 */
export function readZipEntryVerified(
  zipPath: string,
  entryName: string,
): { data: Buffer; integrity: VerifyPayloadResult } {
  return useZipHandle(zipPath, (h) =>
    readZipEntryVerifiedFromHandle(h, entryName),
  );
}

export function readZipEntryVerifiedFromHandle(
  handle: ZipHandle,
  entryName: string,
): { data: Buffer; integrity: VerifyPayloadResult } {
  const entry = findZipEntry(handle.entries, entryName);
  const { extra, data } = readInflatedWithExtraFromHandle(handle, entry);
  const expectedSha256Hex = parseSha256FromExtra(extra)
    ? null
    : manifestSha256FromEntries(handle.entries, entryName, () => {
        const man = handle.entries.find((e) => e.name === "META-INF/manifest.json");
        if (!man) return Buffer.alloc(0);
        return readInflatedWithExtraFromHandle(handle, man).data;
      });
  const integrity = verifyEntry(entry, data, extra, expectedSha256Hex);
  return { data, integrity };
}

export function readZipEntryVerifiedFromBuffer(
  buf: Buffer,
  entryName: string,
): { data: Buffer; integrity: VerifyPayloadResult } {
  const entries = listZipEntriesFromBuffer(buf);
  const entry = findZipEntry(entries, entryName);
  const data = readZipEntryPayload(buf, entry);
  const extra = readLocalExtraField(buf, entry);
  const expectedSha256Hex = parseSha256FromExtra(extra)
    ? null
    : manifestSha256ForPath(buf, entries, entryName);
  const integrity = verifyEntry(entry, data, extra, expectedSha256Hex);
  return { data, integrity };
}
