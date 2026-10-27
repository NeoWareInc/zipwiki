import { crc32 } from "neozipkit/browser";
import type { ZipReaderBrowser } from "neozipkit/browser";
import { BUNDLE_PATHS, listZipEntries } from "./zip";

export type IntegrityLine = {
  name: string;
  ok: boolean;
  /** OK, or Failed with a short reason. */
  status: string;
};

export function payloadCrcMatches(data: Uint8Array, expected: number): boolean {
  return (
    (crc32(data as Parameters<typeof crc32>[0]) >>> 0) === (expected >>> 0)
  );
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** `content[].sha256` digests recorded in the manifest, keyed by path. */
async function manifestSha256ByPath(
  reader: ZipReaderBrowser,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!reader.getEntry(BUNDLE_PATHS.manifest)) return found;
  try {
    const data = await reader.readEntry(BUNDLE_PATHS.manifest);
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
 * Check every file in the archive. The kit reader checks size and CRC-32 and
 * any Extra Field 0x014E SHA-256; manifest `content[].sha256` is checked here.
 */
export async function testArchiveIntegrity(
  reader: ZipReaderBrowser,
  onLine?: (line: IntegrityLine) => void,
): Promise<IntegrityLine[]> {
  const files = listZipEntries(reader).filter(
    (entry) => !entry.name.endsWith("/"),
  );
  const shaByPath = await manifestSha256ByPath(reader);
  const lines: IntegrityLine[] = [];
  for (const entry of files) {
    let line: IntegrityLine;
    try {
      const data = await reader.readEntry(entry.name);
      const expectedSha = shaByPath.get(entry.name);
      if (expectedSha) {
        const ok = (await sha256Hex(data)) === expectedSha;
        line = { name: entry.name, ok, status: ok ? "OK" : "Failed" };
      } else {
        line = { name: entry.name, ok: true, status: "OK" };
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
