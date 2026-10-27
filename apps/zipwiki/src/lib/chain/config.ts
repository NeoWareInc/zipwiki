/**
 * Non-secret blockchain settings: `~/.zipwiki/chain.json`.
 *
 * Secrets (wallet key, Token Service access token) come from the environment
 * only and are never written to disk by ZipWiki, to a `.zipwiki`, or to
 * `chain.json`. The OS keychain is never touched.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { zipwikiHomeDir } from "../config/home.js";

export const CHAIN_CONFIG_FILENAME = "chain.json";
export const DEFAULT_CHAIN_NETWORK = "base-sepolia";
export const CHAIN_NETWORKS = ["base-sepolia", "base"] as const;

/** Everything persisted in chain.json. Nothing here is a secret. */
export type ChainFileConfig = {
  network?: string;
  email?: string;
  tokenServiceUrl?: string;
};

const FILE_KEYS = ["network", "email", "tokenServiceUrl"] as const;

/** Public fields from `loadNeozipConnection()` (secrets included only from env). */
export type NeozipConnectionLike = {
  email?: string;
  accessToken?: string;
  walletPrivateKey?: string;
  network?: string;
  tokenServiceUrl?: string;
} | null;

export type ChainSettingSource = "arg" | "env" | "chain.json" | "neozip" | "default";

export type ChainSettings = {
  network: string;
  email?: string;
  tokenServiceUrl?: string;
  /** Wallet private key. Never persisted. */
  walletKey?: string;
  /** Token Service bearer. Never persisted. */
  accessToken?: string;
  sources: {
    network: ChainSettingSource;
    email?: ChainSettingSource;
    tokenServiceUrl?: ChainSettingSource;
    walletKey?: "arg" | "env" | "neozip";
    accessToken?: "arg" | "env" | "neozip";
  };
};

export type ChainOverrides = {
  network?: string;
  email?: string;
  tokenServiceUrl?: string;
  walletKey?: string;
  accessToken?: string;
};

export type ResolveChainSettingsOptions = {
  overrides?: ChainOverrides;
  env?: NodeJS.ProcessEnv;
  /** Test double; default lazily imports `neozip-blockchain/node`. */
  loadConnection?: () => Promise<NeozipConnectionLike> | NeozipConnectionLike;
  /** Skip the `~/.neozip/connection` merge. */
  skipNeozipConnection?: boolean;
};

export function chainConfigPath(): string {
  return join(zipwikiHomeDir(), CHAIN_CONFIG_FILENAME);
}

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

/** Keep only known non-secret string fields. */
export function sanitizeChainFileConfig(raw: unknown): ChainFileConfig {
  const out: ChainFileConfig = {};
  if (!raw || typeof raw !== "object") return out;
  const rec = raw as Record<string, unknown>;
  for (const key of FILE_KEYS) {
    const v = clean(rec[key]);
    if (v) out[key] = v;
  }
  return out;
}

export function loadChainConfig(path: string = chainConfigPath()): ChainFileConfig {
  if (!existsSync(path)) return {};
  try {
    return sanitizeChainFileConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

/** Merge `patch` into chain.json (empty string deletes a key). Returns saved config. */
export function saveChainConfig(
  patch: ChainFileConfig,
  path: string = chainConfigPath(),
): ChainFileConfig {
  const next: ChainFileConfig = { ...loadChainConfig(path) };
  for (const key of FILE_KEYS) {
    if (!(key in patch)) continue;
    const v = clean(patch[key]);
    if (v) next[key] = v;
    else delete next[key];
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best effort */
  }
  return next;
}

async function defaultLoadConnection(): Promise<NeozipConnectionLike> {
  try {
    const mod = await import("neozip-blockchain/node");
    return mod.loadNeozipConnection() ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve effective chain settings.
 * Precedence per field: explicit arg > environment > chain.json > ~/.neozip connection > default.
 */
export async function resolveChainSettings(
  opts: ResolveChainSettingsOptions = {},
): Promise<ChainSettings> {
  const env = opts.env ?? process.env;
  const ov = opts.overrides ?? {};
  const file = loadChainConfig();
  const conn: NeozipConnectionLike = opts.skipNeozipConnection
    ? null
    : await (opts.loadConnection ?? defaultLoadConnection)();

  const pick = <T extends string>(
    candidates: Array<[T | undefined, ChainSettingSource]>,
  ): { value?: string; source?: ChainSettingSource } => {
    for (const [v, source] of candidates) {
      if (v) return { value: v, source };
    }
    return {};
  };

  const network = pick<string>([
    [clean(ov.network), "arg"],
    [clean(env.TOKEN_SERVICE_NETWORK), "env"],
    [clean(file.network), "chain.json"],
    [clean(conn?.network), "neozip"],
  ]);
  const email = pick<string>([
    [clean(ov.email), "arg"],
    [clean(env.NEOZIP_RECIPIENT_EMAIL), "env"],
    [clean(file.email), "chain.json"],
    [clean(conn?.email), "neozip"],
  ]);
  const url = pick<string>([
    [clean(ov.tokenServiceUrl), "arg"],
    [clean(env.TOKEN_SERVICE_URL), "env"],
    [clean(file.tokenServiceUrl), "chain.json"],
    [clean(conn?.tokenServiceUrl), "neozip"],
  ]);

  const walletKey = clean(ov.walletKey)
    ? { value: clean(ov.walletKey), source: "arg" as const }
    : clean(env.ZIPWIKI_WALLET_KEY)
      ? { value: clean(env.ZIPWIKI_WALLET_KEY), source: "env" as const }
      : clean(env.NEOZIP_WALLET_PASSKEY)
        ? { value: clean(env.NEOZIP_WALLET_PASSKEY), source: "env" as const }
        : clean(conn?.walletPrivateKey)
          ? { value: clean(conn?.walletPrivateKey), source: "neozip" as const }
          : undefined;
  const accessToken = clean(ov.accessToken)
    ? { value: clean(ov.accessToken), source: "arg" as const }
    : clean(env.NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN)
      ? {
          value: clean(env.NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN),
          source: "env" as const,
        }
      : clean(conn?.accessToken)
        ? { value: clean(conn?.accessToken), source: "neozip" as const }
        : undefined;

  return {
    network: network.value ?? DEFAULT_CHAIN_NETWORK,
    ...(email.value ? { email: email.value } : {}),
    ...(url.value ? { tokenServiceUrl: url.value } : {}),
    ...(walletKey?.value ? { walletKey: walletKey.value } : {}),
    ...(accessToken?.value ? { accessToken: accessToken.value } : {}),
    sources: {
      network: network.source ?? "default",
      ...(email.source ? { email: email.source } : {}),
      ...(url.source ? { tokenServiceUrl: url.source } : {}),
      ...(walletKey ? { walletKey: walletKey.source } : {}),
      ...(accessToken ? { accessToken: accessToken.source } : {}),
    },
  };
}

/** Normalize `--network`; accepts base-sepolia | base (case-insensitive). */
export function normalizeChainNetwork(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if ((CHAIN_NETWORKS as readonly string[]).includes(v)) return v;
  throw new ChainError(
    `Unknown network "${value}". Use ${CHAIN_NETWORKS.join(" | ")}.`,
    "invalid_args",
  );
}

export type ChainErrorCode =
  | "invalid_args"
  | "missing_email"
  | "missing_wallet_key"
  | "not_found";

export class ChainError extends Error {
  constructor(
    message: string,
    public readonly code: ChainErrorCode,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/** `abcd…wxyz` style mask for display. */
export function maskMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Mask an email as `ab***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return maskMiddle(email, 2, 0);
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${email.slice(at)}`;
}
