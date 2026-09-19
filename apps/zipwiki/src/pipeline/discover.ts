import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { collectFiles, resolveRepoPath } from "../lib/parse/index.js";

function matchGlob(path: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(path) ||
    new RegExp(`^${escaped}$`, "i").test(basename(path));
}

/** Expand inputs: directories → supported files; apply include/exclude. */
export function discoverInputs(
  inputs: string[],
  opts: {
    recurse?: boolean;
    include?: string[];
    exclude?: string[];
  } = {},
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const recurse = opts.recurse === true;

  for (const input of inputs) {
    const abs = resolve(resolveRepoPath(input));
    let st;
    try {
      st = statSync(abs);
    } catch {
      throw new Error(`Input not found: ${input}`);
    }
    if (st.isDirectory()) {
      const found = collectFiles(abs, recurse);
      if (found.length === 0) {
        throw new Error(`No supported documents in directory: ${input}`);
      }
      for (const f of found) {
        if (seen.has(f)) continue;
        seen.add(f);
        out.push(f);
      }
    } else if (st.isFile()) {
      if (!seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    } else {
      throw new Error(`Not a file or directory: ${input}`);
    }
  }

  let filtered = out;
  if (opts.include && opts.include.length > 0) {
    filtered = filtered.filter((p) =>
      opts.include!.some((pat) => matchGlob(p, pat)),
    );
  }
  if (opts.exclude && opts.exclude.length > 0) {
    filtered = filtered.filter(
      (p) => !opts.exclude!.some((pat) => matchGlob(p, pat)),
    );
  }

  return filtered.sort((a, b) => a.localeCompare(b));
}
