#!/usr/bin/env node
import { Command } from "commander";
import { DOCUMENT_TYPES } from "./lib/archive/index.js";
import {
  loadEnvFiles,
  loadRepoLlamaCloudKey,
  loadZipwikiHomeEnv,
} from "./lib/config/index.js";
import {
  runIsComplex,
  runParseFile,
  runScreenshot,
  REPO_ROOT,
  collectHeader,
  resolveRepoPath,
} from "./lib/parse/index.js";
import { runPack } from "./pack.js";
import { runStage } from "./pipeline/index.js";
import {
  inferStageDir,
  stageOptionsFromCli,
} from "./cli-stage-opts.js";
import type { PipelinePhase } from "./pipeline/types.js";
import {
  runConfigApiKeyCommand,
  runConfigModelCommand,
  runConfigPathCommand,
  runConfigProviderCommand,
  runConfigSetCommand,
  runConfigShowCommand,
} from "./config-cmd.js";
import { runMainMenu } from "./interactive/menu.js";
import {
  runAuthExportEnv,
  runAuthImport,
  runAuthLogin,
  runAuthStatus,
} from "./auth-cmd.js";
import {
  runSettingsOpen,
  runSettingsPull,
  runSettingsShow,
} from "./settings-cmd.js";
import {
  runExtractCommand,
  runListCommand,
  runTestCommand,
} from "./inspect-cmd.js";
import { runUpdateCommand } from "./update-cmd.js";
import {
  formatReadStdout,
  readEntries,
  readManifest,
  buildCatalog,
  formatCatalogText,
  fetchOrigin,
  lookupOrigin,
} from "./lib/access/index.js";
import { AccessError } from "./lib/access/resolve.js";
// Load `.env` / `.env.local` before any command reads process.env.
loadEnvFiles(REPO_ROOT);
loadZipwikiHomeEnv();
loadRepoLlamaCloudKey(REPO_ROOT);
const CATEGORY_LIST = DOCUMENT_TYPES.join("|");

const program = new Command();

program
  .name("zipwiki")
  .description(
    "ZipWiki — create .zipwiki archives (LiteParse / LlamaParse) and document tools",
  )
  .version("0.1.0");


