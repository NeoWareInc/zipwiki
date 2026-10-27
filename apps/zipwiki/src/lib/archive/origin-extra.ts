/**
 * NeoZip Extra Field 0x014F — original attributes on a parsed member
 * (APPNOTE §7.1.1). Each attribute is independently optional.
 *
 * TLV encode/decode, `OriginLocator`, tags, and CRC/SHA helpers live in
 * NeoZipKit (`neozipkit/node`). This module keeps ZipWiki policy:
 * manifest vs. CD record split, API field formatting, and pack-time locators.
 */

import {
  makeOriginExtra,
  ORIGIN_EXTRA_VERSION,
  ORIGIN_TAG,
  ORIGIN_URI_MAX_BYTES,
  originCrc32Of,
  originLocatorPresent,
  originSha256Of,
  parseOriginFromExtra,
  unixTimeSeconds,
  type OriginLocator,
} from "neozipkit/node";

export {
  makeOriginExtra,
  ORIGIN_EXTRA_VERSION,
  ORIGIN_TAG,
  ORIGIN_URI_MAX_BYTES,
  originCrc32Of,
  originLocatorPresent,
  originSha256Of,
  parseOriginFromExtra,
  unixTimeSeconds,
  type OriginLocator,
};

/** NeoZip Extra Field: original locator (`HDR_ID.NEO_ORIGIN`). */
export const EF_NZIP_ORIGIN = 0x014f;

/** Where origin URI, size, and mtime are stored. CRC stays on 0x014F when the original is omitted. */
export type OriginRecordMode = "manifest" | "cd" | "both";

export function parseOriginRecord(value: unknown): OriginRecordMode | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === "manifest" || v === "cd" || v === "both") return v;
  throw new Error(
    `Unknown origin record "${value}". Use manifest, cd, or both.`,
  );
}

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

export type ManifestOrigin = {
  uri?: string;
  size?: number;
  mtime?: number;
};

/**
 * Split a pack-time locator between the manifest and Extra Field 0x014F.
 * `manifest` (the default) keeps URI, size, and mtime in the manifest.
 * CRC-32 or origin SHA-256 stays on the extra field when the original is
 * omitted or SHA-256 was requested.
 */
export function splitOriginRecord(input: {
  locator: OriginLocator;
  record?: OriginRecordMode;
  sourceIncluded: boolean;
  originSha256?: boolean;
}): { manifest?: ManifestOrigin; extra?: OriginLocator } {
  const record = input.record ?? "manifest";
  const loc = input.locator;
  const hasLocator = typeof loc.uri === "string" && loc.uri.length > 0;
  const omitted = !input.sourceIncluded;
  const manifest: ManifestOrigin = {};
  if (record !== "cd" && (hasLocator || omitted)) {
    if (hasLocator) manifest.uri = loc.uri;
    if (loc.size !== undefined) manifest.size = loc.size;
    if (loc.mtime !== undefined) manifest.mtime = loc.mtime;
  }
  const keepStats = record === "cd" || record === "both";
  const extra: OriginLocator = {};
  if (keepStats && hasLocator) extra.uri = loc.uri;
  if (keepStats && loc.size !== undefined) extra.size = loc.size;
  if (keepStats && loc.mtime !== undefined) extra.mtime = loc.mtime;
  // CRC (or origin SHA-256) stays on 0x014F when the original is omitted or a
  // URI was resolved, so `origin --fetch` can still check the download.
  if (omitted || hasLocator || input.originSha256 === true) {
    if (loc.sha256 !== undefined) extra.sha256 = loc.sha256;
    else if (loc.crc32 !== undefined) extra.crc32 = loc.crc32;
  }
  return {
    ...(manifest.uri || manifest.size !== undefined || manifest.mtime !== undefined
      ? { manifest }
      : {}),
    ...(originLocatorPresent(extra) ? { extra } : {}),
  };
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

/** Concatenate Extra Field blocks (e.g. 0x014E then 0x014F). */
export function concatExtraFields(...parts: Buffer[]): Buffer {
  return Buffer.concat(parts.filter((p) => p.length > 0));
}
