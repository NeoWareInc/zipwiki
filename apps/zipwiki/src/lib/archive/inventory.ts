/**
 * Logical primary inventory for a ZipWiki package (path P after collision rewrite).
 */

import { basename } from "node:path";
import { conceptFileNameFor } from "../okf/render.js";
import {
  DEFAULT_AI_ROOT,
  DEFAULT_PARSED_DIR,
  DEFAULT_OKF_DIR,
  classifyEntry,
  parsedPathFor,
  type NeoZipAiPrimary,
  type NeoZipManifest,
} from "./nzip.js";
import type { ZipListEntry } from "./zip-list.js";
import { listZipEntries } from "./zip-list.js";
import { readZipEntryVerified } from "./integrity.js";

export type PrimarySlot = {
  /** ZIP path P (or omitted-original logical path). */
  path: string;
  hasPrimaryEntry: boolean;
  parsedPath: string | null;
  assetPrefix: string;
  okfPath: string;
  sourceIncluded: boolean;
  hasParsed: boolean;
  manifest?: NeoZipAiPrimary;
};

export type PackageInventory = {
  zipPath: string;
  aiRoot: string;
  parsedDir: string;
  okfRoot: string;
  manifest: NeoZipManifest | null;
  listed: ZipListEntry[];
  names: Set<string>;
  primaries: Map<string, PrimarySlot>;
};

function parseManifest(zipPath: string, names: Set<string>): NeoZipManifest | null {
  if (!names.has("META-INF/manifest.json")) return null;
  try {
    const raw = readZipEntryVerified(zipPath, "META-INF/manifest.json").data.toString(
      "utf8",
    );
    return JSON.parse(raw) as NeoZipManifest;
  } catch {
    return null;
  }
}

function primaryFromParsePath(
  name: string,
  aiRoot: string,
  parsedDir: string,
): string | null {
  const prefix = `${aiRoot.replace(/\/+$/, "")}/${parsedDir.replace(/\/+$/, "")}/`;
  if (!name.startsWith(prefix) || !name.endsWith(".md")) return null;
  if (name.includes(".assets/")) return null;
  return name.slice(prefix.length, -".md".length);
}

export function loadPackageInventory(zipPath: string): PackageInventory {
  const listed = listZipEntries(zipPath);
  const names = new Set(listed.map((e) => e.name.replace(/\\/g, "/")));
  const manifest = parseManifest(zipPath, names);
  const aiRoot =
    typeof manifest?.ai?.root === "string"
      ? manifest.ai.root.replace(/\/+$/, "")
      : DEFAULT_AI_ROOT;
  const parsedDir =
    typeof manifest?.ai?.parsedDir === "string"
      ? manifest.ai.parsedDir.replace(/\/+$/, "")
      : DEFAULT_PARSED_DIR;
  const okfRoot = `${aiRoot}/${DEFAULT_OKF_DIR}/`;

  const logical = new Set<string>();
  for (const e of listed) {
    const name = e.name.replace(/\\/g, "/");
    if (e.name.endsWith("/")) continue;
    if (classifyEntry(name, aiRoot) === "primary") logical.add(name);
    const fromParse = primaryFromParsePath(name, aiRoot, parsedDir);
    if (fromParse) logical.add(fromParse);
  }
  for (const p of manifest?.ai?.primaries ?? []) {
    if (typeof p.path === "string" && p.path.trim()) logical.add(p.path.trim());
  }

  const manifestByPath = new Map<string, NeoZipAiPrimary>();
  for (const p of manifest?.ai?.primaries ?? []) {
    if (p.path) manifestByPath.set(p.path, p);
  }

  const primaries = new Map<string, PrimarySlot>();
  for (const path of logical) {
    const parsedPath = parsedPathFor(path, aiRoot, parsedDir);
    const man = manifestByPath.get(path);
    const hasParsed = names.has(parsedPath);
    const sourceIncluded =
      man?.sourceIncluded === false ? false : names.has(path);
    primaries.set(path, {
      path,
      hasPrimaryEntry: names.has(path),
      parsedPath: hasParsed ? parsedPath : null,
      assetPrefix: `${aiRoot}/${parsedDir}/${path}.assets/`,
      okfPath: `${okfRoot}${conceptFileNameFor(path)}`,
      sourceIncluded,
      hasParsed,
      ...(man ? { manifest: man } : {}),
    });
  }

  return {
    zipPath,
    aiRoot,
    parsedDir,
    okfRoot,
    manifest,
    listed,
    names,
    primaries,
  };
}

export function okfStemOwners(
  inventory: PackageInventory,
  okfPath: string,
): string[] {
  const owners: string[] = [];
  for (const slot of inventory.primaries.values()) {
    if (slot.okfPath === okfPath) owners.push(slot.path);
  }
  return owners;
}

export function primaryPathsOf(inventory: PackageInventory): string[] {
  return [...inventory.primaries.keys()].sort();
}

export function usedPrimaryPaths(inventory: PackageInventory): Set<string> {
  return new Set(inventory.primaries.keys());
}

export function basenameOfPrimary(path: string): string {
  return basename(path.replace(/\\/g, "/"));
}
