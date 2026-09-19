import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ZipIntegrityError } from "../archive/integrity.js";

export class AccessError extends Error {
  readonly code: string;

  constructor(message: string, code = "invalid_args") {
    super(message);
    this.name = "AccessError";
    this.code = code;
  }
}

/** Map archive integrity failures to AccessError. */
export function rethrowAccess(err: unknown): never {
  if (err instanceof AccessError) throw err;
  if (err instanceof ZipIntegrityError) {
    throw new AccessError(err.message, "integrity_failed");
  }
  throw err;
}

/** Default local package when tools omit `package`. */
export const DEFAULT_PACKAGE_NAME = "wiki.zipwiki" as const;

/**
 * Resolve package path from tool arg `package`, else `wiki.zipwiki` in cwd.
 */
export function resolvePackagePath(packagePath?: string | null): string {
  const fromArg = packagePath?.trim();
  const raw = fromArg || DEFAULT_PACKAGE_NAME;
  const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  if (!existsSync(abs)) {
    throw new AccessError(
      fromArg
        ? `Package not found: ${abs}`
        : `Package not found: ${abs} (pass tool arg \`package\` or place ${DEFAULT_PACKAGE_NAME} in the working directory)`,
      "not_found",
    );
  }
  return abs;
}

export function normalizeEntryName(name: string): string {
  return name.replace(/^\/+/, "").replace(/\\/g, "/");
}
