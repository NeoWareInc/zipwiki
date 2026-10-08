/**
 * Compare this build with https://zipwiki.ai/releases/latest.json.
 * One stderr line when a newer version exists. Failures stay silent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipwikiHomeDir } from "./home.js";

export const UPDATE_MANIFEST_URL = "https://zipwiki.ai/releases/latest.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 2_500;

type Manifest = { version?: string; url?: string };

export type UpdateCheckDeps = {
  now?: () => number;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  homeDir?: string;
  currentVersion?: string;
  log?: (line: string) => void;
};

export function readZipwikiPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return typeof pkg.version === "string" && pkg.version ? pkg.version : "0.0.0";
}

export function updateCheckSkipped(
  env: NodeJS.ProcessEnv,
  argv: string[],
): boolean {
  if (env.ZIPWIKI_NO_UPDATE_CHECK === "1") return true;
  if (env.CI) return true;
  return argv.some((arg) => arg === "-q" || arg === "--quiet");
}

/** Positive when `remote` is newer than `current`. */
export function compareVersions(current: string, remote: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/, "")
      .split(".")
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const a = parse(current);
  const b = parse(remote);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function cachePath(homeDir: string): string {
  return join(homeDir, "update-check.json");
}

function cacheIsFresh(homeDir: string, now: number): boolean {
  try {
    const raw = JSON.parse(readFileSync(cachePath(homeDir), "utf8")) as {
      checkedAt?: number;
    };
    return typeof raw.checkedAt === "number" && now - raw.checkedAt < DAY_MS;
  } catch {
    return false;
  }
}

function writeCache(homeDir: string, now: number): void {
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(cachePath(homeDir), `${JSON.stringify({ checkedAt: now })}\n`);
}

export async function maybeCheckForUpdate(deps: UpdateCheckDeps = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const argv = deps.argv ?? process.argv;
  if (updateCheckSkipped(env, argv)) return;
  const now = deps.now?.() ?? Date.now();
  const homeDir = deps.homeDir ?? zipwikiHomeDir();
  if (cacheIsFresh(homeDir, now)) return;
  const current = deps.currentVersion ?? readZipwikiPackageVersion();
  const log = deps.log ?? ((line: string) => console.error(line));
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(UPDATE_MANIFEST_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return;
    const manifest = (await response.json()) as Manifest;
    writeCache(homeDir, now);
    const remote = manifest.version?.trim();
    const url = manifest.url?.trim();
    if (!remote || !url) return;
    if (compareVersions(current, remote) <= 0) return;
    log(`[zipwiki] ${remote} is available (you have ${current}). ${url}`);
  } catch {
    // Offline, timeout, or a missing manifest: keep going.
  }
}
