/** Canonical .nzip paths (APPNOTE 0.2) — mirrored for browser use. */
export const BUNDLE_PATHS = {
  metaInf: "META-INF/",
  manifest: "META-INF/manifest.json",
  aiRoot: "wiki",
  parsed: "wiki/parsed/",
  okfRoot: "wiki/okf/",
  okfIndex: "wiki/okf/index.md",
} as const;

export type ZipListEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  originUri?: string;
  originCrc32?: string;
  originSize?: number;
  originMtime?: number;
  originMtimeUtc?: string;
  originSha256?: string;
};

export function zipMethodLabel(method: number): string {
  if (method === 0) return "Stored";
  if (method === 8) return "Deflate";
  if (method === 93) return "Zstd";
  return `Unk:${String(method).padStart(3, "0")}`;
}

const EF_NZIP_ORIGIN = 0x014f;

type OriginLocator = {
  uri?: string;
  crc32?: number;
  size?: number;
  mtime?: number;
  sha256?: string;
};

function originPresent(loc: OriginLocator): boolean {
  return (
    (typeof loc.uri === "string" && loc.uri.length > 0) ||
    loc.crc32 !== undefined ||
    loc.size !== undefined ||
    loc.mtime !== undefined ||
    loc.sha256 !== undefined
  );
}

function originCrc32Hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function originMtimeIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Keep in sync with apps/zipwiki/src/lib/archive/origin-extra.ts */
function originToApiFields(loc: OriginLocator | null): {
  originUri?: string;
  originCrc32?: string;
  originSize?: number;
  originMtime?: number;
  originMtimeUtc?: string;
  originSha256?: string;
} {
  if (!loc || !originPresent(loc)) return {};
  return {
    ...(loc.uri ? { originUri: loc.uri } : {}),
    ...(loc.crc32 !== undefined ? { originCrc32: originCrc32Hex(loc.crc32) } : {}),
    ...(loc.size !== undefined ? { originSize: loc.size } : {}),
    ...(loc.mtime !== undefined
      ? { originMtime: loc.mtime, originMtimeUtc: originMtimeIso(loc.mtime) }
      : {}),
    ...(loc.sha256 ? { originSha256: loc.sha256 } : {}),
  };
}

function parseOriginTlv(data: Uint8Array): OriginLocator | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const loc: OriginLocator = {};
  let i = 0;
  while (i + 3 <= data.length) {
    const tag = data[i]!;
    const len = view.getUint16(i + 1, true);
    i += 3;
    if (i + len > data.length) break;
    const value = data.subarray(i, i + len);
    const valueView = new DataView(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
    i += len;
    if (tag === 0x01 && len > 0) {
      const uri = new TextDecoder("utf-8").decode(value);
      if (uri.length > 0) loc.uri = uri;
    } else if (tag === 0x02 && len === 4) {
      loc.crc32 = valueView.getUint32(0, true);
    } else if (tag === 0x03 && len === 8) {
      loc.size = Number(valueView.getBigUint64(0, true));
    } else if (tag === 0x04 && len === 8) {
      loc.mtime = Number(valueView.getBigInt64(0, true));
    } else if (tag === 0x05 && len === 32) {
      loc.sha256 = Array.from(value, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    }
  }
  return originPresent(loc) ? loc : null;
}

/** Keep in sync with apps/zipwiki/src/lib/archive/origin-extra.ts */
function parseOriginFromExtra(extra: Uint8Array): OriginLocator | null {
  const view = new DataView(
    extra.buffer,
    extra.byteOffset,
    extra.byteLength,
  );
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = view.getUint16(i, true);
    const size = view.getUint16(i + 2, true);
    i += 4;
    if (i + size > extra.length) break;
    if (id === EF_NZIP_ORIGIN && size >= 1) {
      const version = extra[i]!;
      if (version === 0x01) {
        const loc = parseOriginTlv(extra.subarray(i + 1, i + size));
        if (loc) return loc;
      }
    }
    i += size;
  }
  return null;
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export function listZipEntriesFromBuffer(buf: ArrayBuffer): ZipListEntry[] {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const maxScan = Math.min(bytes.length, 65536 + 22);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxScan; i--) {
    if (i < 0) break;
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid ZIP / .nzip (EOCD not found)");

  const totalEntries = u16(view, eocd + 10);
  const centralOffset = u32(view, eocd + 16);
  const entries: ZipListEntry[] = [];
  let offset = centralOffset;
  const decoder = new TextDecoder("utf-8");

  for (let n = 0; n < totalEntries; n++) {
    if (u32(view, offset) !== 0x02014b50) {
      throw new Error(`Invalid central directory signature at ${offset}`);
    }
    const method = u16(view, offset + 10);
    const crc32 = u32(view, offset + 16);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLen = u16(view, offset + 28);
    const extraLen = u16(view, offset + 30);
    const commentLen = u16(view, offset + 32);
    const localHeaderOffset = u32(view, offset + 42);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
    const name = decoder.decode(nameBytes);
    const centralExtra = bytes.subarray(
      offset + 46 + nameLen,
      offset + 46 + nameLen + extraLen,
    );
    const origin = parseOriginFromExtra(centralExtra);
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      crc32,
      localHeaderOffset,
      ...originToApiFields(origin),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function readZipEntryPayload(
  buf: ArrayBuffer,
  entry: ZipListEntry,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const local = entry.localHeaderOffset;
  if (u32(view, local) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }
  const nameLen = u16(view, local + 26);
  const extraLen = u16(view, local + 28);
  const dataStart = local + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );

  if (entry.method === 0) {
    return compressed.slice();
  }
  if (entry.method === 8) {
    const { inflateSync } = await import("fflate");
    return inflateSync(compressed);
  }
  if (entry.method === 93) {
    const { decompress } = await import("fzstd");
    return decompress(compressed);
  }
  throw new Error(
    `Entry "${entry.name}" uses unsupported compression method ${entry.method}`,
  );
}

export async function readZipEntryText(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
  entryName: string,
  maxBytes = 256 * 1024,
): Promise<string> {
  const entry = entries.find((e) => e.name === entryName);
  if (!entry) throw new Error(`ZIP entry not found: ${entryName}`);
  const raw = await readZipEntryPayload(buf, entry);
  const slice = raw.byteLength > maxBytes ? raw.subarray(0, maxBytes) : raw;
  return new TextDecoder("utf-8").decode(slice);
}
