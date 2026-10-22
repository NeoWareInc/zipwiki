/**
 * Resolve the pack plan shown in chat as a markdown table before packing.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  isLlamaCloudConfigured,
  isZipwikiAccountConnected,
  loadCachedAccountSettings,
  resolveOmitOriginalDocuments,
  resolveOkfCredentialSource,
  resolveParseCredentialSource,
} from "@zipwiki/zipwiki/config";

/** Hosted multipart parse commonly fails (413) well below this for large PDFs. */
export const LARGE_REMOTE_PARSE_BYTES = 25 * 1024 * 1024;

const PREVIEW_STOP_MESSAGE =
  "STOP. Paste displayForUser into the chat as a markdown table for the human. " +
  "Wait for their next message. Only after they approve (yes / pack) call pack again " +
  "with confirm:true and humanApproved:true (and any setting changes they asked for). " +
  "Do not invent humanApproved in this same turn.";

export type McpPackArgs = {
  source: string;
  output?: string;
  /** Default false: show the table plan only. true: pack after humanApproved. */
  confirm?: boolean;
  /**
   * Set true only after the human approved the table in a later chat message.
   * Required with confirm:true.
   */
  humanApproved?: boolean;
  /** @deprecated Ignored — use confirm:false (default) for preview. */
  previewOnly?: boolean;
  noAiOkf?: boolean;
  useZipcodexOkf?: boolean;
  noOkf?: boolean;
  noOcr?: boolean;
  recurse?: boolean;
  omitOriginal?: boolean;
  parser?: "liteparse" | "llamaparse";
  parseCredential?: "local" | "zipwiki" | "llama";
  llamaTier?: string;
  origins?: string;
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
  originDrive?: boolean;
  originRecord?: "manifest" | "cd" | "both";
  sha256Extra?: boolean;
  originSha256?: boolean;
  okfProfile?: "auto" | "book" | "legislation" | "invoice";
};

export type PackPlanSnapshot = {
  source: string;
  sourceBytes: number;
  fileCount: number;
  output: string;
  accountEmail: string | null;
  parser: "liteparse" | "llamaparse";
  parseCredential: "local" | "zipwiki" | "llama";
  llamaTier: string | null;
  okf: "ai" | "fallback" | "off";
  omitOriginalDocuments: boolean;
  recurse: boolean;
  noOcr: boolean;
  okfProfile: string;
  origins: string | null;
  originPattern: string | null;
  originUrlTemplate: string | null;
  originFile: boolean;
  originDrive: boolean;
};

export type PackPlanPreview = {
  status: "preview";
  awaitingHumanApproval: true;
  /** Paste this markdown table into the chat. */
  displayForUser: string;
  cliCommand: string;
  message: string;
  agentInstruction: string;
  plan: PackPlanSnapshot;
  warnings: string[];
  suggestedArgs: Omit<McpPackArgs, "confirm" | "humanApproved" | "previewOnly">;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveSourceAbs(source: string): string {
  return isAbsolute(source) ? source : resolve(process.cwd(), source);
}

function defaultOutput(sourceAbs: string, output?: string): string {
  const trimmed = output?.trim();
  if (trimmed) {
    return isAbsolute(trimmed) ? trimmed : resolve(process.cwd(), trimmed);
  }
  return join(dirname(sourceAbs), `${basename(sourceAbs)}.zipwiki`);
}

function measureSource(sourceAbs: string): { bytes: number; fileCount: number } {
  const st = statSync(sourceAbs);
  if (st.isFile()) return { bytes: st.size, fileCount: 1 };
  if (!st.isDirectory()) return { bytes: 0, fileCount: 0 };
  let bytes = 0;
  let fileCount = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "." || name === "..") continue;
      const path = join(dir, name);
      let child;
      try {
        child = statSync(path);
      } catch {
        continue;
      }
      if (child.isFile()) {
        bytes += child.size;
        fileCount += 1;
      } else if (child.isDirectory()) {
        walk(path);
      }
    }
  };
  walk(sourceAbs);
  return { bytes, fileCount };
}

function okfLabel(mode: PackPlanSnapshot["okf"]): string {
  if (mode === "off") return "skipped";
  if (mode === "fallback") return "deterministic (no AI)";
  return "AI enrichment";
}

