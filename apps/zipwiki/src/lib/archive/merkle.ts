/**
 * Archive Merkle root — NeoZipKit APPNOTE §6.
 * v0 (legacy Bitcoin-style) and v1 (RFC 6962–style domain separation).
 * New packages use v1 via `computeArchiveMerkleRoot` / `getMerkleRootAsync`.
 * v0 remains for verifying an older archive.
 */

import {
  computeArchiveMerkleRoot,
  computeMerkleRootV0FromDigests,
  computeMerkleRootV1FromContents,
  computeMerkleRootV1FromLeaves,
  contentDigest,
  isMetaInfPath,
  leafHashV0,
  leafHashV1,
  matchMerkleRoot,
  merkleRootFromLeaves,
  normalizeMerklePath,
  parentHash,
  type MerkleAlgorithm,
  type MerkleContentEntry,
} from "neozipkit/node";

export {
  computeArchiveMerkleRoot,
  computeMerkleRootV0FromDigests,
  computeMerkleRootV1FromContents,
  computeMerkleRootV1FromLeaves,
  contentDigest,
  isMetaInfPath,
  leafHashV0,
  leafHashV1,
  matchMerkleRoot,
  merkleRootFromLeaves,
  normalizeMerklePath,
  parentHash,
};
export type { MerkleAlgorithm, MerkleContentEntry };

/**
 * Legacy leaf shape used by older tests/callers. Only sufficient for **v0**
 * (sha256 = bare content digest). Prefer `MerkleContentEntry` with `content`.
 */
export type MerkleLeaf = {
  path: string;
  /** Hex SHA-256 of uncompressed content bytes (= 0x014E). */
  sha256: string;
};

/**
 * Content merkle root for writers. Default algorithm is **v1**.
 * Accepts full entries or legacy `{ path, sha256 }` leaves (sha256 maps to
 * contentSha256 — only valid for `algorithm: "v0"`).
 * Empty usable leaf set throws.
 */
export function contentMerkleRoot(
  leaves: MerkleContentEntry[] | MerkleLeaf[],
  algorithm: MerkleAlgorithm = "v1",
): string {
  const entries: MerkleContentEntry[] = leaves.map((l) => {
    if ("sha256" in l && l.sha256 !== undefined && !("contentSha256" in l)) {
      return {
        path: l.path,
        contentSha256: l.sha256,
        content: (l as MerkleContentEntry).content,
        merkleLeafV1: (l as MerkleContentEntry).merkleLeafV1,
      };
    }
    return l as MerkleContentEntry;
  });

  const root = computeArchiveMerkleRoot(entries, algorithm);
  if (!root) {
    throw new Error("merkle root requires at least one content leaf");
  }
  return root;
}

/** @internal test helper — hex digest of a buffer (bare SHA-256). */
export function sha256HexBuffer(buf: Buffer): string {
  return contentDigest(buf).toString("hex");
}
