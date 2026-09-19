import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadEnvFiles } from "./env.js";
import {
  DEFAULT_ZIPWIKI_CONFIG,
  ZipwikiConfigSchema,
  type ParseEngineId,
  type ParserMode,
  type ResolvedZipwikiConfig,
  type ZipwikiConfig,
  type ZipwikiConfigInput,
} from "./schema.js";

export const CONFIG_FILENAME = "zipwiki.config.json";

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  overlay: Partial<T> | undefined,
): T {
  if (!overlay) return structuredClone(base);
  const out = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    const prev = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      out[key] = deepMerge(
        prev as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Walk from `startDir` toward filesystem root looking for zipwiki.config.json. */
export function findConfigPath(startDir: string = process.cwd()): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function parseZipwikiConfigFile(raw: unknown): ZipwikiConfig {
  return ZipwikiConfigSchema.parse(stripDeprecatedConfigKeys(raw ?? {}));
}

/** Drop removed keys so older project configs still load. */
function stripDeprecatedConfigKeys(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const root = { ...(raw as Record<string, unknown>) };
  if (root.pack && typeof root.pack === "object" && !Array.isArray(root.pack)) {
    const pack = { ...(root.pack as Record<string, unknown>) };
    delete pack.keepStage;
    root.pack = pack;
  }
  return root;
}

export function readZipwikiConfigFile(path: string): ZipwikiConfig {
  const text = readFileSync(path, "utf-8");
  return parseZipwikiConfigFile(JSON.parse(text) as unknown);
}

/** CLI / programmatic overrides applied after env. */
export type ZipwikiConfigOverrides = {
  configPath?: string;
  parserEngine?: ParseEngineId;
  parserMode?: ParserMode;
  noAiOkf?: boolean;
  noOcr?: boolean;
  omitOriginalDocuments?: boolean;
  okfModel?: string;
  okfProvider?: string;
  /** Account settings mapped to config (wins over defaults, loses to project file). */
  accountOverlay?: ZipwikiConfigInput;
};

function envOverlay(): ZipwikiConfigInput {
  const overlay: ZipwikiConfigInput = {};
  const engine = process.env.ZIPWIKI_PARSER?.trim();
  const mode = process.env.ZIPWIKI_PARSER_MODE?.trim();
  const okfModel = process.env.ZIPWIKI_OKF_MODEL?.trim();
  const okfProvider = process.env.ZIPWIKI_OKF_PROVIDER?.trim();

  if (engine === "liteparse" || engine === "llamaparse") {
    overlay.parser = { ...(overlay.parser ?? {}), engine };
  }
  if (mode === "fixed" || mode === "auto") {
    overlay.parser = {
      ...(overlay.parser ?? {}),
      mode,
      escalate: {
        ...((overlay.parser as { escalate?: object } | undefined)?.escalate ??
          {}),
        enabled: mode === "auto",
      },
    };
  }
  if (okfModel) {
    overlay.okf = { ...(overlay.okf ?? {}), model: okfModel };
  }
  if (okfProvider) {
    overlay.okf = { ...(overlay.okf ?? {}), provider: okfProvider };
  }
  return overlay;
}

function cliOverlay(overrides: ZipwikiConfigOverrides): ZipwikiConfigInput {
  const overlay: ZipwikiConfigInput = {};
  if (overrides.parserEngine) {
    overlay.parser = { ...(overlay.parser ?? {}), engine: overrides.parserEngine };
  }
  if (overrides.parserMode) {
    overlay.parser = {
      ...(overlay.parser ?? {}),
      mode: overrides.parserMode,
      escalate: {
        enabled: overrides.parserMode === "auto",
      },
    };
  }
  if (overrides.noAiOkf === true) {
    overlay.okf = { ...(overlay.okf ?? {}), useAi: false };
  }
  if (overrides.noOcr !== undefined) {
    overlay.pack = { ...(overlay.pack ?? {}), noOcr: overrides.noOcr };
  }
  if (overrides.omitOriginalDocuments !== undefined) {
    overlay.pack = {
      ...(overlay.pack ?? {}),
      omitOriginalDocuments: overrides.omitOriginalDocuments,
    };
  }
  if (overrides.okfModel) {
    overlay.okf = { ...(overlay.okf ?? {}), model: overrides.okfModel };
  }
  if (overrides.okfProvider) {
    overlay.okf = { ...(overlay.okf ?? {}), provider: overrides.okfProvider };
  }
  return overlay;
}

function resolveFromPartials(
  account: ZipwikiConfigInput,
  fileConfig: ZipwikiConfig,
  env: ZipwikiConfigInput,
  cli: ZipwikiConfigInput,
): ResolvedZipwikiConfig {
  const merged = deepMerge(
    deepMerge(
      deepMerge(
        deepMerge(
          DEFAULT_ZIPWIKI_CONFIG as unknown as Record<string, unknown>,
          account as unknown as Record<string, unknown>,
        ),
        fileConfig as unknown as Record<string, unknown>,
      ),
      env as unknown as Record<string, unknown>,
    ),
    cli as unknown as Record<string, unknown>,
  ) as ResolvedZipwikiConfig;

  // Re-apply nested defaults for partially specified sections.
  merged.parser = {
    ...DEFAULT_ZIPWIKI_CONFIG.parser,
    ...merged.parser,
    liteparse: {
      ...DEFAULT_ZIPWIKI_CONFIG.parser.liteparse,
      ...merged.parser.liteparse,
    },
    llamaparse: {
      ...DEFAULT_ZIPWIKI_CONFIG.parser.llamaparse,
      ...merged.parser.llamaparse,
    },
    escalate: {
      ...DEFAULT_ZIPWIKI_CONFIG.parser.escalate,
      ...merged.parser.escalate,
      enabled:
        merged.parser.mode === "auto"
          ? true
          : (merged.parser.escalate?.enabled ??
            DEFAULT_ZIPWIKI_CONFIG.parser.escalate.enabled),
    },
  };
  merged.okf = { ...DEFAULT_ZIPWIKI_CONFIG.okf, ...merged.okf };
  merged.pack = { ...DEFAULT_ZIPWIKI_CONFIG.pack, ...merged.pack };
  merged.catalog = merged.catalog ?? {};
  merged.compression = merged.compression ?? {};
  merged.agent = merged.agent ?? {};
  return merged;
}

/**
 * Load ZipWiki config.
 * Precedence (later wins): defaults → account settings → project file → env → CLI.
 * Loads `.env` / `.env.local` from the project root before reading env.
 */
export function loadZipwikiConfig(
  overrides: ZipwikiConfigOverrides = {},
  startDir: string = process.cwd(),
): { config: ResolvedZipwikiConfig; configPath?: string } {
  loadEnvFiles(startDir);

  let configPath: string | undefined;
  if (overrides.configPath) {
    configPath = isAbsolute(overrides.configPath)
      ? overrides.configPath
      : resolve(startDir, overrides.configPath);
    if (!existsSync(configPath)) {
      throw new Error(`ZipWiki config not found: ${configPath}`);
    }
  } else {
    configPath = findConfigPath(startDir);
  }

  const fileConfig = configPath
    ? readZipwikiConfigFile(configPath)
    : ZipwikiConfigSchema.parse({});

  const accountLayer = overrides.accountOverlay ?? {};

  // When account settings drive prefs, skip env overlay for parser/okf so
  // stale home ZIPWIKI_PARSER* do not beat the account+project merge.
  // Shell env still applies when no account overlay is provided.
  const useEnvOverlay = !overrides.accountOverlay;

  const config = resolveFromPartials(
    accountLayer,
    fileConfig,
    useEnvOverlay ? envOverlay() : {},
    cliOverlay(overrides),
  );
  return { config, configPath };
}

export function isLlamaCloudConfigured(): boolean {
  loadEnvFiles();
  return Boolean(process.env.LLAMA_CLOUD_API_KEY?.trim());
}
