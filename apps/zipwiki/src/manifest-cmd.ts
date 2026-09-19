import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  DEFAULT_AI_ROOT,
  DEFAULT_OKF_VERSION,
  DEFAULT_PARSED_DIR,
  assignContentPaths,
  buildNeoZipManifest,
  parsedMarkdownFileName,
  serializeNeoZipManifest,
  type NeoZipAiOkf,
  type NeoZipAiPrimary,
  type NeoZipManifest,
} from "./lib/archive/index.js";
import { loadZipwikiConfig } from "./lib/config/index.js";
import {
  conceptFileNameFor,
  parseFrontmatterFields,
  splitFrontmatter,
} from "./lib/okf/index.js";
import {
  SUPPORTED_EXTENSIONS,
  classifyDocument,
  collectFiles,
  fail,
  resolveRepoPath,
} from "./lib/parse/index.js";

export type ManifestCommandOptions = {
  inputDir?: string;
  parseDir?: string;
  okfDir?: string;
  /** Directory that will contain META-INF/manifest.json (default: sample-output). */
  outputDir?: string;
  config?: string;
  quiet?: boolean;
  parserEngine?: string;
};

function guessMime(path: string): string {
  const ext = extname(path).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".html": "text/html",
    ".htm": "text/html",
    ".csv": "text/csv",
    ".eml": "message/rfc822",
  };
  return map[ext] ?? "application/octet-stream";
}

function parsePathFor(parseDir: string, sourceName: string): string {
  return join(parseDir, parsedMarkdownFileName(sourceName));
}

function okfPathFor(okfDir: string, sourceName: string): string {
  return join(okfDir, conceptFileNameFor(sourceName));
}

function readOkfSummary(okfFile: string): {
  title?: string;
  description?: string;
  type?: string;
} {
  if (!existsSync(okfFile)) return {};
  const md = readFileSync(okfFile, "utf-8");
  const split = splitFrontmatter(md);
  if (!split.frontmatter) return {};
  const fields = parseFrontmatterFields(split.frontmatter);
  return {
    ...(fields.title ? { title: fields.title } : {}),
    ...(fields.description ? { description: fields.description } : {}),
    ...(fields.type ? { type: fields.type } : {}),
  };
}

/**
 * Clear stage/package-root clutter before writing META-INF.
 * Keeps META-INF/ and the AI root (`wiki/` by default); removes stale primary
 * copies and other leftover root entries. Primaries are not re-copied — compress
 * reads them from the input paths.
 */
function clearPackageRoot(
  outputDir: string,
  aiRoot: string,
): { removed: number } {
  mkdirSync(outputDir, { recursive: true });
  const keep = new Set([
    "META-INF",
    "meta-inf",
    aiRoot,
    ".gitkeep",
  ]);
  let removed = 0;
  for (const name of readdirSync(outputDir)) {
    if (keep.has(name)) continue;
    rmSync(join(outputDir, name), { recursive: true, force: true });
    removed += 1;
  }
  return { removed };
}

/**
 * Build APPNOTE `META-INF/manifest.json` from sample-docs + parse + OKF dirs.
 * Clears stale root copies under the stage (keeps META-INF + AI root), lists
 * primaries from the input dir without copying them, then writes
 * `{outputDir}/META-INF/manifest.json`. Compress later streams originals from
 * their source paths into the `.nzip`.
 */
export async function runManifestCommand(
  opts: ManifestCommandOptions = {},
): Promise<NeoZipManifest> {
  try {
    const { config: project } = loadZipwikiConfig({
      configPath: opts.config,
    });

    const inputDir = resolve(
      resolveRepoPath(opts.inputDir ?? "sample-docs"),
    );
    const parseDir = resolve(
      resolveRepoPath(opts.parseDir ?? "sample-output/wiki/parsed"),
    );
    const okfDir = resolve(
      resolveRepoPath(opts.okfDir ?? "sample-output/wiki/okf"),
    );
    const outputDir = resolve(
      resolveRepoPath(opts.outputDir ?? "sample-output"),
    );
    const aiRoot = DEFAULT_AI_ROOT;

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

    const { removed } = clearPackageRoot(outputDir, aiRoot);
    const contentPaths = assignContentPaths(files.map((f) => basename(f)));

    if (!opts.quiet) {
      console.error(
        `[zipwiki manifest] stage ${relative(process.cwd(), outputDir) || "."}: ` +
          `removed ${removed} stale root entr${removed === 1 ? "y" : "ies"} ` +
          `(primaries referenced from input, not copied)`,
      );
    }

    const primaries: NeoZipAiPrimary[] = [];
    let okfPresent = false;

    for (let i = 0; i < files.length; i++) {
      const sourcePath = files[i]!;
      const originalName = basename(sourcePath);
      const path = contentPaths[i]!;
      const parseFile = parsePathFor(parseDir, originalName);
      const okfFile = okfPathFor(okfDir, originalName);
      const hasParsed = existsSync(parseFile);
      const okf = readOkfSummary(okfFile);
      if (existsSync(okfFile)) okfPresent = true;

      let documentType = okf.type;
      if (!documentType && hasParsed) {
        const classification = classifyDocument({
          fileName: originalName,
          text: readFileSync(parseFile, "utf-8"),
        });
        documentType = classification.documentType;
      } else if (!documentType) {
        documentType = classifyDocument({
          fileName: originalName,
          text: "",
        }).documentType;
      }

      primaries.push({
        path,
        mimeType: guessMime(sourcePath),
        ...(documentType ? { documentType } : {}),
        hasParsed,
      });
    }

    const aiOkf: NeoZipAiOkf | undefined = okfPresent
      ? {
          present: true,
          root: `${aiRoot}/okf/`,
          version: DEFAULT_OKF_VERSION,
          ...(existsSync(join(okfDir, "index.md"))
            ? { index: `${aiRoot}/okf/index.md` }
            : {}),
        }
      : undefined;

    const manifest = buildNeoZipManifest({
      aiRoot,
      parsedDir: DEFAULT_PARSED_DIR,
      primaries,
      okf: aiOkf,
      parserEngine: opts.parserEngine ?? project.parser.engine,
      parser: {
        engine: opts.parserEngine ?? project.parser.engine,
      },
    });

    const metaDir = join(outputDir, "META-INF");
    mkdirSync(metaDir, { recursive: true });
    const outFile = join(metaDir, "manifest.json");
    writeFileSync(outFile, serializeNeoZipManifest(manifest), "utf-8");

    if (!opts.quiet) {
      const parsed = primaries.filter((p) => p.hasParsed).length;
      console.error(
        `[zipwiki manifest] wrote ${relative(process.cwd(), outFile)} ` +
          `(primaries=${primaries.length} parsed=${parsed} okf=${okfPresent ? "yes" : "no"})`,
      );
    }

    return manifest;
  } catch (err) {
    fail(err);
    throw err;
  }
}
