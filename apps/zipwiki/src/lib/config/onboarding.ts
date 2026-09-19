import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { zipwikiHomeDir } from "./home.js";

export const ONBOARDING_FILENAME = "onboarding.json" as const;
export const ONBOARDING_VERSION = 1 as const;

export type ZipwikiOnboarding = {
  version: number;
  completedAt?: string;
  useAi?: boolean;
  aiRoot?: string;
  compression?: "zstd" | "deflate" | "store";
  level?: number;
  recurse?: boolean;
  /** Omit PDF/DOCX/… originals when a parse exists. */
  omitOriginalDocuments?: boolean;
};

export function zipwikiOnboardingPath(): string {
  return join(zipwikiHomeDir(), ONBOARDING_FILENAME);
}

export function loadZipwikiOnboarding(): ZipwikiOnboarding {
  const path = zipwikiOnboardingPath();
  if (!existsSync(path)) {
    return { version: ONBOARDING_VERSION };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as ZipwikiOnboarding;
    return {
      ...raw,
      version:
        typeof raw.version === "number" ? raw.version : ONBOARDING_VERSION,
    };
  } catch {
    return { version: ONBOARDING_VERSION };
  }
}

/** Merge and write `~/.zipwiki/onboarding.json` (mode 0o600). */
export function saveZipwikiOnboarding(
  updates: Partial<ZipwikiOnboarding>,
): string {
  const dir = zipwikiHomeDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* ignore */
  }

  const path = zipwikiOnboardingPath();
  const existing = loadZipwikiOnboarding();
  const next: ZipwikiOnboarding = {
    ...existing,
    ...updates,
    version: ONBOARDING_VERSION,
  };
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
  return path;
}

export function isOnboardingComplete(
  onboarding: ZipwikiOnboarding = loadZipwikiOnboarding(),
): boolean {
  return Boolean(onboarding.completedAt);
}
