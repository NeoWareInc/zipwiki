import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const CONFIG_FILENAME = "zipwiki.config.json";
const ENV_FILENAMES = [".env", ".env.local"] as const;

/** Roots already applied this process (so tests can clear env without reload). */
const loadedRoots = new Set<string>();

/** Test helper: allow `loadEnvFiles` to read disk again. */
export function resetEnvFileLoadStateForTests(): void {
  loadedRoots.clear();
}

/**
 * Resolve the project directory that should own env files.
 * Prefer a pnpm workspace / zipwiki config root; otherwise the nearest
 * directory that already has `.env` / `.env.local`.
 */
export function findEnvRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  let fallback = dir;
  let foundEnvDir: string | undefined;

  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    if (existsSync(join(dir, CONFIG_FILENAME))) {
      fallback = dir;
    }
    if (
      !foundEnvDir &&
      (existsSync(join(dir, ".env.local")) || existsSync(join(dir, ".env")))
    ) {
      foundEnvDir = dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return foundEnvDir ?? fallback;
}

/** Parse a dotenv-style file into key/value pairs (no variable expansion). */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const exported = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const eq = exported.indexOf("=");
    if (eq <= 0) continue;

    const key = exported.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = exported.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trimEnd();
    }

    out[key] = value;
  }
  return out;
}

/**
 * Apply one env file into `process.env`.
 * Existing non-empty process env values win (shell / CI overrides files).
 * Empty values are ignored so template placeholders like `KEY=` do not block
 * a later `.env.local` value or leave a blank that SDKs still treat as set.
 * Returns true when the file exists (even if every key was skipped).
 */
export function applyEnvFile(path: string): boolean {
  if (!existsSync(path)) return false;
  const parsed = parseEnvFile(readFileSync(path, "utf-8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (value === "") continue;
    const current = process.env[key];
    if (current !== undefined && current !== "") continue;
    process.env[key] = value;
  }
  return true;
}

/**
 * Load `.env` then `.env.local` from the project root.
 * `.env.local` overrides `.env`; already-set process env still wins.
 * Each project root is applied at most once per process.
 */
export function loadEnvFiles(startDir: string = process.cwd()): string[] {
  const root = findEnvRoot(startDir);
  if (loadedRoots.has(root)) return [];

  const loaded: string[] = [];
  for (const name of ENV_FILENAMES) {
    const path = join(root, name);
    if (applyEnvFile(path)) loaded.push(path);
  }
  loadedRoots.add(root);
  return loaded;
}
