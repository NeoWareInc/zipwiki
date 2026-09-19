/**
 * Archive Merkle root — NEOZIP_APPNOTE §7 / NeoZipKit APPNOTE §6.
 * v0 (legacy Bitcoin-style) and v1 (RFC 6962–style domain separation).
 * New packages MUST use v1.
 */

import { createHash } from "node:crypto";

/** Merkle algorithms defined in NEOZIP_APPNOTE.md §7. */
export type MerkleAlgorithm = "v0" | "v1";

export type MerkleContentEntry = {
  /** Central-directory path (UTF-8 string as stored or as known to the writer). */
  path: string;
  /**
   * Uncompressed payload bytes (same bytes hashed into Extra Field 0x014E).
   * Required for **v1** leaves when `merkleLeafV1` is absent. Optional for **v0** when `contentSha256` is set.
   */
  content?: Buffer | Uint8Array;
  /**
   * Bare SHA-256 of uncompressed payload (= Extra Field 0x014E), hex or 32-byte Buffer.
   * Used as v0 leaf; for v1 this alone is **not** a leaf (§7.4).
   */
  contentSha256?: string | Buffer;
  /**
   * Precomputed §7.4 v1 leaf: SHA-256(0x00 ‖ uncompressed_bytes), hex or 32-byte Buffer.
   */
  merkleLeafV1?: string | Buffer;
};

/**
 * Legacy leaf shape used by older tests/callers. Only sufficient for **v0**
 * (sha256 = bare content digest). Prefer `MerkleContentEntry` with `content`.
 */
export type MerkleLeaf = {
  path: string;
  /** Hex SHA-256 of uncompressed content bytes (= 0x014E). */
  sha256: string;
};

const LEAF_DOMAIN = Buffer.from([0x00]);
const NODE_DOMAIN = Buffer.from([0x01]);

function sha256Parts(parts: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update(part);
  }
  return h.digest();
}

function asBuffer(
  data: Buffer | Uint8Array | string,
  encoding?: BufferEncoding,
): Buffer {
  if (typeof data === "string") {
    return Buffer.from(data, encoding ?? "hex");
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/** True when path is under META-INF/ (ASCII case-insensitive). */
export function isMetaInfPath(filename: string): boolean {
  return filename.toLowerCase().startsWith("meta-inf/");
}

/**
 * Normalize a ZIP entry path for v1 leaf ordering (APPNOTE §7.4):
 * POSIX separators, strip leading `./` and `/`, Unicode NFC.
 */
export function normalizeMerklePath(path: string): string {
  let p = path.replace(/\\/g, "/");
  if (p.startsWith("./")) {
    p = p.slice(2);
  }
  while (p.startsWith("/")) {
    p = p.slice(1);
  }
  if (typeof p.normalize === "function") {
    p = p.normalize("NFC");
  }
  return p;
}

function pathSortKey(path: string, algorithm: MerkleAlgorithm): Buffer {
  const normalized = algorithm === "v1" ? normalizeMerklePath(path) : path;
  return Buffer.from(normalized, "utf8");
}

/** Bare content digest (= 0x014E value). */
export function contentDigest(content: Buffer | Uint8Array): Buffer {
  return createHash("sha256").update(asBuffer(content)).digest();
}

/** v0 leaf: SHA-256(uncompressed bytes) — same as Extra Field 0x014E. */
export function leafHashV0(
  contentOrDigest: Buffer | Uint8Array,
  isDigest = false,
): Buffer {
  const buf = asBuffer(contentOrDigest);
  return isDigest ? buf : contentDigest(buf);
}

/** v1 leaf: SHA-256(0x00 ‖ uncompressed_bytes). */
export function leafHashV1(content: Buffer | Uint8Array): Buffer {
  return sha256Parts([LEAF_DOMAIN, asBuffer(content)]);
}

/**
 * Parent node hashes.
 * v0: SHA-256(H_left ‖ H_right)
 * v1: SHA-256(0x01 ‖ H_left ‖ H_right)
 */
export function parentHash(
  left: Buffer,
  right: Buffer,
  algorithm: MerkleAlgorithm,
): Buffer {
  if (algorithm === "v1") {
    return sha256Parts([NODE_DOMAIN, left, right]);
  }
  return sha256Parts([left, right]);
}

/**
 * Fold an ordered list of leaf hashes into a single root (hex lowercase).
 * Odd-count rule:
 *  - v0: duplicate last leaf (Bitcoin-style)
 *  - v1: promote last node unhashed (RFC 6962–style)
 */
export function merkleRootFromLeaves(
  leaves: Buffer[],
  algorithm: MerkleAlgorithm,
): string | null {
  if (leaves.length === 0) {
    return null;
  }

  let level: Buffer[] = leaves.map((l) => Buffer.from(l));

  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      next.push(parentHash(level[i]!, level[i + 1]!, algorithm));
    }
    if (level.length % 2 === 1) {
      const last = level[level.length - 1]!;
      if (algorithm === "v0") {
        next.push(parentHash(last, last, algorithm));
      } else {
        next.push(last);
      }
    }
    level = next;
  }

  return level[0]!.toString("hex");
}

