import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseEnvFile } from "./env.js";

export const ZIPWIKI_HOME_ENV = "ZIPWIKI_HOME";

/**
 * Platform / SaaS secrets (Lane A/B). Must never be written to ~/.zipwiki/.env
 * (Lane C — user BYO). See doc/CONVEX.md “Secret lanes”.
 */
export const PLATFORM_FORBIDDEN_HOME_ENV_KEYS = [
  "AUTH_RESEND_KEY",
  "AUTH_EMAIL",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "JWT_PRIVATE_KEY",
  "JWKS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PRO",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "SITE_URL",
  "WEB_ORIGIN",
  "ZIPWIKI_WORKER_SECRET",
] as const;

const PLATFORM_FORBIDDEN_HOME_ENV_KEY_SET = new Set<string>(
  PLATFORM_FORBIDDEN_HOME_ENV_KEYS,
);

/** Managed keys persisted to `~/.zipwiki/.env` (order preserved on write). */
export const MANAGED_HOME_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_API_BASE",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_WORKSPACE_ID",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_URL",
  "ZIPWIKI_OKF_PROVIDER",
  "ZIPWIKI_OKF_MODEL",
  "LLAMA_CLOUD_API_KEY",
  "ZIPWIKI_API_URL",
  "ZIPWIKI_API_KEY",
  "ZIPWIKI_ACCOUNT_EMAIL",
  "ZIPWIKI_PARSE_CREDENTIAL",
  "ZIPWIKI_OKF_CREDENTIAL",
  "ZIPWIKI_HOSTED_MODE",
  "ZIPWIKI_PARSER",
  "ZIPWIKI_PARSER_MODE",
] as const;

/** Keys that look like secrets when redacting for `config show`. */
export const SECRET_HOME_ENV_KEYS = new Set<string>([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "AI_GATEWAY_API_KEY",
  "LLAMA_CLOUD_API_KEY",
  "ZIPWIKI_API_KEY",
]);

export type ManagedHomeEnvKey = (typeof MANAGED_HOME_ENV_KEYS)[number];

/** True when `key` must not be stored in ~/.zipwiki/.env. */
export function isPlatformForbiddenHomeEnvKey(key: string): boolean {
  const k = key.trim();
  if (PLATFORM_FORBIDDEN_HOME_ENV_KEY_SET.has(k)) return true;
  // Prefix catch-alls for future AUTH_* / JWT variants.
  if (/^AUTH_/i.test(k)) return true;
  if (/^JWT_/i.test(k)) return true;
  if (/^STRIPE_/i.test(k)) return true;
  if (/^VITE_AUTH_/i.test(k)) return true;
  return false;
}

export function assertHomeEnvKeyAllowed(key: string): void {
  if (!isPlatformForbiddenHomeEnvKey(key)) return;
  throw new Error(
    `${key} is a platform secret (Convex / Fly) — do not store it in ~/.zipwiki/.env. ` +
      `Set it with \`npx convex env set\` or Fly secrets. See doc/CONVEX.md “Secret lanes”.`,
  );
}

export function zipwikiHomeDir(): string {
  const override = process.env[ZIPWIKI_HOME_ENV]?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".zipwiki");
}

export function zipwikiHomeEnvPath(): string {
  return join(zipwikiHomeDir(), ".env");
}

function escapeEnvValue(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")}"`;
}

/** Format env map for `~/.zipwiki/.env` (managed keys first, then others sorted). */
export function formatHomeEnv(env: Record<string, string>): string {
  const managed = new Set<string>(MANAGED_HOME_ENV_KEYS);
  const keys = [
    ...MANAGED_HOME_ENV_KEYS.filter((k) => env[k] !== undefined),
    ...Object.keys(env)
      .filter((k) => !managed.has(k))
      .sort(),
  ];
  return `${keys.map((k) => `${k}=${escapeEnvValue(env[k] ?? "")}`).join("\n")}\n`;
}

/**
 * Load `~/.zipwiki/.env` into `process.env`.
 * Shell / already-set non-empty env wins. Empty managed value in file is ignored
 * for apply; use {@link saveZipwikiHomeEnv} with empty string to delete a key.
 */
export function loadZipwikiHomeEnv(): {
  path: string;
  loaded: boolean;
  keys: string[];
} {
  const path = zipwikiHomeEnvPath();
  if (!existsSync(path)) {
    return { path, loaded: false, keys: [] };
  }
  const parsed = parseEnvFile(readFileSync(path, "utf-8"));
  const keys: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    // Never apply platform secrets from a mistakenly edited home file.
    if (isPlatformForbiddenHomeEnvKey(key)) continue;
    const current = process.env[key];
    if (current !== undefined && current !== "") continue;
    if (value === "") continue;
    process.env[key] = value;
    keys.push(key);
  }
  return { path, loaded: true, keys };
}

/**
 * Merge updates into `~/.zipwiki/.env` (atomic write, mode 0o600).
 * Empty string for a key deletes it. Shell env is not written unless passed
 * explicitly in `updates`.
 */
export function saveZipwikiHomeEnv(
  updates: Record<string, string | undefined>,
): string {
  for (const key of Object.keys(updates)) {
    if (updates[key] === undefined) continue;
    // Allow explicit delete ("") of a mistakenly present platform key.
    if (updates[key] === "") continue;
    assertHomeEnvKeyAllowed(key);
  }

  const dir = zipwikiHomeDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* ignore on platforms without chmod */
  }

  const path = zipwikiHomeEnvPath();
  const existing = existsSync(path)
    ? parseEnvFile(readFileSync(path, "utf-8"))
    : {};

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value === "") {
      delete existing[key];
    } else {
      existing[key] = value;
    }
  }

  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, formatHomeEnv(existing), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
  return path;
}

/**
 * Snapshot of non-empty `process.env` values at call time (typically startup,
 * before loading home `.env`). Used to warn when a saved key is shadowed.
 */
export function snapshotShellEnv(
  keys: readonly string[] = MANAGED_HOME_ENV_KEYS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = process.env[key];
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out;
}

/** Managed keys present in both shell snapshot and a save update. */
export function shadowedHomeEnvKeys(
  shellAtStartup: Record<string, string>,
  updates: Record<string, string | undefined>,
): string[] {
  return Object.keys(updates).filter(
    (k) =>
      updates[k] !== undefined &&
      updates[k] !== "" &&
      Boolean(shellAtStartup[k]),
  );
}

/** Mask a secret for display (`sk-…xxxx`). */
export function maskSecret(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "********";
  return `${v.slice(0, 3)}…${v.slice(-4)}`;
}

/**
 * True when a secret env var is non-empty. Returns only a boolean — never the
 * secret value — so callers can detect configuration without copying keys into
 * prompts, logs, or AI request bodies.
 */
export function isSecretEnvConfigured(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0;
}