/** Shared pack/stage pipeline flags (compression, credentials, stage, …). */
function withPipelineFlags(cmd: Command): Command {
  return cmd
    .option(
      "--concurrency <n>",
      "Max in-flight parses (and OKF workers)",
      (v) => Number.parseInt(v, 10),
      2,
    )
    .option("--fail-fast", "Stop on first file parse/OKF error")
    .option(
      "--stage-dir <dir>",
      "Stage root for META-INF + wiki/ (default: temp for pack; sample-output for stage phases)",
    )
    .option(
      "--no-zip",
      "With phase all: stop after manifest (do not write .zipwiki)",
    )
    .option(
      "-o, --output <file>",
      "Output .zipwiki path (required for 2+ inputs; default for one file: <name>.zipwiki beside the source)",
    )
    .option("--output-dir <dir>", "Directory for <stem>.zipwiki output")
    .option(
      "--name <stem>",
      "Archive stem when using --output-dir (default: source basename, or collection)",
    )
    .option(
      "--collection",
      "Deprecated: pack always writes one bundle; flag kept for compatibility",
    )
    .option(
      "--category <type>",
      `Force a document category: ${CATEGORY_LIST}`,
    )
    .option(
      "--no-ai-okf",
      "Skip AI for OKF (deterministic frontmatter from parse digest)",
    )
    .option(
      "--no-okf",
      "Skip OKF entirely (no wiki/okf/ directory or LLM enrichment)",
    )
    .option(
      "--okf-provider <id>",
      "OKF LLM supplier: openai|anthropic|gemini|openrouter|openai-compatible|ai-gateway",
    )
    .option("--okf-model <id>", "OKF enrichment model id")
    .option(
      "--no-ocr",
      "Disable OCR for LiteParse (local tessdata) and LlamaParse API (default: OCR on)",
    )
    .option("--ocr-language <lang>", "OCR language (default: eng)")
    .option("--max-pages <n>", "Max pages to parse per file", Number.parseInt)
    .option("--dpi <dpi>", "Rendering DPI", Number.parseFloat)
    .option("--password <password>", "Password for encrypted documents")
    .option(
      "--config <file>",
      "ZipWiki project config (zipwiki.config.json); LiteParse JSON lives under parser.liteparse.configFile",
    )
    .option(
      "--parser <engine>",
      "Document parser: liteparse|llamaparse (default: llamaparse)",
    )
    .option(
      "--parser-mode <mode>",
      "Parser routing: fixed|auto (auto = LiteParse probe, escalate to LlamaParse)",
    )
    .option(
      "--compression <alg>",
      "ZIP compression: zstd|deflate|store (default: zstd)",
    )
    .option("--deflate", "Force deflate compression (Info-ZIP compatible)")
    .option("--pkzip-compress", "Alias for --deflate")
    .option("--legacy", "Force deflate/store; never zstd")
    .option("--level <n>", "Compression level 0–9 (0=store)", Number.parseInt)
    .option("-0", "Store (no compression)")
    .option("-1", "Compression level 1")
    .option("-2", "Compression level 2")
    .option("-3", "Compression level 3")
    .option("-4", "Compression level 4")
    .option("-5", "Compression level 5")
    .option("-6", "Compression level 6")
    .option("-7", "Compression level 7")
    .option("-8", "Compression level 8")
    .option("-9", "Compression level 9")
    .option(
      "--suffixes <list>",
      "Comma-separated suffixes to store uncompressed (repeatable)",
      (v, prev: string[] = []) => prev.concat(v.split(",").map((s) => s.trim())),
      [] as string[],
    )
    .option("-r, --recurse", "Recurse into directories")
    .option(
      "--omit-original",
      "Parsed PDF/DOCX/…: only the extract in the .zipwiki (default when unset)",
    )
    .option(
      "--include-original",
      "Also include original PDF/DOCX/… bytes in the .zipwiki alongside parsed extract",
    )
    .option(
      "--parsed-date-from-original",
      "Stamp parsed wiki/parsed entries with the source file's modification date (default: pack time). Originals always use the source file date.",
    )
    .option("--wiki-dir <dir>", "Alias for --stage-dir (compat)")
    .option(
      "--keep-wiki-dir",
      "Keep the temp wiki tree after pack (implied when --stage-dir / --wiki-dir is set)",
    )
    .option(
      "--remote-parse",
      "Parse via ZipWiki API (ZIPWIKI_PARSE_CREDENTIAL=zipwiki)",
    )
    .option("--parse-api-url <url>", "ZipWiki API base URL")
    .option("--parse-api-key <key>", "ZipWiki API bearer token (zc_live_…)")
    .option(
      "--parse-credential <source>",
      "Parse credentials: zipwiki (default when API key set) | llama | local",
    )
    .option(
      "--use-llama-parse-key",
      "Parse with LLAMA_CLOUD_API_KEY locally (LlamaParse)",
    )
    .option(
      "--remote-okf",
      "OKF via ZipWiki API (ZIPWIKI_OKF_CREDENTIAL=zipwiki)",
    )
    .option(
      "--okf-credential <source>",
      "OKF credentials: zipwiki (default when API key set) | anthropic | local",
    )
    .option(
      "--use-anthropic-okf",
      "OKF with ANTHROPIC_API_KEY locally (Claude)",
    )
    .option("-j, --junk-paths", "Store basenames only at zip root")
    .option(
      "-x, --exclude <pat>",
      "Exclude pattern (repeatable)",
      (v, prev: string[] = []) => prev.concat(v),
      [] as string[],
    )
    .option(
      "-i, --include <pat>",
      "Include pattern (repeatable)",
      (v, prev: string[] = []) => prev.concat(v),
      [] as string[],
    )
    .option(
      "--origin-pattern <re>",
      "Filename regex for remote original URI (named groups fill --origin-url-template)",
    )
    .option(
      "--origin-url-template <tpl>",
      "URI template for omitted originals, e.g. https://host/{year}/{chapter}",
    )
    .option(
      "--origin-file",
      "Store file: URI (pathToFileURL) as Extra Field 0x014F on each parse",
    )
    .option(
      "--sha256",
      "Write Extra Field 0x014E (SHA-256 of each zip member). Default: CRC-32 only",
    )
    .option(
      "--origin-sha256",
      "Include SHA-256 of original primary bytes in Extra Field 0x014F (omit CRC-32)",
    )
    .option("--dry-run", "Plan discover only; do not parse or write")
    .option(
      "-y, --yes",
      "Create the .zipwiki without asking to proceed (for scripts). A non-interactive terminal skips the prompt already.",
    )
    .option("-T, --test-integrity", "Test archive after create")
    .option(
      "-sf, --show-files",
      "After writing .zipwiki, list archive members (method + sizes)",
    )
    .option(
      "--list",
      "Alias for --show-files: list members of the completed .zipwiki",
    )
    .option("-v, --verbose", "Verbose progress")
    .option("-z, --archive-comment <text>", "Archive comment")
    .option("-q, --quiet", "Suppress progress output");
}


