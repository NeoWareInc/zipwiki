import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fail, resolveRepoPath } from "./lib/parse/index.js";
import {
  parseUpdateSpecs,
  updatePackage,
} from "./lib/access/update.js";
import type { ParseEngineId, ParserMode } from "./lib/config/index.js";

export type UpdateCommandOptions = {
  output?: string;
  add?: string[];
  del?: string[];
  update?: string[];
  noAiOkf?: boolean;
  noOkf?: boolean;
  omitOriginal?: boolean;
  includeOriginal?: boolean;
  parser?: string;
  parserMode?: string;
  compression?: string;
  level?: number;
  deflate?: boolean;
  legacy?: boolean;
  suffixes?: string[];
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  sha256Extra?: boolean;
  originSha256?: boolean;
  quiet?: boolean;
  json?: boolean;
  config?: string;
  noOcr?: boolean;
  stageDir?: string;
  wikiDir?: string;
};

function asList(v: string[] | string | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export async function runUpdateCommand(
  archive: string,
  opts: UpdateCommandOptions = {},
): Promise<void> {
  const path = resolve(resolveRepoPath(archive));
  if (!existsSync(path) && !opts.add?.length) {
    fail(`Archive not found: ${path}`);
  }
  const omitOriginalDocuments =
    opts.includeOriginal === true
      ? false
      : opts.omitOriginal === true
        ? true
        : undefined;
  const parser = opts.parser as ParseEngineId | undefined;
  const parserMode = opts.parserMode as ParserMode | undefined;
  const compression = opts.compression as
    | "zstd"
    | "deflate"
    | "store"
    | undefined;

  try {
    const result = await updatePackage({
      package: path,
      output: opts.output ? resolveRepoPath(opts.output) : undefined,
      add: asList(opts.add).map((f) => resolveRepoPath(f)),
      del: asList(opts.del),
      update: parseUpdateSpecs(asList(opts.update)).map((r) => ({
        entry: r.entry,
        file: resolveRepoPath(r.file),
      })),
      noAiOkf: opts.noAiOkf,
      noOkf: opts.noOkf,
      omitOriginalDocuments,
      parser,
      parserMode,
      compression,
      level: opts.level,
      deflate: opts.deflate,
      legacy: opts.legacy,
      storeSuffixes: opts.suffixes,
      originPattern: opts.originPattern,
      originUrlTemplate: opts.originUrlTemplate,
      originFile: opts.originFile,
      sha256Extra: opts.sha256Extra,
      originSha256: opts.originSha256,
      quiet: opts.quiet,
      config: opts.config ? resolveRepoPath(opts.config) : undefined,
      noOcr: opts.noOcr,
      stageDir: opts.stageDir
        ? resolveRepoPath(opts.stageDir)
        : opts.wikiDir
          ? resolveRepoPath(opts.wikiDir)
          : undefined,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (!opts.quiet) {
      console.log(`Updated ${result.package}`);
      if (result.added.length) console.log(`  added: ${result.added.join(", ")}`);
      if (result.removed.length)
        console.log(`  removed: ${result.removed.join(", ")}`);
      if (result.updated.length)
        console.log(`  updated: ${result.updated.join(", ")}`);
      if (result.stageDir) console.log(`  stage: ${result.stageDir}`);
      for (const w of result.warnings) console.warn(`  warning: ${w}`);
    } else {
      console.log(result.package);
    }
  } catch (err) {
    fail(err);
  }
}
