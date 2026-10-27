import { listZipEntries, hasProofSidecars } from "../archive/index.js";
import { loadChainArchive } from "./archive-module.js";
import { resolveChainSettings, type ResolveChainSettingsOptions } from "./config.js";
import type { VerifyArchiveResult } from "neozip-blockchain/archive";

export type VerifyPackageOptions = {
  /** Contact the Token Service / chain. Default false (offline). */
  online?: boolean;
  rpcUrlIndex?: number;
  serverUrl?: string;
  merkleRoot?: string;
  settings?: ResolveChainSettingsOptions;
};

/** Verify blockchain sidecars (offline by default). */
export async function verifyPackage(
  path: string,
  opts: VerifyPackageOptions = {},
): Promise<VerifyArchiveResult> {
  const online = opts.online === true;
  let serverUrl = opts.serverUrl;
  if (online && !serverUrl) {
    serverUrl = (await resolveChainSettings(opts.settings ?? {})).tokenServiceUrl;
  }
  const chain = await loadChainArchive();
  return chain.verifyArchive(path, {
    online,
    ...(opts.rpcUrlIndex !== undefined ? { rpcUrlIndex: opts.rpcUrlIndex } : {}),
    ...(serverUrl ? { serverUrl } : {}),
    ...(opts.merkleRoot ? { merkleRoot: opts.merkleRoot } : {}),
  });
}

/** Compact status for catalog / `open` responses. */
export type ChainStatusSummary = {
  kind: VerifyArchiveResult["kind"];
  status: VerifyArchiveResult["status"];
  merkleMatch: boolean;
  merkleRoot?: string | null;
  sidecars: string[];
};

/** Proof sidecar entry names in the archive (cheap; no hashing, no chain import). */
export function proofSidecarNames(path: string): string[] {
  return hasProofSidecars(listZipEntries(path).map((e) => e.name));
}

/**
 * Offline blockchain status for a package, or `null` when it carries no proof
 * sidecars (the chain module is not loaded in that case).
 */
export async function chainStatusSummary(
  path: string,
): Promise<ChainStatusSummary | null> {
  const sidecars = proofSidecarNames(path);
  if (sidecars.length === 0) return null;
  const r = await verifyPackage(path, { online: false });
  return {
    kind: r.kind,
    status: r.status,
    merkleMatch: r.merkle.match,
    ...(r.merkle.root !== undefined ? { merkleRoot: r.merkle.root } : {}),
    sidecars,
  };
}

/** v1 Merkle root of the archive's current content, or `null` when it cannot be computed. */
export async function archiveMerkleRoot(path: string): Promise<string | null> {
  try {
    const chain = await loadChainArchive();
    return await chain.resolveMerkleRoot(path);
  } catch {
    return null;
  }
}
