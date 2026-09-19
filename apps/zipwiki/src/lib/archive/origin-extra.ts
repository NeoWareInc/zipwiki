import { createHash } from "node:crypto";

/**
 * NeoZip Extra Field 0x014F — original attributes on a parsed member
 * (APPNOTE §7.1.1). Each attribute is independently optional.
 *
 * v1 (until first release) — TLV after a version byte:
 *   Header ID = 0x014F
 *   Data Size = 1 + Σ(3 + value_len)
 *   version (1) = 0x01
 *   records: tag u8 | len u16 LE | value
 *
 * Registered tags: URI, size, mtime, and one original digest — CRC-32 by
 * default, or SHA-256 of the original primary when requested (not both).
 *
 * Pre-release encodings are not valid. Do not bump this version until
 * the first release.
 */

/** NeoZip Extra Field: original locator (`HDR_ID.NEO_ORIGIN`). */
export const EF_NZIP_ORIGIN = 0x014f;

/** Payload: version byte + TLV records. Stays 0x01 until first release. */
export const ORIGIN_EXTRA_VERSION = 0x01;

/** Soft cap on URI byte length (well under uint16 extra size). */
export const ORIGIN_URI_MAX_BYTES = 2048;

/** Registered v1 TLV tags. Unknown tags are skipped (forward compatible). */
export const ORIGIN_TAG = {
  URI: 0x01,
  CRC32: 0x02,
  SIZE: 0x03,
  MTIME: 0x04,
  SHA256: 0x05,
} as const;

export type OriginLocator = {
  /** Absolute RFC 3986 URI (`https:` / `http:` / `file:`). */
  uri?: string;
  /** ZIP/IEEE CRC-32 of original uncompressed bytes. */
  crc32?: number;
  /** Original uncompressed byte length. */
  size?: number;
  /** Original modification time: Unix seconds (UTC, signed). */
  mtime?: number;
  /** SHA-256 of original uncompressed primary bytes (32 bytes or hex). */
  sha256?: Buffer | string;
};

export type OriginApiFields = {
  originUri?: string;
  /** ZIP CRC-32 of original bytes as 8 lowercase hex digits. */
  originCrc32?: string;
  originSize?: number;
  /** Original mtime as Unix seconds UTC. */
  originMtime?: number;
  /** ISO-8601 UTC expansion of `originMtime` (shown after the Unix value). */
  originMtimeUtc?: string;
  originSha256?: string;
};

function zipCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP/IEEE CRC-32 of uncompressed bytes (same polynomial as CD CRC-32). */
export function originCrc32Of(buf: Buffer): number {
  return zipCrc32(buf);
}

/** SHA-256 of uncompressed original bytes (not the parse markdown). */
export function originSha256Of(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

function originSha256Bytes(value: Buffer | string): Buffer {
  const buf = typeof value === "string" ? Buffer.from(value, "hex") : value;
  if (buf.length !== 32) {
    throw new Error("0x014F sha256 must be 32 bytes");
  }
  return buf;
}

function originSha256Hex(
  value: Buffer | string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  try {
    return originSha256Bytes(value).toString("hex");
  } catch {
    return undefined;
  }
}

/** Truncate a Date to Unix seconds (UTC). */
export function unixTimeSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** ZIP CRC-32 as 8 lowercase hex digits (no `0x` prefix). */
export function originCrc32Hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Parse a reported CRC-32 (hex string or legacy unsigned integer). */
export function originCrc32FromApi(value: string | number): number {
  if (typeof value === "number") return value >>> 0;
  const hex = value.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,8}$/.test(hex)) {
    throw new Error(`Invalid originCrc32 hex: ${value}`);
  }
  return Number.parseInt(hex, 16) >>> 0;
}

