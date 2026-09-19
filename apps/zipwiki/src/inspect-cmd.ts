import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  formatZipListing,
  listZipEntries,
  readZipEntryVerified,
  useZipHandle,
  zipExtractLine,
} from "./lib/archive/index.js";
import { fail, resolveRepoPath } from "./lib/parse/index.js";

export type ListCommandOptions = {
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  short?: boolean;
  metadata?: boolean;
  format?: "text" | "json";
};

export function runListCommand(
  archive: string,
  opts: ListCommandOptions = {},
): void {
  const path = resolve(resolveRepoPath(archive));
  if (!existsSync(path)) fail(`Archive not found: ${path}`);
  useZipHandle(path, () => {
  const entries = listZipEntries(path);
  const filtered = opts.metadata
    ? entries.filter(
        (e) =>
          e.name.startsWith("META-INF/") ||
          e.name.startsWith("wiki/") ||
          e.name.startsWith("codex/"),
      )
    : entries;

  if (opts.format === "json" || opts.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (opts.short) {
    for (const e of filtered) console.log(e.name);
    return;
  }
  // Default / verbose: Info-ZIP / neolist table (Length / Method / Size / …).
  const cwdRel = relative(process.cwd(), path);
  const archivePath =
    cwdRel && !cwdRel.startsWith("..") && !cwdRel.startsWith("/")
      ? cwdRel
      : path;
  console.log(formatZipListing(filtered, { archivePath }));
  });
}

export type TestCommandOptions = {
  quiet?: boolean;
  verbose?: boolean;
};

export function runTestCommand(
  archive: string,
  opts: TestCommandOptions = {},
): void {
  const path = resolve(resolveRepoPath(archive));
  if (!existsSync(path)) fail(`Archive not found: ${path}`);
  useZipHandle(path, () => {
  const entries = listZipEntries(path).filter((e) => !e.name.endsWith("/"));
  const out = (line: string) => {
    if (!opts.quiet) console.log(line);
  };
  out(`Archive: ${path}`);
  let ok = 0;
  let failed = 0;
  for (const e of entries) {
    try {
      const { data, integrity } = readZipEntryVerified(path, e.name);
      if (data.length !== e.uncompressedSize) {
        throw new Error(
          `size mismatch: got ${data.length} expected ${e.uncompressedSize}`,
        );
      }
      ok += 1;
      const sha = integrity.sha256Ok === true ? " SHA-256" : "";
      out(`testing: ${e.name} ...OK${sha}`);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      out(`testing: ${e.name} ...FAILED ${msg}`);
      process.exitCode = 1;
    }
  }
  if (failed === 0) {
    out(`No errors detected in compressed data of ${ok} files`);
  } else {
    out(
      `At least ${failed} error(s) detected in compressed data of ${entries.length} files`,
    );
  }
  });
}

export type ExtractCommandOptions = {
  output?: string;
  exdir?: string;
  overwrite?: boolean;
  neverOverwrite?: boolean;
  junkPaths?: boolean;
  quiet?: boolean;
  verbose?: boolean;
};

export function runExtractCommand(
  archive: string,
  destArg: string | undefined,
  opts: ExtractCommandOptions = {},
): void {
  const path = resolve(resolveRepoPath(archive));
  if (!existsSync(path)) fail(`Archive not found: ${path}`);
  const dest = resolve(
    resolveRepoPath(opts.exdir || opts.output || destArg || "."),
  );
  mkdirSync(dest, { recursive: true });
  useZipHandle(path, () => {
  const entries = listZipEntries(path);
  const cwdRel = relative(process.cwd(), path);
  const archivePath =
    cwdRel && !cwdRel.startsWith("..") && !cwdRel.startsWith("/")
      ? cwdRel
      : path;
  const report = (line: string) => {
    if (!opts.quiet) console.log(line);
  };
  report(`Archive:  ${archivePath}`);
  let written = 0;
  for (const e of entries) {
    if (e.name.endsWith("/")) continue;
    const name = opts.junkPaths ? basename(e.name) : e.name;
    if (name.includes("..")) {
      fail(`Unsafe entry path rejected: ${e.name}`);
    }
    const outFile = join(dest, name);
    if (existsSync(outFile) && opts.neverOverwrite) {
      report(`  skipping: ${name}`);
      continue;
    }
    if (existsSync(outFile) && !opts.overwrite && !opts.neverOverwrite) {
      fail(`Refusing to overwrite ${outFile} (pass -o/--overwrite)`);
    }
    mkdirSync(dirname(outFile), { recursive: true });
    // Verified inflate — refuse write on CRC/SHA failure.
    const { data } = readZipEntryVerified(path, e.name);
    writeFileSync(outFile, data);
    written += 1;
    report(zipExtractLine(name, e.method));
  }
  if (opts.verbose && !opts.quiet) {
    console.log(`${written} files extracted`);
  }
  });
}