/** Shell-quote a path/arg for copy-paste into a terminal. */
export function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Equivalent `zipwiki pack` for this plan (`--yes` skips the CLI confirm). */
export function formatPackCliCommand(plan: PackPlanSnapshot): string {
  const parts = ["zipwiki", "pack", "--yes"];
  parts.push("--parser", plan.parser);
  parts.push("--parse-credential", plan.parseCredential);
  if (plan.parser === "llamaparse" && plan.llamaTier) {
    parts.push("--llama-tier", plan.llamaTier);
  }
  if (plan.omitOriginalDocuments) parts.push("--omit-original");
  if (plan.recurse) parts.push("--recurse");
  if (plan.noOcr) parts.push("--no-ocr");
  if (plan.okf === "fallback") parts.push("--no-ai-okf");
  if (plan.okf === "off") parts.push("--no-okf");
  if (plan.okfProfile && plan.okfProfile !== "auto") {
    parts.push("--okf-profile", plan.okfProfile);
  }
  if (plan.origins) parts.push("--origins", plan.origins);
  if (plan.originPattern) parts.push("--origin-pattern", plan.originPattern);
  if (plan.originUrlTemplate) {
    parts.push("--origin-url-template", plan.originUrlTemplate);
  }
  if (plan.originFile) parts.push("--origin-file");
  if (plan.originDrive) parts.push("--origin-drive");
  parts.push("-o", plan.output);
  parts.push(plan.source);
  return parts.map(shellQuote).join(" ");
}

/** Nice markdown table for chat confirmation. */
export function formatPackPlanDisplay(
  plan: PackPlanSnapshot,
  warnings: string[],
  cliCommand: string = formatPackCliCommand(plan),
): string {
  const lines = [
    "### ZipWiki pack plan — please confirm",
    "",
    `| | |`,
    `| --- | --- |`,
    `| Source | \`${plan.source}\` |`,
    `| Files | ${plan.fileCount} (${formatBytes(plan.sourceBytes)}) |`,
    `| Output | \`${plan.output}\` |`,
    `| Account | ${plan.accountEmail ?? "(not signed in)"} |`,
    `| Parser | ${plan.parser}${plan.llamaTier ? ` · ${plan.llamaTier}` : ""} |`,
    `| Parse credentials | ${plan.parseCredential} |`,
    `| Contents | ${plan.omitOriginalDocuments ? "parsed text only" : "parsed text + originals"} |`,
    `| OKF | ${okfLabel(plan.okf)} · profile ${plan.okfProfile} |`,
    `| Recurse | ${plan.recurse ? "on" : "off"} |`,
    `| OCR | ${plan.noOcr ? "off" : "on"} |`,
  ];
  if (plan.origins || plan.originFile || plan.originDrive || plan.originPattern) {
    lines.push(
      `| Origin | ${[
        plan.origins,
        plan.originPattern,
        plan.originUrlTemplate,
        plan.originFile ? "file: URI" : null,
        plan.originDrive ? "Google Drive" : null,
      ]
        .filter(Boolean)
        .join(" · ")} |`,
    );
  }
  if (warnings.length > 0) {
    lines.push("", "**Warnings**");
    for (const w of warnings) lines.push(`- ${w}`);
  }
  lines.push(
    "",
    "**CLI** (copy if you want to run it yourself)",
    "",
    "```bash",
    cliCommand,
    "```",
    "",
    "Reply **yes** / **pack** to create this archive, or say what to change.",
  );
  return lines.join("\n");
}

