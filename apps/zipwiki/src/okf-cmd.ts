import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  loadZipwikiConfig,
  loadZipwikiHomeEnv,
  resolveOmitOriginalDocuments,
} from "./lib/config/index.js";
import {
  buildOkfDocument,
  buildZipWikiOkfSources,
  conceptFileNameFor,
  finalizeOkfDirectory,
  isAiOkfConfigured,
  OKF_INDEX_NAME,
  resolveOkfModel,
  resolveOkfProvider,
} from "./lib/okf/index.js";
import {
  SUPPORTED_EXTENSIONS,
  classifyDocument,
  collectFiles,
  fail,
  resolveRepoPath,
} from "./lib/parse/index.js";
import { runManifestCommand } from "./manifest-cmd.js";
import {
  isOmittableDocumentSource,
  parsedMarkdownFileName,
} from "./lib/archive/index.js";

export type OkfCommandOptions = {
  inputDir?: string;
  parseDir?: string;
  outputDir?: string;
  /** Stage/package root for META-INF/manifest.json (default: parent of outputDir or sample-output). */
  manifestDir?: string;
  config?: string;
  model?: string;
  provider?: string;
  noAi?: boolean;
  quiet?: boolean;
  /** @deprecated Always clears and regenerates; kept for CLI compatibility. */
  force?: boolean;
  /** Keep existing OKF files and only fill missing ones (skips LLM for those). */
  keepExisting?: boolean;
  /** Skip writing META-INF/manifest.json after OKF. */
  noManifest?: boolean;
};

