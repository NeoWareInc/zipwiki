import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root (apps/zipwiki/src/lib/archive → ../../../../..). */
export const REPO_ROOT = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../..",
);

/**
 * Directory the user invoked from. `pnpm --filter … exec` changes cwd to the
 * package (`apps/zipwiki`); pnpm sets `INIT_CWD` to the original directory.
 */
export function invocationDir(): string | undefined {
  const raw = process.env.INIT_CWD?.trim();
  if (!raw) return undefined;
  return resolve(raw);
}

/** Prefer the invocation directory, then cwd, then the monorepo root. */
export function resolveRepoPath(path: string): string {
  if (path === "-" || isAbsolute(path)) return path;

  const inv = invocationDir();
  const fromInv = inv ? resolve(inv, path) : undefined;
  const fromCwd = resolve(process.cwd(), path);
  const fromRepo = resolve(REPO_ROOT, path);

  // `pnpm --filter exec` cwd is the package; keep relative paths at INIT_CWD
  // even when a leftover exists under apps/zipwiki.
  if (fromInv && inv !== process.cwd()) return fromInv;

  if (existsSync(fromCwd)) return fromCwd;
  if (existsSync(fromRepo)) return fromRepo;

  const cwd = process.cwd();
  if (
    cwd.startsWith(resolve(REPO_ROOT, "apps") + "/") ||
    cwd.startsWith(resolve(REPO_ROOT, "packages") + "/") ||
    cwd === resolve(REPO_ROOT, "apps") ||
    cwd === resolve(REPO_ROOT, "packages")
  ) {
    return fromRepo;
  }

  return fromCwd;
}

export function fail(err: unknown): never {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
