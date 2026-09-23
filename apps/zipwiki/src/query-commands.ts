/**
 * Query commands on the zipwiki CLI: open, search, read, origin, extract.
 * The zipaccess library implements these; this module is the only shell surface.
 */
import type { Command } from "commander";
import { runExtractCommand } from "./inspect-cmd.js";
import {
  AccessError,
  buildCatalog,
  extractEntries,
  extractWithOrigin,
  fetchOrigin,
  formatCatalogText,
  formatReadStdout,
  formatSearchText,
  lookupOrigin,
  readEntry,
  readEntries,
  readManifest,
  readOkf,
  readParsed,
  searchPackage,
  type SearchHitWithHints,
} from "./lib/access/index.js";
import { resolveRepoPath } from "./lib/parse/index.js";

const QUERY = "Query";

function fail(err: unknown): never {
  if (err instanceof AccessError) {
    console.error(`zipwiki: ${err.message}`);
    process.exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`zipwiki: ${msg}`);
  process.exit(1);
}

function resolvePkg(pkg: string | undefined): string | undefined {
  return pkg ? resolveRepoPath(pkg) : pkg;
}

function splitPaths(values: string[]): string[] {
  return values
    .flatMap((p) => p.split(","))
    .map((p) => p.trim())
    .filter(Boolean);
}

export type ReadArgs =
  | {
      kind: "knowledge";
      packagePath?: string;
      okf?: string;
      parsed?: string;
      entry?: string;
    }
  | {
      kind: "entries";
      packagePath?: string;
      paths: string[];
    };

/** Accept `read <package> --okf` and `read -p <package> --path`. */
export function resolveReadArgs(input: {
  positional?: string[];
  package?: string;
  path?: string[];
  okf?: string;
  parsed?: string;
  entry?: string;
}): ReadArgs {
  const positional = splitPaths(input.positional ?? []);
  const flagPaths = splitPaths(input.path ?? []);
  const selectors = [input.okf, input.parsed, input.entry].filter(Boolean);
  if (selectors.length > 1) {
    throw new Error(
      "zipwiki read: provide exactly one of --okf, --parsed, or --entry",
    );
  }
  if (selectors.length === 1) {
    return {
      kind: "knowledge",
      packagePath: input.package ?? positional[0],
      okf: input.okf,
      parsed: input.parsed,
      entry: input.entry,
    };
  }
  return {
    kind: "entries",
    packagePath: input.package,
    paths: [...positional, ...flagPaths],
  };
}

export type OriginArgs = {
  packagePath?: string;
  selector?: string;
};

/** Accept `origin <package> --parsed` and `origin -p <package> --parsed`. */
export function resolveOriginArgs(input: {
  positional?: string;
  package?: string;
  parsed?: string;
  path?: string;
}): OriginArgs {
  const selectorFlag = input.path ?? input.parsed;
  if (input.package) {
    return {
      packagePath: input.package,
      selector: selectorFlag ?? input.positional,
    };
  }
  if (selectorFlag) {
    return { packagePath: input.positional, selector: selectorFlag };
  }
  return { packagePath: undefined, selector: input.positional };
}

function printCatalog(pkg: string | undefined, json: boolean | undefined): void {
  const catalog = buildCatalog(resolvePkg(pkg));
  if (json) {
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }
  process.stdout.write(formatCatalogText(catalog));
}

function collectPath(value: string, prev: string[]): string[] {
  return prev.concat(value);
}

