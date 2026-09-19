#!/usr/bin/env node
/**
 * zipaccess — query CLI for local `.zipwiki` packages (catalog / search / read).
 */
import { Command } from "commander";
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
  readOkf,
  readParsed,
  searchPackage,
  type SearchHitWithHints,
} from "./lib/access/index.js";
import { resolveRepoPath } from "./lib/parse/index.js";

const program = new Command();
program
  .name("zipaccess")
  .description(
    "Open, search, and read a local .zipwiki knowledge package (pretty text; --json for machine output)",
  )
  .version("0.1.0");

function fail(err: unknown): never {
  if (err instanceof AccessError) {
    console.error(`zipaccess: ${err.message}`);
    process.exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`zipaccess: ${msg}`);
  process.exit(1);
}

function resolvePkg(pkg: string | undefined): string | undefined {
  return pkg ? resolveRepoPath(pkg) : pkg;
}

program
  .command("open")
  .description(
    "Print a catalog of primaries (OKF title/type, parsed?, original?, next read hints)",
  )
  .argument("[package]", "Path to .zipwiki (default: wiki.zipwiki in cwd)")
  .option("-j, --json", "JSON output (full catalog object)")
  .action((pkg: string | undefined, opts: { json?: boolean }) => {
    try {
      const catalog = buildCatalog(resolvePkg(pkg));
      if (opts.json) {
        console.log(JSON.stringify(catalog, null, 2));
        return;
      }
      process.stdout.write(formatCatalogText(catalog));
    } catch (err) {
      fail(err);
    }
  });

program
  .command("search")
  .description("Search OKF / parsed text; show snippets and read hints")
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
  .command("read")
  .description("Print OKF, parsed markdown, or an entry body to stdout")
  .argument("<package>", "Path to .zipwiki")
  .option("--okf <stem>", "OKF concept stem (e.g. lease)")
  .option("--parsed <name>", "Parsed primary name (e.g. lease.txt)")
  .option("--entry <path>", "Any archive entry path")
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
  .option("-j, --json", "JSON wrapper instead of raw body")
  .action(
    async (
      pkg: string,
      opts: {
        okf?: string;
        parsed?: string;
        entry?: string;
        origin?: boolean;
        fetchOrigin?: boolean;
        originOut?: string;
        json?: boolean;
        overwrite?: boolean;
      },
    ) => {
      try {
        const packagePath = resolvePkg(pkg);
        const modes = [opts.okf, opts.parsed, opts.entry].filter(Boolean);
        if (modes.length !== 1) {
          console.error(
            "zipaccess read: provide exactly one of --okf, --parsed, or --entry",
          );
          process.exit(1);
        }
        const result = opts.okf
          ? readOkf({ package: packagePath, stem: opts.okf })
          : opts.parsed
            ? readParsed({ package: packagePath, name: opts.parsed })
            : readEntry({ package: packagePath!, path: opts.entry! });
        const selector = opts.parsed ?? opts.entry ?? result.path;
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
            `zipaccess: truncated ${result.path} (${result.totalBytes} bytes)`,
          );
        }
        process.stdout.write(formatReadStdout([result]));
        if (!(result.encoding === "base64" ? result.data : result.text)?.endsWith("\n")) {
          process.stdout.write("\n");
        }
      } catch (err) {
        fail(err);
      }
    },
  );

program
  .command("extract")
  .description("Verified extract to disk (CRC + SHA-256 when present)")
  .argument("<package>", "Path to .zipwiki")
  .argument("[dest]", "Destination directory")
  .option(
    "--path <entry>",
    "Extract one entry path (repeatable)",
    (v, acc: string[]) => {
      acc.push(v);
      return acc;
    },
    [] as string[],
  )
  .option(
    "--fetch-origin",
    "Also download Extra Field 0x014F originals and verify CRC-32",
  )
  .option("--overwrite", "Overwrite existing extract/origin files")
  .action(
    async (
      pkg: string,
      dest: string | undefined,
      opts: { path?: string[]; fetchOrigin?: boolean; overwrite?: boolean },
    ) => {
      try {
        const destPath = dest ? resolveRepoPath(dest) : dest;
        if (opts.fetchOrigin) {
          const result = await extractWithOrigin({
            package: resolvePkg(pkg),
            dest: destPath,
            paths: opts.path && opts.path.length > 0 ? opts.path : undefined,
            fetchOrigin: true,
            overwrite: opts.overwrite === true,
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
          package: resolvePkg(pkg),
          dest: destPath,
          paths: opts.path && opts.path.length > 0 ? opts.path : undefined,
          overwrite: opts.overwrite === true,
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
      } catch (err) {
        fail(err);
      }
    },
  );

program
  .command("origin")
  .description(
    "Show Extra Field 0x014F origin URI; optionally download and verify CRC-32",
  )
  .argument("<package>", "Path to .zipwiki")
  .option("--parsed <name>", "Parsed primary name or wiki/parsed/… path")
  .option("--path <entry>", "Parsed or primary entry path")
  .option("--fetch", "Download originUri and verify CRC-32")
  .option("-o, --output <path>", "Write downloaded original here")
  .option("--overwrite", "Overwrite dest if it already exists")
  .option("-j, --json", "JSON output (default)")
  .action(
    async (
      pkg: string,
      opts: {
        parsed?: string;
        path?: string;
        fetch?: boolean;
        output?: string;
        json?: boolean;
        overwrite?: boolean;
      },
    ) => {
      try {
        const selector = opts.path ?? opts.parsed;
        if (!selector) {
          console.error("zipaccess origin: provide --parsed or --path");
          process.exit(1);
        }
        const packagePath = resolvePkg(pkg);
        if (opts.fetch || opts.output) {
          const fetched = await fetchOrigin({
            package: packagePath,
            path: selector,
            dest: opts.output ? resolveRepoPath(opts.output) : undefined,
            write: Boolean(opts.output),
            overwrite: opts.overwrite === true,
          });
          console.log(JSON.stringify(fetched, null, 2));
          return;
        }
        const loc = lookupOrigin({ package: packagePath, path: selector });
        console.log(JSON.stringify(loc, null, 2));
      } catch (err) {
        fail(err);
      }
    },
  );

const argv = process.argv.filter((arg, index) => !(index >= 2 && arg === "--"));
await program.parseAsync(argv);