/** Expand Unix seconds to ISO-8601 UTC without milliseconds. */
export function originMtimeIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Copy already-formatted origin API fields (do not re-parse locators). */
export function pickOriginApiFields(
  src: OriginApiFields | null | undefined,
): OriginApiFields {
  if (!src) return {};
  return {
    ...(src.originUri ? { originUri: src.originUri } : {}),
    ...(src.originCrc32 !== undefined ? { originCrc32: src.originCrc32 } : {}),
    ...(src.originSize !== undefined ? { originSize: src.originSize } : {}),
    ...(src.originMtime !== undefined ? { originMtime: src.originMtime } : {}),
    ...(src.originMtimeUtc ? { originMtimeUtc: src.originMtimeUtc } : {}),
    ...(src.originSha256 ? { originSha256: src.originSha256 } : {}),
  };
}

export function originLocatorPresent(
  loc: OriginLocator | null | undefined,
): loc is OriginLocator {
  if (!loc) return false;
  return (
    (typeof loc.uri === "string" && loc.uri.length > 0) ||
    loc.crc32 !== undefined ||
    loc.size !== undefined ||
    loc.mtime !== undefined ||
    loc.sha256 !== undefined
  );
}

/** Flatten a locator into zipaccess / MCP field names. */
export function originToApiFields(
  loc: OriginLocator | null | undefined,
): OriginApiFields {
  if (!originLocatorPresent(loc)) return {};
  const shaHex = originSha256Hex(loc.sha256);
  return {
    ...(loc.uri ? { originUri: loc.uri } : {}),
    ...(loc.crc32 !== undefined ? { originCrc32: originCrc32Hex(loc.crc32) } : {}),
    ...(loc.size !== undefined ? { originSize: loc.size } : {}),
    ...(loc.mtime !== undefined
      ? { originMtime: loc.mtime, originMtimeUtc: originMtimeIso(loc.mtime) }
      : {}),
    ...(shaHex ? { originSha256: shaHex } : {}),
  };
}

/**
 * Pack-time locator from original bytes + filesystem mtime.
 * Omits any attribute the caller did not supply.
 *
 * Integrity tag: CRC-32 by default. When SHA-256 is requested, CRC-32 is
 * omitted (one digest is enough). Pass `includeCrc: true` with SHA-256 only
 * if both tags are required.
 */
export function originLocatorFromOriginal(input: {
  data: Buffer;
  mtime?: Date;
  uri?: string;
  /** When false, skip CRC even though bytes are present. Default: true unless SHA-256 is requested. */
  includeCrc?: boolean;
  /** When true, include SHA-256 of the original bytes and omit CRC-32. Default false. */
  includeSha256?: boolean;
}): OriginLocator {
  const loc: OriginLocator = {};
  const uri = input.uri?.trim();
  if (uri) loc.uri = uri;
  const includeSha256 = input.includeSha256 === true;
  const includeCrc =
    input.includeCrc === true
      ? true
      : input.includeCrc === false
        ? false
        : !includeSha256;
  if (includeCrc) loc.crc32 = originCrc32Of(input.data);
  loc.size = input.data.length;
  if (input.mtime) loc.mtime = unixTimeSeconds(input.mtime);
  if (includeSha256) loc.sha256 = originSha256Of(input.data);
  return loc;
}

function tlv(tag: number, value: Buffer): Buffer {
  const rec = Buffer.alloc(3 + value.length);
  rec.writeUInt8(tag, 0);
  rec.writeUInt16LE(value.length, 1);
  value.copy(rec, 3);
  return rec;
}

function assertInteger(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`0x014F ${name} must be an integer`);
  }
}

/**
 * Build Extra Field 0x014F (v1 TLV). Throws if no attribute is present,
 * if URI is empty when provided, or if URI exceeds max bytes.
 */