function resolveLeaf(
  entry: MerkleContentEntry,
  algorithm: MerkleAlgorithm,
): Buffer | null {
  if (algorithm === "v0") {
    if (entry.contentSha256) {
      const d = asBuffer(
        entry.contentSha256,
        typeof entry.contentSha256 === "string" ? "hex" : undefined,
      );
      if (d.length !== 32) {
        return null;
      }
      return d;
    }
    if (entry.content) {
      return contentDigest(entry.content);
    }
    return null;
  }

  if (entry.merkleLeafV1) {
    const d = asBuffer(
      entry.merkleLeafV1,
      typeof entry.merkleLeafV1 === "string" ? "hex" : undefined,
    );
    if (d.length !== 32) {
      return null;
    }
    return d;
  }
  if (entry.content) {
    return leafHashV1(entry.content);
  }
  return null;
}

/**
 * Compute archive Merkle root from content entries.
 * Skips `META-INF/**` paths (ASCII case-insensitive).
 *
 * @returns lowercase hex root, or null if no usable leaves
 */
export function computeArchiveMerkleRoot(
  entries: MerkleContentEntry[],
  algorithm: MerkleAlgorithm = "v1",
): string | null {
  const prepared: { key: Buffer; leaf: Buffer }[] = [];

  for (const entry of entries) {
    if (isMetaInfPath(entry.path || "")) {
      continue;
    }
    const leaf = resolveLeaf(entry, algorithm);
    if (!leaf) {
      continue;
    }
    prepared.push({
      key: pathSortKey(entry.path || "", algorithm),
      leaf,
    });
  }

  if (prepared.length === 0) {
    return null;
  }

  prepared.sort((a, b) => Buffer.compare(a.key, b.key));
  return merkleRootFromLeaves(
    prepared.map((p) => p.leaf),
    algorithm,
  );
}

export function computeMerkleRootV0FromDigests(
  entries: Array<{ path: string; sha256: string | Buffer }>,
): string | null {
  return computeArchiveMerkleRoot(
    entries.map((e) => ({ path: e.path, contentSha256: e.sha256 })),
    "v0",
  );
}

export function computeMerkleRootV1FromContents(
  entries: Array<{ path: string; content: Buffer | Uint8Array }>,
): string | null {
  return computeArchiveMerkleRoot(
    entries.map((e) => ({ path: e.path, content: e.content })),
    "v1",
  );
}

export function computeMerkleRootV1FromLeaves(
  entries: Array<{ path: string; merkleLeafV1: string | Buffer }>,
): string | null {
  return computeArchiveMerkleRoot(
    entries.map((e) => ({ path: e.path, merkleLeafV1: e.merkleLeafV1 })),
    "v1",
  );
}

/**
 * Verify a declared root (§7.5): try v1 first when material allows, then v0.
 */
export function matchMerkleRoot(
  entries: MerkleContentEntry[],
  declaredRoot: string,
): { algorithm: MerkleAlgorithm; security: "high" | "legacy" } | null {
  const expected = declaredRoot.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return null;
  }

  const hasV1Material = entries.some(
    (e) =>
      !isMetaInfPath(e.path || "") &&
      (!!e.merkleLeafV1 || !!e.content),
  );
  if (hasV1Material) {
    const v1 = computeArchiveMerkleRoot(entries, "v1");
    if (v1 && v1 === expected) {
      return { algorithm: "v1", security: "high" };
    }
  }

  const v0 = computeArchiveMerkleRoot(entries, "v0");
  if (v0 && v0 === expected) {
    return { algorithm: "v0", security: "legacy" };
  }

  return null;
}

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
