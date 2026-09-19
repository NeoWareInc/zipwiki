import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  resolveRepoPath,
  fail,
} from "../archive/index.js";

export { REPO_ROOT, resolveRepoPath, fail };

export const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".docm",
  ".dot",
  ".dotm",
  ".dotx",
  ".odt",
  ".ott",
  ".rtf",
  ".pages",
  ".ppt",
  ".pptx",
  ".pptm",
  ".pot",
  ".potm",
  ".potx",
  ".odp",
  ".otp",
  ".key",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".ods",
  ".ots",
  ".csv",
  ".tsv",
  ".numbers",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".webp",
  ".svg",
  ".txt",
  ".md",
  ".markdown",
  ".log",
]);

/**
 * Resolve a CLI `<file>` argument into a parser input. `-` means read the
 * document from stdin.
 */
export async function resolveInput(file: string): Promise<string | Buffer> {
  if (file !== "-") return file;

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length === 0) {
    throw new Error(
      "no data on stdin (input `-` expects a document piped in, e.g. `curl … | zipwiki parse-file -`)",
    );
  }
  return bytes;
}

/** Collect repeated `--ocr-server-header "Name: Value"` flags into an object. */
export function collectHeader(
  value: string,
  previous: Record<string, string> = {},
): Record<string, string> {
  const idx = value.indexOf(":");
  if (idx === -1) {
    throw new Error(`invalid header '${value}', expected 'Name: Value'`);
  }
  const name = value.slice(0, idx).trim();
  if (name === "") {
    throw new Error(`invalid header '${value}', empty header name`);
  }
  previous[name] = value.slice(idx + 1).trim();
  return previous;
}

export function parseTargetPages(targetPages?: string): number[] | undefined {
  if (!targetPages) return undefined;

  const pageNumbers: number[] = [];
  for (const part of targetPages.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const [start, end] = trimmed.split("-").map(Number);
      for (let i = start; i <= end; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(Number(trimmed));
    }
  }
  return pageNumbers;
}

export function collectFiles(
  dir: string,
  recursive = false,
  extFilter?: string,
): string[] {
  const files: string[] = [];
  collectFilesInner(dir, recursive, extFilter, files);
  files.sort();
  return files;
}

function collectFilesInner(
  dir: string,
  recursive: boolean,
  extFilter: string | undefined,
  files: string[],
): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) collectFilesInner(fullPath, recursive, extFilter, files);
      continue;
    }

    const lower = entry.name.toLowerCase();
    if (extFilter) {
      if (!lower.endsWith(extFilter)) continue;
    } else {
      const ext =
        lower.lastIndexOf(".") >= 0
          ? lower.slice(lower.lastIndexOf("."))
          : "";
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    }
    files.push(fullPath);
  }
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function extensionForFormat(format: string): string {
  if (format === "json") return ".json";
  if (format === "markdown") return ".md";
  return ".txt";
}
