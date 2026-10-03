/**
 * Pure helpers for the Create ZipWiki command builder (MCP prompt + CLI).
 */

import {
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettingsBody,
} from "@zipwiki/api-client";

export const OKF_PROFILES = ["auto", "book", "legislation", "invoice"] as const;
export type OkfProfile = (typeof OKF_PROFILES)[number];

export const CLI_PREFIXES = ["zipwiki", "pnpm zipwiki --"] as const;
export type CliPrefix = (typeof CLI_PREFIXES)[number];

export type CompressionAlg = "zstd" | "deflate" | "store";

export type PackBuilderState = {
  sourcePaths: string[];
  output: string;
  recurse: boolean;
  omitOriginal: boolean;
  noAiOkf: boolean;
  noOkf: boolean;
  noOcr: boolean;
  compression: CompressionAlg;
  level: number;
  okfProfile: OkfProfile;
  cliPrefix: CliPrefix;
  /** Extra Field 0x014F URI template, e.g. https://host/{year}/{chapter} */
  originUrlTemplate: string;
  /** Filename regex; named groups fill originUrlTemplate */
  originPattern: string;
  /** Store file: URI for each omitted original */
  originFile: boolean;
};

/**
 * Create-page defaults for end users:
 * - sources under ./knowledge
 * - AI OKF on (never skip by default)
 * - omit original document bytes (parsed + OKF stay in the package)
 * - installed `zipwiki` binary (not the monorepo pnpm wrapper)
 */
export function defaultPackBuilderState(): PackBuilderState {
  const pack = DEFAULT_ACCOUNT_SETTINGS.pack;
  return {
    sourcePaths: ["./knowledge"],
    output: "./knowledge/my-docs.zipwiki",
    recurse: true,
    omitOriginal: pack.omitOriginalDocuments !== false,
    noAiOkf: false,
    noOkf: false,
    noOcr: pack.noOcr === true,
    compression: (pack.compression ?? "zstd") as CompressionAlg,
    level: pack.level ?? 7,
    okfProfile: "auto",
    cliPrefix: "zipwiki",
    originUrlTemplate: "",
    originPattern: "",
    originFile: false,
  };
}

/** Overlay account Knowledge Archive pack settings onto the builder. */
export function applyAccountSettingsToPackBuilder(
  state: PackBuilderState,
  settings: AccountSettingsBody | null | undefined,
): PackBuilderState {
  if (!settings?.pack) return state;
  const pack = settings.pack;
  return {
    ...state,
    recurse: pack.recurse === true,
    omitOriginal: pack.omitOriginalDocuments !== false,
    noOcr: pack.noOcr === true,
    compression: (pack.compression ?? state.compression) as CompressionAlg,
    level:
      typeof pack.level === "number" && Number.isFinite(pack.level)
        ? Math.min(9, Math.max(0, Math.trunc(pack.level)))
        : state.level,
    // Skip AI OKF only when the account explicitly disables AI OKF.
    noAiOkf: settings.okf?.useAi === false,
  };
}