function withDocParse(cmd: Command): Command {
  return cmd
    .option(
      "--format <format>",
      'Output format: json|text|markdown (default: "text")',
    )
    .option(
      "--image-mode <mode>",
      "How to surface raster images in markdown: off|placeholder|embed (default: placeholder)",
    )
    .option(
      "--image-output-dir <dir>",
      "Directory to write embedded images to when --image-mode embed is set",
    )
    .option("--no-links", "Disable hyperlink extraction (emit plain anchor text)")
    .option("--ocr-server-url <url>", "HTTP OCR server URL (optional remote OCR)")
    .option(
      "--ocr-server-header <header>",
      'Extra header for OCR server requests, "Name: Value" (repeatable)',
      collectHeader,
    )
    .option(
      "--no-ocr",
      "Disable OCR for LiteParse (local tessdata) and LlamaParse API (default: OCR on)",
    )
    .option("--ocr-language <lang>", "OCR language (default: eng)")
    .option("--max-pages <n>", "Max pages to parse", Number.parseInt)
    .option("--target-pages <pages>", 'Pages to parse (e.g., "1-5,10,15-20")')
    .option("--dpi <dpi>", "Rendering DPI", Number.parseFloat)
    .option("--preserve-small-text", "Keep very small text")
    .option("--password <password>", "Password for encrypted documents")
    .option("--config <file>", "JSON config file path")
    .option("-q, --quiet", "Suppress progress output")
    .option(
      "--num-workers <n>",
      "Number of concurrent OCR workers",
      Number.parseInt,
    )
    .option("--complexity", "Include per-page complexity signals in JSON output");
}

withPipelineFlags(
  program
    .command("stage")
    .description(
      "Run pipeline phases into a stage dir: parse | okf | manifest | compress | all",
    )
    .argument("<files...>", "Documents or directories")
    .option(
      "--phase <phase>",
      "parse | okf | manifest | compress | all",
      "all",
    ),
).action(async (files: string[], opts) => {
  const phase = String(opts.phase ?? "all") as PipelinePhase;
  const allowed: PipelinePhase[] = [
    "parse",
    "okf",
    "manifest",
    "compress",
    "all",
  ];
  if (!allowed.includes(phase)) {
    throw new Error(
      `Invalid --phase ${opts.phase}; use parse|okf|manifest|compress|all`,
    );
  }
  await runStage(
    files.map((f) => resolveRepoPath(f)),
    stageOptionsFromCli(opts, {
      phase,
      stageDir: opts.stageDir ?? opts.wikiDir,
    }),
  );
});

withPipelineFlags(
  program
    .command("pack")
    .description(
      "Alias for `stage --phase all`: parse → per-file OKF → manifest → .zipwiki",
    )
    .argument("<files...>", "Documents or directories to pack"),
).action(async (files: string[], opts) => {
  await runPack(
    files.map((f) => resolveRepoPath(f)),
    stageOptionsFromCli(opts, {
      phase: "all",
      wikiDir: opts.wikiDir ?? opts.stageDir,
    }),
  );
});


withDocParse(
  program
    .command("parse-file")
    .description(
      "Parse a single document (stdout or -o)",
    )
    .argument("<file>", "Path to the document file (or - for stdin)")
    .option("-o, --output <file>", "Output file path")
    .option(
      "--parser <engine>",
      "Document parser: liteparse|llamaparse (default: llamaparse)",
    )
    .option(
      "--parser-mode <mode>",
      "Parser routing: fixed|auto",
    )
    .option(
      "--project-config <file>",
      "ZipWiki project config (zipwiki.config.json)",
    ),
).action(async (file: string, opts) => {
  await runParseFile(resolveRepoPath(file), {
    ...opts,
    output: opts.output ? resolveRepoPath(opts.output) : undefined,
    imageOutputDir: opts.imageOutputDir
      ? resolveRepoPath(opts.imageOutputDir)
      : undefined,
    config: opts.config ? resolveRepoPath(opts.config) : undefined,
    projectConfig: opts.projectConfig
      ? resolveRepoPath(opts.projectConfig)
      : undefined,
  });
});

