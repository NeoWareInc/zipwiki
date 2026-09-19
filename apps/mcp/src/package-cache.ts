/**
 * Session cache of ZipHandle (CD + fd) for the long-lived stdio MCP process.
 */

import { statSync } from "node:fs";
import {
  closeZipHandle,
  openZipHandle,
  runWithZipHandle,
  type ZipHandle,
} from "@zipwiki/zipwiki/archive";
import { resolvePackagePath } from "@zipwiki/zipwiki/access";

const cache = new Map<string, ZipHandle>();

function acquire(packagePath?: string): ZipHandle {
  const path = resolvePackagePath(packagePath);
  const st = statSync(path);
  const hit = cache.get(path);
  if (
    hit &&
    hit.size === st.size &&
    hit.mtimeMs === st.mtimeMs &&
    hit.ino === st.ino
  ) {
    return hit;
  }
  if (hit) {
    closeZipHandle(hit);
    cache.delete(path);
  }
  const handle = openZipHandle(path);
  cache.set(path, handle);
  return handle;
}

/** Run a query against a cached ZipHandle for this package. */
export function withCachedPackage<T>(
  packagePath: string | undefined,
  fn: () => T,
): T {
  return runWithZipHandle(acquire(packagePath), fn);
}

export function invalidatePackageCache(packagePath?: string): void {
  if (!packagePath) {
    for (const handle of cache.values()) closeZipHandle(handle);
    cache.clear();
    return;
  }
  let path: string;
  try {
    path = resolvePackagePath(packagePath);
  } catch {
    return;
  }
  const hit = cache.get(path);
  if (hit) {
    closeZipHandle(hit);
    cache.delete(path);
  }
}