function stemOf(fileName: string): string {
  const base = basename(fileName);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

function parsePathFor(parseDir: string, sourceName: string): string {
  return join(parseDir, parsedMarkdownFileName(sourceName));
}

/**
 * Package/stage root that should hold META-INF/.
 * `…/wiki/okf` → `…/` (sibling of wiki); otherwise parent of the okf dir.
 */
function defaultManifestRootFromOkfDir(okfDir: string): string {
  const base = basename(okfDir);
  const parent = join(okfDir, "..");
  if (base === "okf" && basename(resolve(parent)) === "wiki") {
    return resolve(join(parent, ".."));
  }
  return resolve(parent);
}

/** Remove prior OKF concepts (flat `*.md` and legacy `{stem}/` dirs). */
function clearOkfOutputDir(outputDir: string): number {
  if (!existsSync(outputDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(outputDir)) {
    const path = join(outputDir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      rmSync(path, { recursive: true, force: true });
      removed += 1;
    } else if (name.endsWith(".md")) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
  return removed;
}

/** Write bundle-root `index.md` from concept files already on disk. */
function writeOkfIndex(outputDir: string): number {
  return finalizeOkfDirectory(outputDir);
}

/**
 * Generate per-document OKF v0.2 concepts from sample-docs + existing parse.
 * Writes flat frontmatter-only `sample-output/wiki/okf/{stem}.md` (parse stays in parseDir).
 * Never parses — missing parse markdown skips the file.
 * Clears the output directory first (unless `--keep-existing`), then calls the LLM
 * for a title / summary / type per document when AI is enabled.
 * After OKF, writes `META-INF/manifest.json` at the package/stage root (parent of `wiki/`).
 */
export async function runOkfCommand(
  opts: OkfCommandOptions = {},
): Promise<void> {
  try {
    loadZipwikiHomeEnv();

    const { config: project } = loadZipwikiConfig({
      configPath: opts.config,
      noAiOkf: opts.noAi === true,
      okfModel: opts.model,
      okfProvider: opts.provider,
    });

    const inputDir = resolve(
      resolveRepoPath(opts.inputDir ?? "sample-docs"),
    );
    const parseDir = resolve(
      resolveRepoPath(opts.parseDir ?? "sample-output/wiki/parsed"),
    );
    const outputDir = resolve(
      resolveRepoPath(opts.outputDir ?? "sample-output/wiki/okf"),
    );

    if (!existsSync(inputDir)) {
      throw new Error(`Input directory not found: ${inputDir}`);
    }

    const files = collectFiles(inputDir, false).filter((f) => {
      const ext = extname(f).toLowerCase();
      return SUPPORTED_EXTENSIONS.has(ext);
    });

    if (files.length === 0) {
      throw new Error(`No supported documents in ${inputDir}`);
    }

    mkdirSync(outputDir, { recursive: true });

    const useAi = opts.noAi === true ? false : project.okf.useAi;
    const model = opts.model?.trim() || project.okf.model;
    const provider = opts.provider?.trim() || project.okf.provider;
    const keepExisting = opts.keepExisting === true;
    const omitOriginalDocuments = resolveOmitOriginalDocuments({
      pack: project.pack,
    });

    if (!keepExisting) {
      const removed = clearOkfOutputDir(outputDir);
      if (!opts.quiet && removed > 0) {
        console.error(
          `[zipwiki okf] cleared ${removed} existing file(s)/dir(s) in ${relative(process.cwd(), outputDir) || outputDir}`,
        );
      }
    }

    if (useAi) {
      const resolvedProvider = resolveOkfProvider(provider);
      const resolvedModel = resolveOkfModel(resolvedProvider, model);
      if (!opts.quiet) {
        console.error(
          `[zipwiki okf] llm ${resolvedProvider}/${resolvedModel} (${isAiOkfConfigured() ? "key set" : "key missing"})`,
        );
      }
      if (!isAiOkfConfigured()) {
        throw new Error(
          "OKF AI enrichment requires an LLM API key. Set one of OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, OPENAI_COMPATIBLE_API_KEY, or AI_GATEWAY_API_KEY in .env / .env.local or ~/.zipwiki/.env (see .env.example). Use --no-ai for deterministic fallback.",
        );
      }
    } else if (!opts.quiet) {
      console.error(`[zipwiki okf] llm off (deterministic fallback)`);
    }

    let written = 0;
    let skipped = 0;
    let errors = 0;

    for (const abs of files) {
      const originalName = basename(abs);
      const stem = stemOf(originalName);
      const parseFile = parsePathFor(parseDir, originalName);
      const conceptName = conceptFileNameFor(originalName);
      const outFile = join(outputDir, conceptName);
      const legacyDir = join(outputDir, stem);

      if (!existsSync(parseFile)) {
        skipped += 1;
        if (!opts.quiet) {
          console.error(
            `[zipwiki okf] skip ${originalName} (missing parse ${relative(process.cwd(), parseFile)})`,
          );
        }
        continue;
      }

      if (keepExisting && existsSync(outFile)) {
        if (!opts.quiet) {
          console.error(
            `[zipwiki okf] skip ${conceptName} (exists; omit --keep-existing to regenerate)`,
          );
        }
        skipped += 1;
        continue;
      }

      try {
        const parsedMarkdown = readFileSync(parseFile, "utf-8");
        const classification = classifyDocument({
          fileName: originalName,
          text: parsedMarkdown,
        });
        // Cite primary + parse; OKF body stays empty (parse is separate).
        const sources = buildZipWikiOkfSources({
          originalName,
          absolutePath: abs,
          parseAvailable: true,
          primaryInPackage: !(
            omitOriginalDocuments && isOmittableDocumentSource(originalName)
          ),
        });

        if (!opts.quiet) {
          console.error(
            `[zipwiki okf] ${originalName} → ${relative(process.cwd(), outFile)}`,
          );
        }

        const result = await buildOkfDocument({
          sourceName: originalName,
          sourcePath: abs,
          parsedMarkdown,
          documentType: classification.documentType,
          useAi,
          requireAi: useAi,
          provider,
          model,
          sources,
        });

        const concept =
          result.files.find((f) => f.name === conceptName) ?? result.files[0];
        if (!concept) {
          throw new Error("buildOkfDocument returned no files");
        }

        writeFileSync(outFile, concept.data, "utf-8");
        // Remove legacy `{stem}/document.md` directory if present.
        if (existsSync(legacyDir)) {
          rmSync(legacyDir, { recursive: true, force: true });
        }
        written += 1;
        if (!opts.quiet) {
          console.error(
            `[zipwiki okf] wrote ${conceptName} (${result.mode})`,
          );
        }
      } catch (err) {
        errors += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[zipwiki okf] error ${originalName}: ${msg}`);
      }
    }

    const indexed = writeOkfIndex(outputDir);
    if (!opts.quiet) {
      console.error(
        `[zipwiki okf] wrote ${OKF_INDEX_NAME} (${indexed} concepts)`,
      );
      console.error(
        `[zipwiki okf] done written=${written} skipped=${skipped} errors=${errors} → ${outputDir}`,
      );
    }

    if (errors > 0) process.exitCode = 1;

    if (opts.noManifest !== true) {
      const manifestDir = resolve(
        resolveRepoPath(
          opts.manifestDir ?? defaultManifestRootFromOkfDir(outputDir),
        ),
      );
      await runManifestCommand({
        inputDir,
        parseDir,
        okfDir: outputDir,
        outputDir: manifestDir,
        config: opts.config,
        quiet: opts.quiet,
      });
    }
  } catch (err) {
    fail(err);
  }
}