program
  .command("is-complex")
  .description(
    "Check if a document is complex enough to require OCR or advanced parsing",
  )
  .argument("<file>", "Path to the document file")
  .option("--compact", "Emit dense, whitespace-free JSON instead of pretty")
  .option("--max-pages <n>", "Max pages to parse", Number.parseInt)
  .option("--target-pages <pages>", 'Pages to check (e.g., "1-5,10,15-20")')
  .option("--password <password>", "Password for encrypted documents")
  .option("-q, --quiet", "Suppress progress output")
  .action(async (file: string, opts) => {
    await runIsComplex(resolveRepoPath(file), opts);
  });

program
  .command("screenshot")
  .description("Generate screenshots of document pages")
  .argument("<file>", "Path to the document file")
  .option(
    "-o, --output-dir <dir>",
    "Output directory for screenshots",
    "./screenshots",
  )
  .option("--target-pages <pages>", 'Pages to screenshot (e.g., "1,3,5" or "1-5")')
  .option("--dpi <dpi>", "Rendering DPI", Number.parseFloat)
  .option("--password <password>", "Password for encrypted documents")
  .option("-q, --quiet", "Suppress progress output")
  .action(async (file: string, opts) => {
    await runScreenshot(resolveRepoPath(file), {
      ...opts,
      outputDir: resolveRepoPath(opts.outputDir),
    });
  });

program
  .command("batch-parse")
  .description(
    "Parse only into a stage dir (wiki/parsed); use before okf/manifest or to re-OCR",
  )
  .argument("<input-dir>", "Input directory")
  .argument("<output-dir>", "Output directory")
  .option(
    "--format <format>",
    'Output format: json|text|markdown (default: "text")',
  )
  .option(
      "--no-ocr",
      "Disable OCR for LiteParse (local tessdata) and LlamaParse API (default: OCR on)",
    )
  .option("--ocr-language <lang>", "OCR language (default: eng)")
  .option("--ocr-server-url <url>", "HTTP OCR server URL (optional remote OCR)")
  .option(
    "--ocr-server-header <header>",
    'Extra header for OCR server requests, "Name: Value" (repeatable)',
    collectHeader,
  )
  .option("--max-pages <n>", "Max pages to parse per file", Number.parseInt)
  .option("--dpi <dpi>", "Rendering DPI", Number.parseFloat)
  .option("--recursive", "Recursively search input directory")
  .option("--extension <ext>", "Only process files with this extension")
  .option("--password <password>", "Password for encrypted documents")
  .option("-q, --quiet", "Suppress progress output")
  .option(
    "--num-workers <n>",
    "Number of concurrent OCR workers",
    Number.parseInt,
  )
  .option("--complexity", "Include per-page complexity signals in JSON output")
  .option(
    "--parser <engine>",
    "Document parser: liteparse|llamaparse (default: llamaparse → LiteParse fallback)",
  )
  .option(
    "--parser-mode <mode>",
    "Parser routing: fixed|auto (auto = LiteParse probe, escalate to LlamaParse)",
  )
  .option(
    "--project-config <file>",
    "ZipWiki project config (zipwiki.config.json)",
  )
  .action(async (inputDir: string, outputDir: string, opts) => {
    await runStage([resolveRepoPath(inputDir)], stageOptionsFromCli(opts, {
      phase: "parse",
      stageDir: inferStageDir(outputDir),
      recurse: opts.recursive === true,
      noAiOkf: true,
    }));
  });

