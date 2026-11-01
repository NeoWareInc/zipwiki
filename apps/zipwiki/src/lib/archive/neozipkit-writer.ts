/**
 * Adapter: ZipWiki zip members → NeoZipKit `buildZipBufferSync`.
 *
 * ZipWiki keeps pack policy (store suffixes, method/level resolution, member
 * order, origin split). Framing, CRC-32, Extra Fields 0x014E / 0x014F, DOS
 * time, and the optional archive Merkle root come from the kit.
 */

import {
  buildZipBufferSync,
  makeOriginExtra,
  originLocatorPresent,
  type MerkleAlgorithm,
  type ZipBufferMember,
} from "neozipkit/node";
import {
  resolveZipMemberCompression,
  type CompressOptions,
} from "./compress.js";
import type { ZipArchiveEntry } from "./nzip.js";

export type WriteZipOptions = CompressOptions & {
  /** Write Extra Field 0x014E on newly compressed members. Default false. */
  sha256Extra?: boolean;
};

/** Map one ZipWiki member onto a kit {@link ZipBufferMember}. */
export function toKitMember(
  entry: ZipArchiveEntry,
  opts: WriteZipOptions = {},
): ZipBufferMember {
  const copied = entry.precompressed;
  if (copied) {
    return {
      name: entry.name,
      data: entry.data,
      dosTime: copied.dosTime,
      dosDate: copied.dosDate,
      precompressed: {
        method: copied.method,
        data: copied.data,
        crc32: copied.crc32,
        uncompressedSize: copied.uncompressedSize,
        extra: copied.extra,
      },
    };
  }
  const { method, level } = resolveZipMemberCompression({
    ...opts,
    entryName: entry.name,
  });
  return {
    name: entry.name,
    data: entry.data,
    ...(entry.mtime ? { mtime: entry.mtime } : {}),
    method,
    level,
    ...(opts.sha256Extra === true ? { useSHA256: true } : {}),
    ...(originLocatorPresent(entry.origin)
      ? { additionalExtra: makeOriginExtra(entry.origin) }
      : {}),
  };
}

/** Build a ZIP buffer through NeoZipKit. */
export function buildZipWithKit(
  entries: ZipArchiveEntry[],
  opts: WriteZipOptions = {},
): Buffer {
  return buildZipBufferSync(entries.map((e) => toKitMember(e, opts)));
}

/**
 * Build a ZIP and the archive Merkle root (META-INF excluded) in one pass.
 * `merkleRoot` is null when there are no content members.
 */
export function buildZipWithKitMerkle(
  entries: ZipArchiveEntry[],
  opts: WriteZipOptions = {},
  algorithm: MerkleAlgorithm = "v1",
): { buffer: Buffer; merkleRoot: string | null } {
  return buildZipBufferSync(
    entries.map((e) => toKitMember(e, opts)),
    { computeMerkle: algorithm },
  );
}
