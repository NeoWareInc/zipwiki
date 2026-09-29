import {
  readZipEntryPayload,
  type ZipListEntry,
} from "./zip.js";

/** NeoZip Extra Field: SHA-256 of the uncompressed payload. */
const EF_NZIP_SHA256 = 0x014e;

export type IntegrityLine = {
  name: string;
  ok: boolean;
  /** OK, or Failed with a short reason. */
  status: string;
};

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function parseSha256FromExtra(extra: Uint8Array): string | null {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = view.getUint16(i, true);
    const size = view.getUint16(i + 2, true);
    i += 4;
    if (i + size > extra.length) break;
    if (id === EF_NZIP_SHA256 && size === 32) {
      return Array.from(extra.subarray(i, i + 32), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    }
    i += size;
  }
  return null;
}

function localExtra(buf: ArrayBuffer, entry: ZipListEntry): Uint8Array {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const local = entry.localHeaderOffset;
  if (view.getUint32(local, true) !== 0x04034b50) {
    throw new Error(`Invalid local header for ${entry.name}`);
  }
  const nameLen = u16(view, local + 26);
  const extraLen = u16(view, local + 28);
  const extraStart = local + 30 + nameLen;
  return bytes.subarray(extraStart, extraStart + extraLen);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

async function manifestSha256ByPath(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const manifest = entries.find((entry) => entry.name === "META-INF/manifest.json");
  if (!manifest) return found;
  try {
    const data = await readZipEntryPayload(buf, manifest);
    if (crc32(data) !== (manifest.crc32 >>> 0)) return found;
    const parsed = JSON.parse(new TextDecoder().decode(data)) as {
      content?: Array<{ path?: string; sha256?: string }>;
    };
    for (const item of parsed.content ?? []) {
      const hex = item.sha256?.trim().toLowerCase();
      if (item.path && hex && /^[0-9a-f]{64}$/.test(hex)) {
        found.set(item.path, hex);
      }
    }
  } catch {
    return found;
  }
  return found;
}

/**
 * Check every file in the archive. CRC-32 is always checked. SHA-256 is
 * checked when Extra Field 0x014E or the manifest stores a digest.
 */
export async function testArchiveIntegrity(
  buf: ArrayBuffer,
  entries: ZipListEntry[],
  onLine?: (line: IntegrityLine) => void,
): Promise<IntegrityLine[]> {
  const files = entries.filter((entry) => !entry.name.endsWith("/"));
  const shaByPath = await manifestSha256ByPath(buf, entries);
  const lines: IntegrityLine[] = [];
  for (const entry of files) {
    let line: IntegrityLine;
    try {
      const data = await readZipEntryPayload(buf, entry);
      const actualCrc = crc32(data);
      const expectedCrc = entry.crc32 >>> 0;
      if (actualCrc !== expectedCrc || data.byteLength !== entry.uncompressedSize) {
        line = { name: entry.name, ok: false, status: "Failed" };
      } else {
        const expectedSha =
          parseSha256FromExtra(localExtra(buf, entry)) ??
          shaByPath.get(entry.name) ??
          null;
        if (expectedSha) {
          const actualSha = await sha256Hex(data);
          const ok = actualSha === expectedSha;
          line = { name: entry.name, ok, status: ok ? "OK" : "Failed" };
        } else {
          line = { name: entry.name, ok: true, status: "OK" };
        }
      }
    } catch {
      line = { name: entry.name, ok: false, status: "Failed" };
    }
    lines.push(line);
    onLine?.(line);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return lines;
}

export function integritySummary(lines: IntegrityLine[]): string {
  const failed = lines.filter((line) => !line.ok).length;
  if (lines.length === 0) return "No files to test.";
  if (failed === 0) {
    return `No errors detected in ${lines.length} file${lines.length === 1 ? "" : "s"}.`;
  }
  return `${failed} of ${lines.length} file${lines.length === 1 ? "" : "s"} failed.`;
}