program
  .command("okf")
  .description(
    "Re-run OKF on an existing stage (wiki/parsed → wiki/okf); skip re-parse",
  )
  .argument(
    "[input-dir]",
    "Directory of source documents (root files only)",
    "sample-docs",
  )
  .option(
    "--parse-dir <dir>",
    "Directory of existing *.md parse output",
    "sample-output/wiki/parsed",
  )
  .option(
    "--output-dir <dir>",
    "Directory for per-document OKF concepts ({stem}.md)",
    "sample-output/wiki/okf",
  )
  .option("--config <file>", "ZipWiki project config (zipwiki.config.json)")
  .option(
    "--provider <id>",
    "OKF LLM supplier: openai|anthropic|gemini|openrouter|openai-compatible|ai-gateway",
  )
  .option("--model <id>", "OKF enrichment model (default from provider / config / env)")
  .option("--no-ai", "Deterministic OKF only (skip LLM enrichment)")
  .option(
    "--keep-existing",
    "Do not clear output-dir; skip files that already exist",
  )
  .option("-q, --quiet", "Suppress progress output")
  .action(async (inputDir: string, opts) => {
    const stageDir = inferStageDir(opts.outputDir ?? opts.parseDir ?? "sample-output");
    await runStage([resolveRepoPath(inputDir)], stageOptionsFromCli(opts, {
      phase: "okf",
      stageDir,
      noAiOkf: opts.ai === false || opts.noAi === true,
      keepExistingOkf: opts.keepExisting === true,
      noManifest: true,
    }));
  });

program
  .command("manifest")
  .description(
    "Rebuild META-INF/manifest.json from an existing stage (wiki/parsed + optional OKF)",
  )
  .argument(
    "[input-dir]",
    "Directory of source documents (root files only)",
    "sample-docs",
  )
  .option(
    "--parse-dir <dir>",
    "Directory of existing *.md parse output",
    "sample-output/wiki/parsed",
  )
  .option(
    "--okf-dir <dir>",
    "Directory of existing OKF concept *.md files",
    "sample-output/wiki/okf",
  )
  .option(
    "--output-dir <dir>",
    "Package/stage root that will contain META-INF/manifest.json",
    "sample-output",
  )
  .option("--config <file>", "ZipWiki project config (zipwiki.config.json)")
  .option(
    "--parser <engine>",
    "Recorded ai.parser.engine (default from config / env)",
  )
  .option("-q, --quiet", "Suppress progress output")
  .action(async (inputDir: string, opts) => {
    const stageDir = inferStageDir(opts.outputDir ?? "sample-output");
    await runStage([resolveRepoPath(inputDir)], stageOptionsFromCli(opts, {
      phase: "manifest",
      stageDir,
    }));
  });