export function makeOriginExtra(loc: OriginLocator): Buffer {
  const records: Buffer[] = [];

  const uri = loc.uri?.trim();
  if (uri !== undefined && uri.length === 0) {
    throw new Error("0x014F URI must be non-empty when present");
  }
  if (uri) {
    const uriBuf = Buffer.from(uri, "utf-8");
    if (uriBuf.length > ORIGIN_URI_MAX_BYTES) {
      throw new Error(
        `0x014F URI exceeds ${ORIGIN_URI_MAX_BYTES} bytes (${uriBuf.length})`,
      );
    }
    records.push(tlv(ORIGIN_TAG.URI, uriBuf));
  }

  if (loc.crc32 !== undefined) {
    assertInteger("crc32", loc.crc32);
    const b = Buffer.alloc(4);
    b.writeUInt32LE(loc.crc32 >>> 0, 0);
    records.push(tlv(ORIGIN_TAG.CRC32, b));
  }

  if (loc.size !== undefined) {
    assertInteger("size", loc.size);
    if (loc.size < 0) {
      throw new Error("0x014F size must be >= 0");
    }
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(loc.size), 0);
    records.push(tlv(ORIGIN_TAG.SIZE, b));
  }

  if (loc.mtime !== undefined) {
    assertInteger("mtime", loc.mtime);
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(BigInt(loc.mtime), 0);
    records.push(tlv(ORIGIN_TAG.MTIME, b));
  }

  if (loc.sha256 !== undefined) {
    records.push(tlv(ORIGIN_TAG.SHA256, originSha256Bytes(loc.sha256)));
  }

  if (records.length === 0) {
    throw new Error("0x014F requires at least one attribute");
  }

  const dataSize = 1 + records.reduce((n, r) => n + r.length, 0);
  const extra = Buffer.alloc(4 + dataSize);
  extra.writeUInt16LE(EF_NZIP_ORIGIN, 0);
  extra.writeUInt16LE(dataSize, 2);
  extra.writeUInt8(ORIGIN_EXTRA_VERSION, 4);
  let off = 5;
  for (const rec of records) {
    rec.copy(extra, off);
    off += rec.length;
  }
  return extra;
}

function parseOriginTlv(data: Buffer): OriginLocator | null {
  const loc: OriginLocator = {};
  let i = 0;
  while (i + 3 <= data.length) {
    const tag = data.readUInt8(i);
    const len = data.readUInt16LE(i + 1);
    i += 3;
    if (i + len > data.length) break;
    const value = data.subarray(i, i + len);
    i += len;
    if (tag === ORIGIN_TAG.URI && len > 0) {
      const uri = value.toString("utf-8");
      if (uri.length > 0) loc.uri = uri;
    } else if (tag === ORIGIN_TAG.CRC32 && len === 4) {
      loc.crc32 = value.readUInt32LE(0) >>> 0;
    } else if (tag === ORIGIN_TAG.SIZE && len === 8) {
      const n = value.readBigUInt64LE(0);
      loc.size = Number(n);
    } else if (tag === ORIGIN_TAG.MTIME && len === 8) {
      loc.mtime = Number(value.readBigInt64LE(0));
    } else if (tag === ORIGIN_TAG.SHA256 && len === 32) {
      loc.sha256 = Buffer.from(value);
    }
    // Unknown tags and wrong-length known tags: skip.
  }
  return originLocatorPresent(loc) ? loc : null;
}

/** Walk a ZIP Extra Field blob for NeoZip 0x014F (v1 TLV). */
export function parseOriginFromExtra(extra: Buffer): OriginLocator | null {
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = extra.readUInt16LE(i);
    const size = extra.readUInt16LE(i + 2);
    i += 4;
    if (i + size > extra.length) break;
    if (id === EF_NZIP_ORIGIN && size >= 1) {
      const version = extra.readUInt8(i);
      const payload = extra.subarray(i + 1, i + size);
      if (version === ORIGIN_EXTRA_VERSION) {
        const loc = parseOriginTlv(payload);
        if (loc) return loc;
      }
    }
    i += size;
  }
  return null;
}

/** Concatenate Extra Field blocks (e.g. 0x014E then 0x014F). */
export function concatExtraFields(...parts: Buffer[]): Buffer {
  return Buffer.concat(parts.filter((p) => p.length > 0));
}
