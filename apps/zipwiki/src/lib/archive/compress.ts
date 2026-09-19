/**
 * ZIP entry compression helpers (store / deflate / zstd).
 * Method numbers follow APPNOTE / NeoZip: 0 store, 8 deflate, 93 zstd.
 */

import { constants as zlibConstants, deflateRawSync, zstdCompressSync } from "node:zlib";

/** APPNOTE compression method numbers. */
export const ZIP_METHOD_STORE = 0 as const;
export const ZIP_METHOD_DEFLATE = 8 as const;
export const ZIP_METHOD_ZSTD = 93 as const;

export type ZipCompressionAlg = "zstd" | "deflate" | "store";

export type CompressOptions = {
  /** Preferred algorithm when level > 0. Default zstd. */
  compression?: ZipCompressionAlg;
  /** 0–9; 0 forces store. Default 6. */
  level?: number;
  /** Force deflate (Info-ZIP compat). */
  deflate?: boolean;
  /** Force deflate/store; never zstd. */
  legacy?: boolean;
  /** Basename suffixes that must be stored (e.g. `.pdf`). */
  storeSuffixes?: string[];
  /** Entry path used for suffix matching. */
  entryName?: string;
};

export type CompressedPayload = {
  method: number;
  data: Buffer;
  uncompressedSize: number;
  compressedSize: number;
};

const DEFAULT_STORE_SUFFIXES = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".zip",
  ".zipwiki",
  ".nzip",
  ".gz",
  ".zst",
];

function normalizeSuffixes(list: string[] | undefined): string[] {
  const src = list?.length ? list : DEFAULT_STORE_SUFFIXES;
  return src.map((s) => {
    const t = s.trim().toLowerCase();
    return t.startsWith(".") ? t : `.${t}`;
  });
}

export function shouldStoreBySuffix(
  entryName: string | undefined,
  suffixes: string[] | undefined,
): boolean {
  if (!entryName) return false;
  const lower = entryName.replace(/\\/g, "/").toLowerCase();
  const base = lower.includes("/") ? lower.slice(lower.lastIndexOf("/") + 1) : lower;
  for (const suf of normalizeSuffixes(suffixes)) {
    if (base.endsWith(suf)) return true;
  }
  return false;
}

/** Resolve algorithm after applying level / legacy / deflate / suffixes. */
export function resolveCompressionAlg(
  opts: CompressOptions = {},
): ZipCompressionAlg {
  const level = opts.level ?? 7;
  if (level <= 0 || opts.compression === "store") return "store";
  if (shouldStoreBySuffix(opts.entryName, opts.storeSuffixes)) return "store";
  if (opts.legacy || opts.deflate || opts.compression === "deflate") {
    return "deflate";
  }
  return opts.compression ?? "zstd";
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 7;
  return Math.max(0, Math.min(9, Math.trunc(level)));
}

/**
 * Compress uncompressed payload for a ZIP local/central entry.
 * SHA-256 Extra Field must still hash the *uncompressed* bytes.
 */
export function compressZipPayload(
  uncompressed: Buffer,
  opts: CompressOptions = {},
): CompressedPayload {
  const level = clampLevel(opts.level ?? 7);
  const alg = resolveCompressionAlg({ ...opts, level });
  const uncompressedSize = uncompressed.length;

  if (alg === "store" || uncompressedSize === 0) {
    return {
      method: ZIP_METHOD_STORE,
      data: uncompressed,
      uncompressedSize,
      compressedSize: uncompressedSize,
    };
  }

  let compressed: Buffer;
  let method: number;

  if (alg === "deflate") {
    method = ZIP_METHOD_DEFLATE;
    // ZIP uses raw DEFLATE (no zlib wrapper).
    compressed = deflateRawSync(uncompressed, { level: Math.max(1, level) });
  } else {
    method = ZIP_METHOD_ZSTD;
    compressed = zstdCompressSync(uncompressed, {
      params: {
        [zlibConstants.ZSTD_c_compressionLevel]: Math.max(1, level),
      },
    });
  }

  // If compression grew the payload, store instead.
  if (compressed.length >= uncompressedSize) {
    return {
      method: ZIP_METHOD_STORE,
      data: uncompressed,
      uncompressedSize,
      compressedSize: uncompressedSize,
    };
  }

  return {
    method,
    data: compressed,
    uncompressedSize,
    compressedSize: compressed.length,
  };
}