program
  .command("init")
  .description(
    "Open dashboard settings (pack defaults live on your ZipWiki account)",
  )
  .argument(
    "[source]",
    "Optional — ignored; use zipwiki pack <path> after setup",
  )
  .option("--no-browser", "Print the settings URL only")
  .action(async (_source?: string, opts?: { browser?: boolean }) => {
    console.error(
    "[zipwiki] Pack preferences are stored on your ZipWiki account.",
  );
  console.error(
    "[zipwiki] Local LiteParse pack works without login; account unlocks hosted parse/OKF.",
  );
  console.error(
    "[zipwiki] Optional project overlay: zipwiki.config.json in the repo.",
  );
    try {
      await runSettingsOpen({ noBrowser: opts?.browser === false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[zipwiki] ${msg}`);
      console.error("Run: zipwiki auth login");
      process.exitCode = 1;
    }
  });

const settingsCmd = program
  .command("settings")
  .description("Show, refresh, or open account pack settings");

settingsCmd
  .command("show", { isDefault: true })
  .description("Print cached account settings (redacted)")
  .option("--format <fmt>", "text|json", "text")
  .action(async (opts) => {
    await runSettingsShow({
      format: opts.format === "json" ? "json" : "text",
    });
  });

settingsCmd
  .command("pull")
  .description("Download account settings from the API into ~/.zipwiki/settings.json")
  .action(async () => {
    await runSettingsPull();
  });

settingsCmd
  .command("open")
  .description("Open the dashboard Settings page")
  .option("--no-browser", "Print the URL only")
  .action(async (opts) => {
    await runSettingsOpen({ noBrowser: opts.browser === false });
  });

const authCmd = program
  .command("auth")
  .description("Connect zipwiki to the ZipWiki hosted API");

authCmd
  .command("login")
  .description(
    "Browser device login (release → production; dev builds: --env local|dev|production)",
  )
  .option(
    "--env <target>",
    "API target: local|dev|production (dev builds only for local/dev)",
  )
  .option("--no-browser", "Print the URL; do not open a browser")
  .action(async (opts) => {
    await runAuthLogin({
      env: opts.env,
      noBrowser: opts.browser === false,
    });
  });

authCmd
  .command("import")
  .description("Import a downloaded zipwiki-cli.env (or JSON); use - for stdin")
  .argument("<file>", "Path to .env / .json, or - for stdin")
  .action(async (file: string) => {
    await runAuthImport(file);
  });

authCmd
  .command("status")
  .description("Show saved API connection and plan/usage")
  .action(async () => {
    await runAuthStatus();
  });

authCmd
  .command("export-env")
  .description("Print ZIPWIKI_API_URL / KEY as a CLI env file")
  .action(() => {
    runAuthExportEnv();
  });

const configCmd = program
  .command("config")
  .description("Show or update ZipWiki home/project settings");

configCmd
  .command("show", { isDefault: true })
  .description("Show effective settings (secrets redacted)")
  .option("--config <file>", "Project config path")
  .option("--format <fmt>", "text|json", "text")
  .action((opts) => {
    runConfigShowCommand({
      config: opts.config,
      format: opts.format === "json" ? "json" : "text",
    });
  });

configCmd
  .command("path")
  .description("Print ZIPWIKI_HOME and related paths")
  .option("--format <fmt>", "text|json", "text")
  .action((opts) => {
    runConfigPathCommand({
      format: opts.format === "json" ? "json" : "text",
    });
  });

configCmd
  .command("set")
  .description("Set a managed ~/.zipwiki/.env key (empty value deletes)")
  .argument("<key>", "Managed env key")
  .argument("<value>", "Value (use \"\" to delete)")
  .action((key: string, value: string) => {
    runConfigSetCommand(key, value);
  });

configCmd
  .command("provider")
  .description("Set ZIPWIKI_OKF_PROVIDER")
  .argument("<id>", "openai|anthropic|gemini|openrouter|openai-compatible|ai-gateway")
  .action((id: string) => {
    runConfigProviderCommand(id);
  });

configCmd
  .command("model")
  .description("Set ZIPWIKI_OKF_MODEL")
  .argument("<id>", "Model id")
  .action((id: string) => {
    runConfigModelCommand(id);
  });

configCmd
  .command("api-key")
  .description("Set provider API key in ~/.zipwiki/.env")
  .argument("<provider>", "Provider id")
  .argument("<key>", "API key value")
  .action((provider: string, key: string) => {
    runConfigApiKeyCommand(provider, key);
  });

function collectFlag(value: string, prev: string[]): string[] {
  return prev.concat(value);
}

program
  .command("update")
  .description(
    "Add, update, or delete primaries in a .zipwiki (full rewrite; copies unchanged compressed members)",
  )
  .argument("<archive>", "Existing .zipwiki / .nzip")
  .option("-o, --output <file>", "Output path (default: replace archive in place)")
  .option(
    "--add <file>",
    "Add a source file (repeatable; parse + optional OKF)",
    collectFlag,
    [] as string[],
  )
  .option(
    "--del <entry>",
    "Delete a primary (ZIP path, wiki/parsed/P.md, unique basename or stem, repeatable)",
    collectFlag,
    [] as string[],
  )
  .option(
    "--update <spec>",
    "Update an existing primary: FILE (basename match) or ZIPPATH=FILE (repeatable)",
    collectFlag,
    [] as string[],
  )
  .option("--no-ai-okf", "Skip AI for OKF on added/updated files")
  .option("--no-okf", "Do not write OKF for added/updated files")
  .option("--omit-original", "Omit omittable originals for new/updated files")
  .option(
    "--include-original",
    "Include original bytes for new/updated files",
  )
  .option("--parser <engine>", "Document parser: liteparse|llamaparse")
  .option("--parser-mode <mode>", "Parser routing: fixed|auto")
  .option("--compression <alg>", "ZIP compression for new members: zstd|deflate|store")
  .option("--deflate", "Force deflate compression for new members")
  .option("--legacy", "Force deflate/store for new members")
  .option("--level <n>", "Compression level 0–9 for new members", Number.parseInt)
  .option(
    "--suffixes <list>",
    "Comma-separated suffixes to store uncompressed (repeatable)",
    (v, prev: string[] = []) => prev.concat(v.split(",").map((s) => s.trim())),
    [] as string[],
  )
  .option("--origin-pattern <re>", "Filename regex for Extra Field 0x014F")
  .option("--origin-url-template <tpl>", "URI template for Extra Field 0x014F")
  .option("--origin-file", "Store file: URI as Extra Field 0x014F on each parse")
  .option(
    "--sha256",
    "Write Extra Field 0x014E on new members (SHA-256). Default: CRC-32 only",
  )
  .option(
    "--origin-sha256",
    "Include SHA-256 of original primary bytes in Extra Field 0x014F (omit CRC-32)",
  )
  .option(
    "--stage-dir <dir>",
    "Write wiki/ + META-INF/manifest.json here after rewrite",
  )
  .option("--wiki-dir <dir>", "Alias for --stage-dir")
  .option("--config <file>", "ZipWiki project config")
  .option("--no-ocr", "Disable OCR for parse of new/updated files")
  .option("-j, --json", "JSON output")
  .option("-q, --quiet", "Quiet")
  .action(async (archive: string, opts) => {
    await runUpdateCommand(archive, {
      output: opts.output,
      add: opts.add,
      del: opts.del,
      update: opts.update,
      noAiOkf: opts.noAiOkf === true || opts.aiOkf === false,
      noOkf: opts.noOkf === true || opts.okf === false,
      omitOriginal: opts.omitOriginal === true,
      includeOriginal: opts.includeOriginal === true,
      parser: opts.parser,
      parserMode: opts.parserMode,
      compression: opts.compression,
      level: opts.level,
      deflate: opts.deflate === true,
      legacy: opts.legacy === true,
      suffixes: opts.suffixes,
      originPattern: opts.originPattern,
      originUrlTemplate: opts.originUrlTemplate,
      originFile: opts.originFile === true,
      sha256Extra: opts.sha256 === true,
      originSha256: opts.originSha256 === true,
      quiet: opts.quiet === true,
      json: opts.json === true,
      config: opts.config,
      noOcr: opts.noOcr === true || opts.ocr === false,
      stageDir: opts.stageDir,
      wikiDir: opts.wikiDir,
    });
  });

program
  .command("list")
  .description("List entries in a .zipwiki / .nzip / ZIP archive")
  .argument("<archive>", "Path to archive")
  .option("-v, --verbose", "Show method and sizes")
  .option("-q, --quiet", "Quiet")
  .option("-j, --json", "JSON output")
  .option("--format <fmt>", "text|json", "text")
  .option("-s, --short", "Names only")
  .option("-m, --metadata", "Only META-INF / wiki / codex paths")
  .option(
    "-c, --catalog",
    "Primary catalog (OKF / parsed / original / next-read hints)",
  )
  .action((archive: string, opts) => {
    if (opts.catalog === true) {
      const catalog = buildCatalog(resolveRepoPath(archive));
      if (opts.format === "json" || opts.json) {
        console.log(JSON.stringify(catalog, null, 2));
        return;
      }
      process.stdout.write(formatCatalogText(catalog));
      return;
    }
    runListCommand(archive, {
      verbose: opts.verbose === true,
      quiet: opts.quiet === true,
      json: opts.json === true,
      format: opts.format === "json" ? "json" : "text",
      short: opts.short === true,
      metadata: opts.metadata === true,
    });
  });

program
  .command("catalog")
  .description(
    "Print a readable primary catalog (same as `zipaccess open` / `list --catalog`)",
  )
  .argument("<archive>", "Path to .zipwiki")
  .option("-j, --json", "JSON output")
  .action((archive: string, opts: { json?: boolean }) => {
    const catalog = buildCatalog(resolveRepoPath(archive));
    if (opts.json) {
      console.log(JSON.stringify(catalog, null, 2));
      return;
    }
    process.stdout.write(formatCatalogText(catalog));
  });

program
  .command("test")
  .description("Test archive integrity (inflate each entry)")
  .argument("<archive>", "Path to archive")
  .option("-v, --verbose", "Verbose")
  .option("-q, --quiet", "Quiet")
  .action((archive: string, opts) => {
    runTestCommand(archive, {
      verbose: opts.verbose === true,
      quiet: opts.quiet === true,
    });
  });

function collectPath(value: string, prev: string[]): string[] {
  return prev.concat(value);
}

program
  .command("read")
  .description(
    "Inflate entry bytes to stdout (no JSON). Repeat --path or pass multiple arguments; several files are wrapped with ===== ZIPWIKI <path> ===== markers",
  )
  .argument("[paths...]", "Archive entry paths")
  .option(
    "-p, --package <path>",
    "Path to .zipwiki (default: wiki.zipwiki in cwd)",
  )
  .option(
    "--path <path>",
    "Entry path (repeatable)",
    collectPath,
    [] as string[],
  )
  .option("--as-binary", "Force base64 encoding")
  .option(
    "--origin",
    "Print Extra Field 0x014F origin URI/CRC to stderr (body still on stdout)",
  )
  .option(
    "--fetch-origin",
    "Download originUri and verify CRC-32 against the saved tag",
  )
  .option(
    "--origin-out <path>",
    "With --fetch-origin, write the original to this path",
  )
  .option("--overwrite", "Overwrite origin dest if it already exists")
  .action(
    async (
      positional: string[],
      opts: {
        package?: string;
        path?: string[];
        asBinary?: boolean;
        origin?: boolean;
        fetchOrigin?: boolean;
        originOut?: string;
        overwrite?: boolean;
      },
    ) => {
      const fromFlag = opts.path ?? [];
      const paths = [...positional, ...fromFlag]
        .flatMap((p) => p.split(","))
        .map((p) => p.trim())
        .filter(Boolean);
      const pkg = opts.package ? resolveRepoPath(opts.package) : opts.package;
      const results = readEntries({
        package: pkg,
        paths,
        asBinary: opts.asBinary === true,
      });
      for (const r of results) {
        if (r.truncated) {
          console.error(
            `zipwiki: truncated ${r.path} (${r.totalBytes} bytes)`,
          );
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
    },
  );

program
  .command("read-manifest")
  .description(
    "Inflate META-INF/manifest.json to stdout (raw JSON, no wrappers)",
  )
  .option(
    "-p, --package <path>",
    "Path to .zipwiki (default: wiki.zipwiki in cwd)",
  )
  .action((opts: { package?: string }) => {
    const result = readManifest({
      package: opts.package ? resolveRepoPath(opts.package) : opts.package,
    });
    if (result.truncated) {
      console.error(
        `zipwiki: truncated ${result.path} (${result.totalBytes} bytes)`,
      );
    }
    process.stdout.write(formatReadStdout([result]));
  });

program
  .command("origin")
  .description(
    "Show Extra Field 0x014F origin URI; optionally download and verify CRC-32",
  )
  .argument("[selector]", "Parsed or primary path (or use --path / --parsed)")
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
      selectorArg: string | undefined,
      opts: {
        package?: string;
        parsed?: string;
        path?: string;
        fetch?: boolean;
        output?: string;
        overwrite?: boolean;
      },
    ) => {
      const selector = opts.path ?? opts.parsed ?? selectorArg;
      if (!selector) {
        console.error("zipwiki origin: provide a parsed/primary path");
        process.exit(1);
      }
      const pkg = opts.package ? resolveRepoPath(opts.package) : opts.package;
      try {
        if (opts.fetch || opts.output) {
          const fetched = await fetchOrigin({
            package: pkg,
            path: selector,
            dest: opts.output ? resolveRepoPath(opts.output) : undefined,
            write: Boolean(opts.output),
            overwrite: opts.overwrite === true,
          });
          console.log(JSON.stringify(fetched, null, 2));
          return;
        }
        console.log(
          JSON.stringify(lookupOrigin({ package: pkg, path: selector }), null, 2),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`zipwiki: ${msg}`);
        process.exit(1);
      }
    },
  );

program
  .command("extract")
  .description("Extract archive (overwrite-or-refuse; no freshen/update)")
  .argument("<archive>", "Path to archive")
  .argument("[dest]", "Destination directory", ".")
  .option("-o, --overwrite", "Overwrite existing files")
  .option("-n, --never", "Never overwrite")
  .option("-d, --exdir <dir>", "Extract directory")
  .option("-j, --junk-paths", "Flatten paths")
  .option("-v, --verbose", "Verbose")
  .option("-q, --quiet", "Quiet")
  .action((archive: string, dest: string, opts) => {
    runExtractCommand(archive, dest, {
      overwrite: opts.overwrite === true,
      neverOverwrite: opts.never === true,
      exdir: opts.exdir,
      junkPaths: opts.junkPaths === true,
      verbose: opts.verbose === true,
      quiet: opts.quiet === true,
    });
  });

const argv = process.argv.filter((arg, index) => !(index >= 2 && arg === "--"));
if (argv.slice(2).length === 0) {
  await runMainMenu();
} else {
  await program.parseAsync(argv);
}