/** Shell-escape a single argument for POSIX-like shells. */
export function shellEscape(arg: string): string {
  if (arg.length === 0) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function cleanSources(paths: string[]): string[] {
  return paths.map((p) => p.trim()).filter(Boolean);
}

export function buildCliPackCommand(state: PackBuilderState): string {
  const sources = cleanSources(state.sourcePaths);
  const parts: string[] = [state.cliPrefix, "pack"];
  for (const src of sources) {
    parts.push(shellEscape(src));
  }
  const out = state.output.trim();
  if (out) {
    parts.push("-o", shellEscape(out));
  }
  if (state.recurse) parts.push("-r");
  if (state.omitOriginal) parts.push("--omit-original");
  if (state.noOkf) {
    parts.push("--no-okf");
  } else if (state.noAiOkf) {
    parts.push("--no-ai-okf");
  }
  if (state.noOcr) parts.push("--no-ocr");
  if (state.compression !== "zstd") {
    parts.push("--compression", state.compression);
  }
  if (state.level !== 7) {
    parts.push("--level", String(state.level));
  }
  if (state.okfProfile !== "auto") {
    parts.push("--okf-profile", state.okfProfile);
  }
  const originTpl = state.originUrlTemplate.trim();
  const originPat = state.originPattern.trim();
  if (originPat) {
    parts.push("--origin-pattern", shellEscape(originPat));
  }
  if (originTpl) {
    parts.push("--origin-url-template", shellEscape(originTpl));
  }
  if (state.originFile) {
    parts.push("--origin-file");
  }
  return parts.join(" ");
}

export type McpPackArgs = {
  source: string;
  output?: string;
  noAiOkf?: boolean;
  noOkf?: boolean;
  noOcr?: boolean;
  recurse?: boolean;
  okfProfile?: OkfProfile;
  originPattern?: string;
  originUrlTemplate?: string;
  originFile?: boolean;
};

/**
 * MCP pack tool args for the first source — only fields that override
 * product/MCP defaults (AI OKF on, no OKF skip, OCR on, profile auto).
 */
export function buildMcpPackArgs(state: PackBuilderState): McpPackArgs {
  const sources = cleanSources(state.sourcePaths);
  const args: McpPackArgs = {
    source: sources[0] ?? "",
  };
  const out = state.output.trim();
  if (out) args.output = out;
  if (state.recurse) args.recurse = true;
  if (state.noOkf) {
    args.noOkf = true;
  } else if (state.noAiOkf) {
    args.noAiOkf = true;
  }
  if (state.noOcr) args.noOcr = true;
  if (state.okfProfile !== "auto") args.okfProfile = state.okfProfile;
  const originTpl = state.originUrlTemplate.trim();
  const originPat = state.originPattern.trim();
  if (originPat) args.originPattern = originPat;
  if (originTpl) args.originUrlTemplate = originTpl;
  if (state.originFile) args.originFile = true;
  return args;
}

/**
 * Short agent prompt: pack paths + only overrides vs Create-page defaults.
 */
export function buildMcpPackPrompt(state: PackBuilderState): string {
  const defaults = defaultPackBuilderState();
  const sources = cleanSources(state.sourcePaths);
  const source = sources[0] ?? "(source path)";
  const out = state.output.trim() || defaults.output;

  const overrides: string[] = [];
  if (state.recurse !== defaults.recurse) {
    overrides.push(state.recurse ? "recurse" : "do not recurse");
  }
  if (state.omitOriginal !== defaults.omitOriginal) {
    overrides.push(
      state.omitOriginal
        ? "omit original documents"
        : "include original documents",
    );
  }
  if (state.noOkf && state.noOkf !== defaults.noOkf) {
    overrides.push("skip OKF entirely");
  } else if (state.noAiOkf && state.noAiOkf !== defaults.noAiOkf) {
    overrides.push("skip AI OKF, then okf_enrich");
  }
  if (state.noOcr && state.noOcr !== defaults.noOcr) {
    overrides.push("no OCR");
  }
  if (state.okfProfile !== defaults.okfProfile) {
    overrides.push(`okfProfile "${state.okfProfile}"`);
  }
  const originTpl = state.originUrlTemplate.trim();
  const originPat = state.originPattern.trim();
  if (originPat) {
    overrides.push(`originPattern ${JSON.stringify(originPat)}`);
  }
  if (originTpl) {
    overrides.push(`originUrlTemplate ${JSON.stringify(originTpl)}`);
  }
  if (state.originFile) {
    overrides.push("originFile");
  }

  let prompt = `Using ZipWiki MCP, pack "${source}" into ${out}`;
  if (overrides.length > 0) {
    prompt += ` (${overrides.join("; ")})`;
  }
  if (sources.length > 1) {
    prompt += `. Extra sources: ${sources
      .slice(1)
      .map((s) => `"${s}"`)
      .join(", ")}`;
  }
  return `${prompt}.`;
}
