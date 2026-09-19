import { mkdirSync, mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  NZIP_EXTENSION,
  fail,
  formatOriginalsSummary,
  resolveRepoPath,
  stripPackageExtension,
} from "../lib/archive/index.js";
import {
  applyHostedClientConfig,
  formatNonInteractiveSetupError,
  loadZipwikiConfig,
  loadZipwikiHomeEnv,
  loadZipwikiOnboarding,
  needsCredentialSetup,
  refreshAndPrintClientUsage,
  resolveOmitOriginalDocuments,
  resolveOkfCredentialSource,
  resolveParseCredentialSource,
} from "../lib/config/index.js";
import { accountSettingsToConfigInput } from "../lib/config/account-settings-overlay.js";
import {
  requireAccountForHostedCredential,
  syncAccountSettingsForPack,
} from "../lib/config/account-settings-cache.js";
import { DEFAULT_ACCOUNT_SETTINGS } from "@zipwiki/api-client";
import type { AccountSettingsResponse } from "@zipwiki/api-client";
import {
  printParseHeader,
  resolveParseOcrEnabled,
  resolveTessdataPath,
} from "../lib/parse/index.js";
import { ensureCredentialsOrFail } from "../interactive/wizard.js";
import { isInteractiveTty } from "../interactive/tty.js";
import { runListCommand, runTestCommand } from "../inspect-cmd.js";
import { discoverInputs } from "./discover.js";
import {
  ensureStageDirs,
  runCompressPhase,
  runManifestPhaseForFiles,
  runParseAndOkfPhase,
} from "./phases.js";
import type { PipelinePhase, StageOptions, StageResult } from "./types.js";

function applyCredentialEnv(opts: StageOptions): void {
  if (opts.parseApiUrl?.trim()) {
    process.env.ZIPWIKI_API_URL = opts.parseApiUrl.trim();
  }
  if (opts.parseApiKey?.trim()) {
    process.env.ZIPWIKI_API_KEY = opts.parseApiKey.trim();
  }
  if (opts.parseCredential?.trim()) {
    process.env.ZIPWIKI_PARSE_CREDENTIAL = opts.parseCredential.trim();
  }
  if (opts.okfCredential?.trim()) {
    process.env.ZIPWIKI_OKF_CREDENTIAL = opts.okfCredential.trim();
  }
  if (opts.remoteParse) {
    process.env.ZIPWIKI_PARSE_CREDENTIAL = "zipwiki";
  }
  if (opts.remoteOkf) {
    process.env.ZIPWIKI_OKF_CREDENTIAL = "zipwiki";
  }
}

function resolvePhase(opts: StageOptions): PipelinePhase {
  if (opts.phase) return opts.phase;
  return "all";
}

function resolveStageDir(
  opts: StageOptions,
  phase: PipelinePhase,
): { stageDir: string; ephemeral: boolean } {
  const named =
    opts.stageDir?.trim() ||
    opts.wikiDir?.trim() ||
    undefined;
  if (named) {
    const stageDir = resolve(resolveRepoPath(named));
    mkdirSync(stageDir, { recursive: true });
    return { stageDir, ephemeral: false };
  }
  // Ephemeral for pack-style all/compress; sample-output for isolated stages
  // when called without stage-dir is the caller's responsibility (scripts).
  if (phase === "parse" || phase === "okf" || phase === "manifest") {
    const stageDir = resolve(resolveRepoPath("sample-output"));
    mkdirSync(stageDir, { recursive: true });
    return { stageDir, ephemeral: false };
  }
  const stageDir = mkdtempSync(join(tmpdir(), "zipwiki-stage-"));
  return { stageDir, ephemeral: true };
}

