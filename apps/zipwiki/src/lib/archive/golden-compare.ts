/**
 * Semantic comparison of two ZipWiki archives.
 *
 * Used to prove a replacement ZIP writer (NeoZipKit) produces archives that
 * are equivalent to the current ZipWiki writer's golden fixtures: same entries
 * in the same order, same methods / CRC / sizes / extras, same decoded
 * payloads, same manifest, same content Merkle root.
 */

import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert/strict";
import { readLocalExtraField } from "./integrity.js";
import { computeArchiveMerkleRoot } from "./merkle.js";
import { type OriginApiFields } from "./origin-extra.js";
import {
  listZipEntriesFromBuffer,
  readZipEntryPayload,
  type ZipListEntry,
} from "./zip-list.js";

const MANIFEST_ENTRY = "META-INF/manifest.json";

export type GoldenEntrySummary = {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Central-directory extra field bytes (hex). */
  extraHex: string;
  /** Local-header extra field bytes (hex). */
  localExtraHex: string;
  dosTime: number;
  dosDate: number;
  /** SHA-256 of the decoded payload (proves bytes round-trip, not just CRC). */
  payloadSha256: string;
  /** Parsed Extra Field 0x014F, when present. */
  origin?: OriginApiFields;
};

export type GoldenArchiveSummary = {
  entries: GoldenEntrySummary[];
  /** Parsed `META-INF/manifest.json`, when present and valid JSON. */
  manifest?: unknown;
  /** Merkle v1 root over non-META-INF members; null when there are none. */
  merkleRoot?: string | null;
};

export type CompareOptions = {
  /** Ignore DOS time/date in headers (writers may stamp pack time). */
  ignoreDosTime?: boolean;
  /** Treat local extra fields as an unordered set of `id,size,data` blocks. */
  ignoreLocalExtraOrder?: boolean;
  /** Ignore compressed size (different zstd/deflate encoders give different bytes). */
  ignoreCompressedSize?: boolean;
};

export type CompareResult = { ok: boolean; diffs: string[] };

function originFields(entry: ZipListEntry): OriginApiFields | undefined {
  const fields: OriginApiFields = {};
  if (entry.originUri !== undefined) fields.originUri = entry.originUri;
  if (entry.originCrc32 !== undefined) fields.originCrc32 = entry.originCrc32;
  if (entry.originSize !== undefined) fields.originSize = entry.originSize;
  if (entry.originMtime !== undefined) fields.originMtime = entry.originMtime;
  if (entry.originMtimeUtc !== undefined) {
    fields.originMtimeUtc = entry.originMtimeUtc;
  }
  if (entry.originSha256 !== undefined) fields.originSha256 = entry.originSha256;
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** Summarize an archive buffer into comparable, JSON-friendly data. */
export function summarizeArchive(buf: Buffer): GoldenArchiveSummary {
  const listed = listZipEntriesFromBuffer(buf);
  const leaves: { path: string; content: Buffer }[] = [];
  let manifest: unknown;

  const entries = listed.map((entry): GoldenEntrySummary => {
    const payload = readZipEntryPayload(buf, entry);
    leaves.push({ path: entry.name, content: payload });
    if (entry.name === MANIFEST_ENTRY) {
      try {
        manifest = JSON.parse(payload.toString("utf-8"));
      } catch {
        manifest = undefined;
      }
    }
    const origin = originFields(entry);
    return {
      name: entry.name,
      method: entry.method,
      crc32: entry.crc32 >>> 0,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      extraHex: entry.extra.toString("hex"),
      localExtraHex: readLocalExtraField(buf, entry).toString("hex"),
      dosTime: entry.dosTime,
      dosDate: entry.dosDate,
      payloadSha256: createHash("sha256").update(payload).digest("hex"),
      ...(origin ? { origin } : {}),
    };
  });

  return {
    entries,
    ...(manifest !== undefined ? { manifest } : {}),
    merkleRoot: computeArchiveMerkleRoot(leaves, "v1"),
  };
}

/** Split an extra-field blob into `id,size,data` blocks and sort them by id. */
function normalizeExtraOrder(hex: string): string {
  const buf = Buffer.from(hex, "hex");
  const blocks: string[] = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const size = buf.readUInt16LE(i + 2);
    const end = Math.min(buf.length, i + 4 + size);
    blocks.push(buf.subarray(i, end).toString("hex"));
    i = end;
  }
  if (i < buf.length) blocks.push(buf.subarray(i).toString("hex"));
  return blocks.sort().join("|");
}

