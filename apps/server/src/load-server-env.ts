import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function applyEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/**
 * Load root `.env` / `.env.local`, then `deploy/.env`.
 * Existing process env wins (same as the lab server).
 */
export function loadServerEnv(startDir: string = process.cwd()): void {
  const root = findRepoRoot(startDir);
  applyEnvFile(join(root, ".env"));
  applyEnvFile(join(root, ".env.local"));
  applyEnvFile(join(root, "deploy", ".env"));
}