function resolveOutputPath(
  files: string[],
  opts: StageOptions,
): string {
  if (opts.output?.trim()) {
    return resolve(resolveRepoPath(opts.output.trim()));
  }
  if (opts.outputDir?.trim()) {
    const dir = resolve(resolveRepoPath(opts.outputDir.trim()));
    mkdirSync(dir, { recursive: true });
    const stem =
      opts.name?.trim() ||
      (files.length === 1
        ? basename(files[0]!).replace(/\.[^.]+$/, "")
        : "bundle");
    return join(dir, `${stem}${NZIP_EXTENSION}`);
  }
  if (files.length === 1) {
    return resolve(
      join(dirname(files[0]!), `${basename(files[0]!)}${NZIP_EXTENSION}`),
    );
  }
  throw new Error(
    "packing 2+ files requires -o <file.zipwiki> or --output-dir",
  );
}

function inputDirFor(files: string[]): string {
  if (files.length === 0) return resolve(resolveRepoPath("sample-docs"));
  // Prefer a common parent; for a single directory expand, files share a root.
  return dirname(files[0]!);
}

/**
 * Unified stage/pack orchestrator.
 * Phases: parse | okf | manifest | compress | all
 */
export async function runStage(
  files: string[],
  opts: StageOptions = {},
): Promise<StageResult> {
  try {
    if (files.length === 0) throw new Error("No files specified");

    loadZipwikiHomeEnv();
    applyCredentialEnv(opts);

    const phase = resolvePhase(opts);
    let accountSettings: AccountSettingsResponse;
    if (opts.skipAccountSync) {
      accountSettings = {
        settings: DEFAULT_ACCOUNT_SETTINGS,
        setupComplete: true,
        setupCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        setupUrl: null,
      };
    } else {
      accountSettings = await syncAccountSettingsForPack({
        quiet: opts.quiet,
      });
    }
    const accountOverlay = accountSettingsToConfigInput(
      accountSettings.settings,
    );

    const parseCredential = resolveParseCredentialSource();
    const okfCredential = resolveOkfCredentialSource();
    requireAccountForHostedCredential({
      parseCredential,
      okfCredential,
      remoteParse: opts.remoteParse === true,
      remoteOkf: opts.remoteOkf === true,
    });

    const { config: project, configPath } = loadZipwikiConfig({
      configPath: opts.config,
      parserEngine: opts.parser,
      parserMode: opts.parserMode,
      noAiOkf: opts.noAiOkf,
      noOcr: opts.noOcr,
      omitOriginalDocuments: opts.omitOriginalDocuments,
      okfProvider: opts.okfProvider,
      okfModel: opts.okfModel,
      accountOverlay,
    });

    if (parseCredential === "llama") {
      project.parser.engine = "llamaparse";
    }

    const hosted = await applyHostedClientConfig(project, {
      quiet: opts.quiet,
    });

    // Free / exhausted LlamaParse: never escalate to Llama locally either.
    if (hosted?.liteparseFallback) {
      project.parser.engine = "liteparse";
      project.parser.mode = "fixed";
      project.parser.escalate.enabled = false;
    }

    if (!opts.quiet && configPath) {
      console.error(`[zipwiki] config ${configPath}`);
    }

    const onboarding = loadZipwikiOnboarding();
    let useAi =
      opts.noOkf === true
        ? false
        : opts.noAiOkf === true
          ? false
          : project.okf.useAi;

    // Soft-skip hosted ZipWiki OKF when plan has no remaining OKF quota.
    if (hosted?.okfHostFallback && useAi) {
      useAi = false;
      if (!opts.quiet) {
        console.error(
          "[zipwiki] Skipping ZipWiki AI OKF (quota/plan). Use MCP okf_enrich with the host LLM.",
        );
      }
    }

    const needsOkfWork =
      opts.noOkf !== true && (phase === "okf" || phase === "all");

    if (opts.noOkf === true && phase === "okf") {
      throw new Error(
        "Cannot run --phase okf with --no-okf (OKF is disabled)",
      );
    }

    if (needsOkfWork && useAi) {
      await ensureCredentialsOrFail({
        useAi,
        interactive: isInteractiveTty(),
      });
      if (needsCredentialSetup({ useAi }).needsSetup) {
        throw new Error(
          formatNonInteractiveSetupError(needsCredentialSetup({ useAi })),
        );
      }
    }

    const recurse =
      opts.recurse === true ||
      accountSettings.settings.pack.recurse === true ||
      (!accountSettings.setupComplete && onboarding.recurse === true) ||
      false;
    const expanded = discoverInputs(files, {
      recurse,
      include: opts.include,
      exclude: opts.exclude,
    });
    if (expanded.length === 0) {
      throw new Error("No files specified after filters");
    }
    const inputRoots = files.map((f) => {
      const abs = resolve(resolveRepoPath(f));
      try {
        return statSync(abs).isDirectory() ? abs : dirname(abs);
      } catch {
        return abs;
      }
    });

    if (opts.dryRun) {
      if (!opts.quiet) {
        console.error(
          `[zipwiki] dry-run phase=${phase} files=${expanded.length} concurrency=${opts.concurrency ?? 2}`,
        );
        for (const f of expanded) {
          console.error(`  + ${f}`);
        }
      }
      return {
        stageDir: opts.stageDir ?? opts.wikiDir ?? "(dry-run)",
        members: [],
        phasesRun: [],
        errors: 0,
      };
    }

    const { stageDir, ephemeral } = resolveStageDir(opts, phase);
    ensureStageDirs(stageDir);
    const keepStage =
      !ephemeral ||
      opts.keepStageDir === true ||
      opts.keepWikiDir === true ||
      Boolean(opts.stageDir?.trim() || opts.wikiDir?.trim());

    const ocrEnabled = resolveParseOcrEnabled(
      { noOcr: opts.noOcr, ocr: opts.ocr },
      project,
    );

    if (!opts.quiet && (phase === "parse" || phase === "all")) {
      const engineLabel =
        project.parser.mode === "auto" ? "auto" : project.parser.engine;
      printParseHeader({
        command: phase === "all" ? "pack" : "stage",
        engine: engineLabel,
        mode: project.parser.mode,
        ocr: ocrEnabled,
        format: "markdown",
        ocrLanguage:
          opts.ocrLanguage ?? project.parser.liteparse.ocrLanguage ?? "eng",
        ocrServerUrl: opts.ocrServerUrl,
        tessdataPath: ocrEnabled ? resolveTessdataPath() : undefined,
        maxPages: opts.maxPages ?? project.parser.liteparse.maxPages,
        dpi: opts.dpi ?? project.parser.liteparse.dpi,
        targetPages: opts.targetPages,
        llamaTier: project.parser.llamaparse.tier,
        escalateNeedsOcrRatio: project.parser.escalate.minNeedsOcrRatio,
        escalateLayoutRatio: project.parser.escalate.minLayoutComplexRatio,
        fileCount: expanded.length,
        extra: {
          okfAi: useAi,
          concurrency: opts.concurrency ?? 2,
          phase,
        },
      });
    }

    const phasesRun: PipelinePhase[] = [];
    let members: StageResult["members"] = [];
    let errors = 0;
    let outputPath: string | undefined;

    const runParseOkf = async (mode: "both" | "parse" | "okf") => {
      const result = await runParseAndOkfPhase({
        files: expanded,
        stageDir,
        opts,
        project,
        useAi,
        parseOnly: mode === "parse",
        okfOnly: mode === "okf",
      });
      members = result.members;
      errors += result.errors;
    };

    try {
      if (phase === "parse") {
        phasesRun.push("parse");
        await runParseOkf("parse");
      } else if (phase === "okf") {
        phasesRun.push("okf");
        await runParseOkf("okf");
        if (opts.noManifest !== true) {
          phasesRun.push("manifest");
          await runManifestPhaseForFiles({
            inputDir: inputDirFor(expanded),
            stageDir,
            opts,
          });
        }
      } else if (phase === "manifest") {
        phasesRun.push("manifest");
        await runManifestPhaseForFiles({
          inputDir: inputDirFor(expanded),
          stageDir,
          opts,
        });
      } else if (phase === "compress") {
        phasesRun.push("compress");
        // Reload members from stage parses
        members = expanded.map((abs) => ({
          abs,
          originalName: basename(abs),
          documentType: "Generic" as const,
        }));
        outputPath = resolveOutputPath(expanded, opts);
        const omitOriginalDocuments = resolveOmitOriginalDocuments({
          cli: opts.omitOriginalDocuments,
          onboarding,
          pack: project.pack,
        });
        runCompressPhase({
          members,
          stageDir,
          outputPath,
          opts,
          project,
          omitOriginalDocuments,
          title: stripPackageExtension(basename(outputPath)) || "bundle",
          inputRoots,
        });
      } else {
        // all
        if (opts.noOkf === true) {
          phasesRun.push("parse");
          await runParseOkf("parse");
          // Drop any leftover stage OKF so compress does not pack it.
          try {
            rmSync(join(stageDir, "wiki", "okf"), {
              recursive: true,
              force: true,
            });
          } catch {
            /* ignore */
          }
        } else {
          phasesRun.push("parse", "okf");
          await runParseOkf("both");
        }

        const stopBeforeZip = opts.noZip === true;
        if (!stopBeforeZip) {
          // Manifest is embedded by writeNzipCollectionBundle; still write
          // stage manifest for inspection when keeping stage dir.
          if (keepStage) {
            phasesRun.push("manifest");
            await runManifestPhaseForFiles({
              inputDir: inputDirFor(expanded),
              stageDir,
              opts,
            });
          }
          phasesRun.push("compress");
          outputPath = resolveOutputPath(expanded, opts);
          const omitOriginalDocuments = resolveOmitOriginalDocuments({
            cli: opts.omitOriginalDocuments,
            onboarding,
            pack: project.pack,
          });
          runCompressPhase({
            members,
            stageDir,
            outputPath,
            opts,
            project,
            omitOriginalDocuments,
            title: stripPackageExtension(basename(outputPath)) || "bundle",
            inputRoots,
          });
        } else {
          phasesRun.push("manifest");
          await runManifestPhaseForFiles({
            inputDir: inputDirFor(expanded),
            stageDir,
            opts,
          });
        }
      }

      const succeeded = members.filter((m) => m && !m.error).length;
      // Partial success is OK unless --fail-fast (which already threw).
      // Exit non-zero only when every file failed (nothing useful produced).
      if (errors > 0 && succeeded === 0) {
        process.exitCode = 1;
      }

      if (outputPath && opts.testIntegrity && !opts.dryRun) {
        runTestCommand(outputPath, { quiet: opts.quiet });
      }

      if (outputPath && !opts.dryRun) {
        runListCommand(outputPath, {
          verbose: true,
          quiet: true,
        });
        let originalBytes = 0;
        let documentCount = 0;
        for (const m of members) {
          if (!m?.abs || !existsSync(m.abs)) continue;
          try {
            const st = statSync(m.abs);
            if (!st.isFile()) continue;
            originalBytes += st.size;
            documentCount += 1;
          } catch {
            /* ignore */
          }
        }
        if (documentCount > 0) {
          const archiveBytes = statSync(outputPath).size;
          console.log(
            formatOriginalsSummary({
              documentCount,
              originalBytes,
              archiveBytes,
            }),
          );
        }
      }

      if (!opts.quiet && !outputPath) {
        console.error(
          `[zipwiki] done phase=${phase} stage=${stageDir}` +
            (errors
              ? ` ok=${succeeded} errors=${errors}`
              : succeeded
                ? ` ok=${succeeded}`
                : ""),
        );
      }

      if (hosted) {
        await refreshAndPrintClientUsage("done", {
          quiet: opts.quiet,
          previous: hosted.config,
        });
      }

      return { stageDir, outputPath, members, phasesRun, errors };
    } finally {
      if (ephemeral && !keepStage) {
        try {
          rmSync(stageDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    fail(err);
  }
}