function jsonEqual(a: unknown, b: unknown): boolean {
  try {
    deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Compare two archives semantically. `diffs` is empty when `ok`. */
export function compareArchives(
  actual: Buffer,
  expected: Buffer,
  opts: CompareOptions = {},
): CompareResult {
  const diffs: string[] = [];
  let a: GoldenArchiveSummary;
  let e: GoldenArchiveSummary;
  try {
    a = summarizeArchive(actual);
  } catch (err) {
    return { ok: false, diffs: [`actual: cannot read archive: ${String(err)}`] };
  }
  try {
    e = summarizeArchive(expected);
  } catch (err) {
    return { ok: false, diffs: [`expected: cannot read archive: ${String(err)}`] };
  }

  if (a.entries.length !== e.entries.length) {
    diffs.push(`entry count: actual ${a.entries.length}, expected ${e.entries.length}`);
  }
  const aNames = a.entries.map((x) => x.name);
  const eNames = e.entries.map((x) => x.name);
  if (!jsonEqual(aNames, eNames)) {
    diffs.push(
      `entry names/order: actual [${aNames.join(", ")}], expected [${eNames.join(", ")}]`,
    );
  }

  const count = Math.min(a.entries.length, e.entries.length);
  for (let i = 0; i < count; i++) {
    const x = a.entries[i]!;
    const y = e.entries[i]!;
    if (x.name !== y.name) continue; // already reported; field diffs would be noise
    const at = (field: string, av: unknown, ev: unknown) =>
      diffs.push(`${x.name}: ${field}: actual ${String(av)}, expected ${String(ev)}`);

    if (x.method !== y.method) at("method", x.method, y.method);
    if (x.crc32 !== y.crc32) at("crc32", hex32(x.crc32), hex32(y.crc32));
    if (x.uncompressedSize !== y.uncompressedSize) {
      at("uncompressedSize", x.uncompressedSize, y.uncompressedSize);
    }
    if (!opts.ignoreCompressedSize && x.compressedSize !== y.compressedSize) {
      at("compressedSize", x.compressedSize, y.compressedSize);
    }
    if (x.payloadSha256 !== y.payloadSha256) {
      at("payloadSha256", x.payloadSha256, y.payloadSha256);
    }
    if (x.extraHex !== y.extraHex) at("central extra", x.extraHex, y.extraHex);

    const localEqual = opts.ignoreLocalExtraOrder
      ? normalizeExtraOrder(x.localExtraHex) === normalizeExtraOrder(y.localExtraHex)
      : x.localExtraHex === y.localExtraHex;
    if (!localEqual) at("local extra", x.localExtraHex, y.localExtraHex);

    if (!jsonEqual(x.origin, y.origin)) {
      at("origin (0x014F)", JSON.stringify(x.origin), JSON.stringify(y.origin));
    }
    if (!opts.ignoreDosTime) {
      if (x.dosTime !== y.dosTime) at("dosTime", x.dosTime, y.dosTime);
      if (x.dosDate !== y.dosDate) at("dosDate", x.dosDate, y.dosDate);
    }
  }

  if (!jsonEqual(a.manifest, e.manifest)) {
    diffs.push(
      `manifest: actual ${JSON.stringify(a.manifest)}, expected ${JSON.stringify(e.manifest)}`,
    );
  }
  if (a.merkleRoot !== e.merkleRoot) {
    diffs.push(`merkleRoot: actual ${a.merkleRoot}, expected ${e.merkleRoot}`);
  }

  return { ok: diffs.length === 0, diffs };
}