export function resolvePackPlanPreview(args: McpPackArgs): PackPlanPreview {
  const sourceAbs = resolveSourceAbs(args.source);
  if (!existsSync(sourceAbs)) {
    throw new Error(`Source not found: ${sourceAbs}`);
  }
  const { bytes: sourceBytes, fileCount } = measureSource(sourceAbs);
  const cached = loadCachedAccountSettings();
  const settings = cached?.settings;

  const cliParser = args.parser;
  let parser: "liteparse" | "llamaparse" =
    cliParser === "liteparse" || cliParser === "llamaparse"
      ? cliParser
      : settings?.parser?.engine === "llamaparse"
        ? "llamaparse"
        : "liteparse";

  let parseCredential: "local" | "zipwiki" | "llama" =
    args.parseCredential === "local" ||
    args.parseCredential === "zipwiki" ||
    args.parseCredential === "llama"
      ? args.parseCredential
      : resolveParseCredentialSource();

  if (cliParser === "liteparse") {
    parser = "liteparse";
    parseCredential = "local";
  } else if (cliParser === "llamaparse") {
    parser = "llamaparse";
    if (args.parseCredential) {
      parseCredential = args.parseCredential;
    } else if (isLlamaCloudConfigured()) {
      parseCredential = "llama";
    } else if (isZipwikiAccountConnected()) {
      parseCredential = "zipwiki";
    }
  } else if (parseCredential === "zipwiki" || parseCredential === "llama") {
    parser = "llamaparse";
  }

  const omitOriginalDocuments = resolveOmitOriginalDocuments({
    cli: args.omitOriginal,
    pack: {
      omitOriginalDocuments: settings?.pack?.omitOriginalDocuments,
    },
  });

  const useZipcodexOkf = args.useZipcodexOkf === true;
  const noAiOkf = useZipcodexOkf ? false : (args.noAiOkf ?? false);
  let okf: "ai" | "fallback" | "off" = "ai";
  if (args.noOkf === true) okf = "off";
  else if (noAiOkf) okf = "fallback";
  else if (
    settings?.okf?.useAi === false &&
    !useZipcodexOkf &&
    resolveOkfCredentialSource() !== "zipwiki" &&
    resolveOkfCredentialSource() !== "anthropic"
  ) {
    okf = "fallback";
  }

  const recurse =
    args.recurse === true || settings?.pack?.recurse === true || false;
  const llamaTier =
    parser === "llamaparse"
      ? (args.llamaTier?.trim() ||
          settings?.parser?.llamaparse?.tier ||
          "cost_effective")
      : null;
  const output = defaultOutput(sourceAbs, args.output);

  const warnings: string[] = [];
  if (
    sourceBytes >= LARGE_REMOTE_PARSE_BYTES &&
    parser === "llamaparse" &&
    parseCredential === "zipwiki"
  ) {
    warnings.push(
      `Source is ${formatBytes(sourceBytes)}. ZipWiki hosted parse often returns 413 Payload Too Large for big PDFs. Prefer parser=liteparse (local) or parseCredential=llama with a local LlamaParse key.`,
    );
  }
  if (parser === "llamaparse" && parseCredential === "zipwiki") {
    warnings.push(
      "Hosted LlamaParse uses ZipWiki credits and uploads the full file to the API.",
    );
  }
  if (okf === "ai") {
    warnings.push(
      "AI OKF during pack uses hosted/BYO LLM credits when configured.",
    );
  }
  if (!cached) {
    warnings.push(
      "No cached account settings — plan uses CLI defaults until zipwiki login syncs portal settings.",
    );
  }

  const plan: PackPlanSnapshot = {
    source: sourceAbs,
    sourceBytes,
    fileCount,
    output,
    accountEmail: cached?.email?.trim() || null,
    parser,
    parseCredential,
    llamaTier,
    okf,
    omitOriginalDocuments,
    recurse,
    noOcr: args.noOcr === true,
    okfProfile: args.okfProfile ?? "auto",
    origins: args.origins?.trim() || null,
    originPattern: args.originPattern?.trim() || null,
    originUrlTemplate: args.originUrlTemplate?.trim() || null,
    originFile: args.originFile === true,
    originDrive: args.originDrive === true,
  };

  const suggestedArgs: Omit<
    McpPackArgs,
    "confirm" | "humanApproved" | "previewOnly"
  > = {
    ...args,
    source: sourceAbs,
    output,
    parser,
    parseCredential,
    omitOriginal: omitOriginalDocuments,
    noAiOkf,
    useZipcodexOkf,
    recurse,
    ...(llamaTier ? { llamaTier } : {}),
    ...(args.okfProfile ? { okfProfile: args.okfProfile } : {}),
  };

  const cliCommand = formatPackCliCommand(plan);
  return {
    status: "preview",
    awaitingHumanApproval: true,
    displayForUser: formatPackPlanDisplay(plan, warnings, cliCommand),
    cliCommand,
    message: PREVIEW_STOP_MESSAGE,
    agentInstruction: PREVIEW_STOP_MESSAGE,
    plan,
    warnings,
    suggestedArgs,
  };
}

/** Preview (table) unless confirm:true. */
export function isPackPreviewOnly(args: McpPackArgs): boolean {
  if (args.previewOnly === true) return true;
  if (args.confirm === true) return false;
  return true;
}