export function registerQueryCommands(program: Command): void {
  program
    .command("open")
    .helpGroup(QUERY)
    .description(
      "Print a catalog of primaries (OKF title/type, parsed?, original?, next read hints)",
    )
    .argument("[package]", "Path to .zipwiki (default: wiki.zipwiki in cwd)")
    .option("-j, --json", "JSON output (full catalog object)")
    .action((pkg: string | undefined, opts: { json?: boolean }) => {
      try {
        printCatalog(pkg, opts.json);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("search")
    .helpGroup(QUERY)
    .description(
      "Search OKF cards first; fall back to parsed text when nothing matches",
    )
    .argument("<package>", "Path to .zipwiki")
    .argument("<query>", "Search query")
    .option("-j, --json", "JSON output")
    .option("--limit <n>", "Max hits", (v) => Number(v), 10)
    .action(
      (
        pkg: string,
        query: string,
        opts: { json?: boolean; limit?: number },
      ) => {
        try {
          const result = searchPackage({
            package: resolvePkg(pkg),
            query,
            limit: opts.limit,
          });
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          process.stdout.write(
            formatSearchText({
              package: result.package,
              query: result.query,
              hits: result.hits as SearchHitWithHints[],
            }),
          );
        } catch (err) {
          fail(err);
        }
      },
    );

  program
    .command("catalog")
    .helpGroup(QUERY)
    .description("Print a readable primary catalog (same as `zipwiki open`)")
    .argument("<archive>", "Path to .zipwiki")
    .option("-j, --json", "JSON output")
    .action((archive: string, opts: { json?: boolean }) => {
      try {
        printCatalog(archive, opts.json);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("read")
    .helpGroup(QUERY)
    .description(
      "Print OKF, parsed markdown, or entry bodies. `read <package> --okf|--parsed|--entry` or `read -p <package> --path <entry>`",
    )
    .argument("[paths...]", "Package path with --okf/--parsed/--entry, or entry paths")
    .option(
      "-p, --package <path>",
      "Path to .zipwiki (default: wiki.zipwiki in cwd)",
    )
    .option("--okf <stem>", "OKF concept stem (e.g. lease)")
    .option("--parsed <name>", "Parsed primary name (e.g. lease.txt)")
    .option("--entry <path>", "Any archive entry path")
    .option("--path <path>", "Entry path (repeatable)", collectPath, [] as string[])
    .option("--as-binary", "Force base64 encoding")
    .option(
      "--origin",
      "Print Extra Field 0x014F origin URI/CRC (JSON) to stderr",
    )
    .option(
      "--fetch-origin",
      "Download originUri and verify CRC-32 against the saved tag",
    )
    .option(
      "--origin-out <path>",
      "With --fetch-origin, write the original to this file or directory",
    )
    .option("--overwrite", "Overwrite origin dest if it already exists")
    .option("-j, --json", "JSON wrapper instead of raw body (with --okf/--parsed/--entry)")
    .action(
      async (
        positional: string[],
        opts: {
          package?: string;
          okf?: string;
          parsed?: string;
          entry?: string;
          path?: string[];
          asBinary?: boolean;
          origin?: boolean;
          fetchOrigin?: boolean;
          originOut?: string;
          overwrite?: boolean;
          json?: boolean;
        },
      ) => {
        try {
          const args = resolveReadArgs({
            positional,
            package: opts.package,
            path: opts.path,
            okf: opts.okf,
            parsed: opts.parsed,
            entry: opts.entry,
          });
          if (args.kind === "knowledge") {
            await readKnowledge(args, opts);
            return;
          }
          await readEntryPaths(args, opts);
        } catch (err) {
          fail(err);
        }
      },
    );

  program
    .command("read-manifest")
    .helpGroup(QUERY)
    .description("Inflate META-INF/manifest.json to stdout (raw JSON, no wrappers)")
    .option(
      "-p, --package <path>",
      "Path to .zipwiki (default: wiki.zipwiki in cwd)",
    )
    .action((opts: { package?: string }) => {
      try {
        const result = readManifest({
          package: resolvePkg(opts.package),
        });
        if (result.truncated) {
          console.error(
            `zipwiki: truncated ${result.path} (${result.totalBytes} bytes)`,
          );
        }
        process.stdout.write(formatReadStdout([result]));
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("origin")
    .helpGroup(QUERY)
    .description(
      "Show Extra Field 0x014F origin URI; optionally download and verify CRC-32",
    )
    .argument(
      "[package-or-selector]",
      "Package path when --parsed/--path is set; otherwise a parsed or primary path",
    )
    .option(
      "-p, --package <path>",
      "Path to .zipwiki (default: wiki.zipwiki in cwd)",
    )
    .option("--parsed <name>", "Parsed primary name")
    .option("--path <entry>", "Parsed or primary entry path")
    .option("--fetch", "Download originUri and verify CRC-32")
    .option("-o, --output <path>", "Write downloaded original here")
    .option("--overwrite", "Overwrite dest if it already exists")
    .action(
      async (
        positional: string | undefined,
        opts: {
          package?: string;
          parsed?: string;
          path?: string;
          fetch?: boolean;
          output?: string;
          overwrite?: boolean;
        },
      ) => {
        try {
          const args = resolveOriginArgs({
            positional,
            package: opts.package,
            parsed: opts.parsed,
            path: opts.path,
          });
          if (!args.selector) {
            console.error(
              "zipwiki origin: provide a parsed/primary path or --parsed/--path",
            );
            process.exit(1);
          }
          const pkg = resolvePkg(args.packagePath);
          if (opts.fetch || opts.output) {
            const fetched = await fetchOrigin({
              package: pkg,
              path: args.selector,
              dest: opts.output ? resolveRepoPath(opts.output) : undefined,
              write: Boolean(opts.output),
              overwrite: opts.overwrite === true,
            });
            console.log(JSON.stringify(fetched, null, 2));
            return;
          }
          console.log(
            JSON.stringify(
              lookupOrigin({ package: pkg, path: args.selector }),
              null,
              2,
            ),
          );
        } catch (err) {
          fail(err);
        }
      },
    );

  program
    .command("extract")
    .helpGroup(QUERY)
    .description(
      "Extract archive (overwrite-or-refuse). --path / --fetch-origin write a verified subset and print JSON",
    )
    .argument("<archive>", "Path to archive")
    .argument("[dest]", "Destination directory", ".")
    .option("-o, --overwrite", "Overwrite existing files")
    .option("-n, --never", "Never overwrite")
    .option("-d, --exdir <dir>", "Extract directory")
    .option("-j, --junk-paths", "Flatten paths")
    .option("-v, --verbose", "Verbose")
    .option("-q, --quiet", "Quiet")
    .option("--path <entry>", "Extract one entry path (repeatable)", collectPath, [] as string[])
    .option(
      "--fetch-origin",
      "Also download Extra Field 0x014F originals and verify CRC-32",
    )
    .action(
      async (
        archive: string,
        dest: string | undefined,
        opts: {
          overwrite?: boolean;
          never?: boolean;
          exdir?: string;
          junkPaths?: boolean;
          verbose?: boolean;
          quiet?: boolean;
          path?: string[];
          fetchOrigin?: boolean;
        },
      ) => {
        try {
          const paths = opts.path ?? [];
          if (opts.fetchOrigin === true || paths.length > 0) {
            await extractQuerySubset(archive, dest, {
              paths,
              fetchOrigin: opts.fetchOrigin === true,
              overwrite: opts.overwrite === true,
            });
            return;
          }
          runExtractCommand(archive, dest, {
            overwrite: opts.overwrite === true,
            neverOverwrite: opts.never === true,
            exdir: opts.exdir,
            junkPaths: opts.junkPaths === true,
            verbose: opts.verbose === true,
            quiet: opts.quiet === true,
          });
        } catch (err) {
          fail(err);
        }
      },
    );
}

async function readKnowledge(
  args: Extract<ReadArgs, { kind: "knowledge" }>,
  opts: {
    origin?: boolean;
    fetchOrigin?: boolean;
    originOut?: string;
    overwrite?: boolean;
    json?: boolean;
  },
): Promise<void> {
  const packagePath = resolvePkg(args.packagePath);
  const result = args.okf
    ? readOkf({ package: packagePath, stem: args.okf })
    : args.parsed
      ? readParsed({ package: packagePath, name: args.parsed })
      : readEntry({ package: packagePath!, path: args.entry! });
  const selector = args.parsed ?? args.entry ?? result.path;
  if (opts.fetchOrigin) {
    const fetched = await fetchOrigin({
      package: packagePath,
      path: selector ?? undefined,
      dest: opts.originOut ? resolveRepoPath(opts.originOut) : undefined,
      write: Boolean(opts.originOut),
      overwrite: opts.overwrite === true,
    });
    console.error(JSON.stringify(fetched, null, 2));
  } else if (opts.origin) {
    const loc =
      result.origin ??
      lookupOrigin({ package: packagePath, path: selector ?? undefined });
    console.error(JSON.stringify(loc, null, 2));
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.truncated) {
    console.error(
      `zipwiki: truncated ${result.path} (${result.totalBytes} bytes)`,
    );
  }
  process.stdout.write(formatReadStdout([result]));
  const body = result.encoding === "base64" ? result.data : result.text;
  if (!body?.endsWith("\n")) {
    process.stdout.write("\n");
  }
}

async function readEntryPaths(
  args: Extract<ReadArgs, { kind: "entries" }>,
  opts: {
    asBinary?: boolean;
    origin?: boolean;
    fetchOrigin?: boolean;
    originOut?: string;
    overwrite?: boolean;
  },
): Promise<void> {
  const pkg = resolvePkg(args.packagePath);
  const results = readEntries({
    package: pkg,
    paths: args.paths,
    asBinary: opts.asBinary === true,
  });
  for (const r of results) {
    if (r.truncated) {
      console.error(`zipwiki: truncated ${r.path} (${r.totalBytes} bytes)`);
    }
    const selector = r.path ?? undefined;
    if (opts.fetchOrigin && selector) {
      try {
        const fetched = await fetchOrigin({
          package: pkg,
          path: selector,
          dest: opts.originOut ? resolveRepoPath(opts.originOut) : undefined,
          write: Boolean(opts.originOut),
          overwrite: opts.overwrite === true,
        });
        console.error(JSON.stringify(fetched, null, 2));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`zipwiki: origin fetch failed for ${selector}: ${msg}`);
        if (err instanceof AccessError && err.code === "integrity_failed") {
          process.exitCode = 1;
        }
      }
    } else if (opts.origin && selector) {
      try {
        const loc = r.origin ?? lookupOrigin({ package: pkg, path: selector });
        console.error(JSON.stringify(loc, null, 2));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`zipwiki: origin lookup failed for ${selector}: ${msg}`);
      }
    }
  }
  process.stdout.write(formatReadStdout(results));
}

async function extractQuerySubset(
  archive: string,
  dest: string | undefined,
  opts: { paths: string[]; fetchOrigin: boolean; overwrite: boolean },
): Promise<void> {
  const destPath = dest && dest !== "." ? resolveRepoPath(dest) : dest;
  const packagePath = resolvePkg(archive);
  const entryPaths = opts.paths.length > 0 ? opts.paths : undefined;
  if (opts.fetchOrigin) {
    const result = await extractWithOrigin({
      package: packagePath,
      dest: destPath === "." ? undefined : destPath,
      paths: entryPaths,
      fetchOrigin: true,
      overwrite: opts.overwrite,
    });
    console.log(
      JSON.stringify(
        {
          package: result.package,
          dest: result.dest,
          files: result.extracted.map((f) => f.path),
          origins: result.origins.map((o) => ({
            primaryPath: o.primaryPath,
            originUri: o.originUri,
            path: o.path,
            crc32: o.crc32,
            verified: o.verified,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const result = extractEntries({
    package: packagePath,
    dest: destPath === "." ? undefined : destPath,
    paths: entryPaths,
    overwrite: opts.overwrite,
  });
  console.log(
    JSON.stringify(
      {
        package: result.package,
        dest: result.dest,
        files: result.extracted.map((f) => f.path),
      },
      null,
      2,
    ),
  );
}
