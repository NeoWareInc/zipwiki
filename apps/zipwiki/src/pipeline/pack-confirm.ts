/**
 * Interactive gate before a pack writes a .zipwiki.
 * Prints the plan, then asks to proceed, change this run's settings, or abort.
 */
import * as p from "@clack/prompts";
import { statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { StageOptions } from "./types.js";
import { isInteractiveTty } from "../interactive/tty.js";

export type PackOkfMode = "ai" | "fallback" | "off";

export type PackPlanSettings = {
  output?: string;
  recurse: boolean;
  omitOriginalDocuments: boolean;
  okf: PackOkfMode;
  compression: "zstd" | "deflate" | "store";
  parser: "liteparse" | "llamaparse";
};

export type PackPlan = PackPlanSettings & {
  outputPath?: string;
  files: string[];
  fileBytes: number;
  level?: number;
  phase: string;
};

const FILE_LIST_CAP = 15;

export class PackAbortedError extends Error {
  constructor() {
    super("Pack aborted.");
    this.name = "PackAbortedError";
  }
}

export function packOkfMode(opts: StageOptions, useAi: boolean): PackOkfMode {
  if (opts.noOkf === true) return "off";
  if (opts.noAiOkf === true || !useAi) return "fallback";
  return "ai";
}

/** True when a TTY pack should stop for proceed / change / abort. */
export function shouldConfirmPack(input: {
  phase: string;
  noZip?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  interactive?: boolean;
}): boolean {
  const writesZip =
    input.phase === "compress" ||
    (input.phase === "all" && input.noZip !== true);
  if (!writesZip || input.dryRun === true || input.yes === true) return false;
  return input.interactive ?? isInteractiveTty();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function displayPath(abs: string): string {
  const rel = relative(process.cwd(), abs);
  if (!rel || rel.startsWith("..")) return abs;
  return rel;
}

export function fileBytes(files: string[]): number {
  let total = 0;
  for (const file of files) {
    try {
      const st = statSync(file);
      if (st.isFile()) total += st.size;
    } catch {
      /* missing inputs are reported elsewhere */
    }
  }
  return total;
}

function okfLabel(mode: PackOkfMode): string {
  if (mode === "off") return "skipped";
  if (mode === "fallback") return "deterministic (no AI)";
  return "AI enrichment";
}

/** Configuration and file list printed after the parse session header. */
export function formatPackPlan(plan: PackPlan): string {
  const lines = [
    "[zipwiki] ────────────────────────────────",
    `[zipwiki] output      ${plan.outputPath ? displayPath(plan.outputPath) : "(set -o, or change settings)"}`,
    `[zipwiki] files       ${plan.files.length} (${formatBytes(plan.fileBytes)})`,
    `[zipwiki] contents    ${plan.omitOriginalDocuments ? "parsed text only" : "parsed text + original files"}`,
    `[zipwiki] okf         ${okfLabel(plan.okf)}`,
    `[zipwiki] compression ${plan.compression}${plan.level !== undefined ? ` ${plan.level}` : ""}`,
    `[zipwiki] recurse     ${plan.recurse ? "on" : "off"}`,
    `[zipwiki] parser      ${plan.parser}`,
    "[zipwiki] ────────────────────────────────",
  ];
  const shown = plan.files.slice(0, FILE_LIST_CAP);
  for (const file of shown) {
    lines.push(`  ${displayPath(file)}`);
  }
  const rest = plan.files.length - shown.length;
  if (rest > 0) lines.push(`  … and ${rest} more`);
  return lines.join("\n");
}

function cancelMeansAbort(value: unknown): boolean {
  return p.isCancel(value);
}

async function promptPackAction(): Promise<"proceed" | "change" | "abort"> {
  const choice = await p.select({
    message: "Create this .zipwiki?",
    options: [
      { value: "proceed", label: "Proceed" },
      { value: "change", label: "Change settings" },
      { value: "abort", label: "Abort" },
    ],
    initialValue: "proceed",
  });
  if (cancelMeansAbort(choice)) return "abort";
  return choice as "proceed" | "change" | "abort";
}

async function promptPackSettings(
  current: PackPlanSettings,
): Promise<PackPlanSettings | "abort"> {
  const next = { ...current };
  for (;;) {
    const which = await p.select({
      message: "Change a setting for this pack",
      options: [
        {
          value: "output",
          label: "Output .zipwiki",
          hint: next.output ? displayPath(resolve(next.output)) : "not set",
        },
        {
          value: "recurse",
          label: "Recurse into directories",
          hint: next.recurse ? "on" : "off",
        },
        {
          value: "contents",
          label: "Original files in the archive",
          hint: next.omitOriginalDocuments ? "parsed text only" : "include originals",
        },
        {
          value: "okf",
          label: "OKF enrichment",
          hint: okfLabel(next.okf),
        },
        {
          value: "compression",
          label: "ZIP compression",
          hint: next.compression,
        },
        {
          value: "parser",
          label: "Document parser",
          hint: next.parser,
        },
        { value: "done", label: "Done" },
      ],
    });
    if (cancelMeansAbort(which)) return "abort";
    if (which === "done") return next;

    if (which === "output") {
      const value = await p.text({
        message: "Output .zipwiki path",
        initialValue: next.output ?? "",
        validate: (v) => {
          if (!String(v ?? "").trim()) return "Required";
        },
      });
      if (cancelMeansAbort(value)) return "abort";
      next.output = String(value).trim();
      continue;
    }
    if (which === "recurse") {
      const value = await p.confirm({
        message: "Recurse into subdirectories?",
        initialValue: next.recurse,
      });
      if (cancelMeansAbort(value)) return "abort";
      next.recurse = value === true;
      continue;
    }
    if (which === "contents") {
      const value = await p.select({
        message: "PDF/DOCX/etc in the archive",
        options: [
          { value: "extract", label: "Parsed text only" },
          { value: "both", label: "Parsed text and original file" },
        ],
        initialValue: next.omitOriginalDocuments ? "extract" : "both",
      });
      if (cancelMeansAbort(value)) return "abort";
      next.omitOriginalDocuments = value === "extract";
      continue;
    }
    if (which === "okf") {
      const value = await p.select({
        message: "OKF enrichment",
        options: [
          { value: "ai", label: "AI enrichment" },
          { value: "fallback", label: "Deterministic metadata only" },
          { value: "off", label: "Skip OKF" },
        ],
        initialValue: next.okf,
      });
      if (cancelMeansAbort(value)) return "abort";
      next.okf = value as PackOkfMode;
      continue;
    }
    if (which === "compression") {
      const value = await p.select({
        message: "ZIP compression",
        options: [
          { value: "zstd", label: "zstd" },
          { value: "deflate", label: "deflate" },
          { value: "store", label: "store" },
        ],
        initialValue: next.compression,
      });
      if (cancelMeansAbort(value)) return "abort";
      next.compression = value as PackPlanSettings["compression"];
      continue;
    }
    const value = await p.select({
      message: "Document parser",
      options: [
        { value: "liteparse", label: "LiteParse (local)" },
        { value: "llamaparse", label: "LlamaParse" },
      ],
      initialValue: next.parser,
    });
    if (cancelMeansAbort(value)) return "abort";
    next.parser = value as PackPlanSettings["parser"];
  }
}

/**
 * Print the plan, then wait. `printPlan` should include the header, configuration,
 * and file summary. Settings changes apply to this run only.
 */
export async function runPackConfirmLoop(input: {
  printPlan: () => void;
  current: () => PackPlanSettings;
  apply: (next: PackPlanSettings) => void | Promise<void>;
}): Promise<void> {
  for (;;) {
    input.printPlan();
    const action = await promptPackAction();
    if (action === "proceed") return;
    if (action === "abort") throw new PackAbortedError();
    const next = await promptPackSettings(input.current());
    if (next === "abort") throw new PackAbortedError();
    await input.apply(next);
  }
}
