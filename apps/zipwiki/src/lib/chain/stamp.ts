import { loadChainArchive } from "./archive-module.js";
import {
  ChainError,
  normalizeChainNetwork,
  resolveChainSettings,
  type ChainSettings,
  type ResolveChainSettingsOptions,
} from "./config.js";
import { upgradePackage } from "./upgrade.js";
import type {
  StampArchiveResult,
  UpgradeTimestampResult,
} from "neozip-blockchain/archive";

export type StampPackageOptions = {
  email?: string;
  network?: string;
  serverUrl?: string;
  /** Re-stamp even when a proof bound to the current root exists. */
  force?: boolean;
  /** Precomputed v1 Merkle root (skips re-reading the archive). */
  merkleRoot?: string;
  /** After submit, poll `upgradeTimestamp` until confirmed. */
  wait?: boolean;
  timeoutMs?: number;
  settings?: ResolveChainSettingsOptions;
};

export type StampPackageResult = {
  stamp: StampArchiveResult;
  upgrade?: UpgradeTimestampResult;
  settings: Pick<ChainSettings, "network" | "email" | "tokenServiceUrl">;
};

/** Resolve email / network and submit the archive Merkle root to the Token Service. */
export async function stampPackage(
  path: string,
  opts: StampPackageOptions = {},
): Promise<StampPackageResult> {
  const settings = await resolveChainSettings({
    ...opts.settings,
    overrides: {
      ...opts.settings?.overrides,
      network: normalizeChainNetwork(opts.network),
      email: opts.email,
      tokenServiceUrl: opts.serverUrl,
    },
  });
  if (!settings.email) {
    throw new ChainError(
      "Stamp needs a verified Token Service email. Pass --email, set NEOZIP_RECIPIENT_EMAIL, or add \"email\" to ~/.zipwiki/chain.json.",
      "missing_email",
    );
  }
  const chain = await loadChainArchive();
  const stamp = await chain.stampArchive(path, {
    email: settings.email,
    network: settings.network,
    ...(settings.tokenServiceUrl ? { serverUrl: settings.tokenServiceUrl } : {}),
    ...(opts.merkleRoot ? { merkleRoot: opts.merkleRoot } : {}),
    ...(opts.force ? { force: true } : {}),
  });
  const base = {
    network: settings.network,
    email: settings.email,
    tokenServiceUrl: settings.tokenServiceUrl,
  };
  if (!opts.wait) return { stamp, settings: base };
  const upgrade = await upgradePackage(path, {
    wait: true,
    timeoutMs: opts.timeoutMs,
    serverUrl: settings.tokenServiceUrl,
    merkleRoot: stamp.merkleRoot,
    settings: opts.settings,
  });
  return { stamp, upgrade, settings: base };
}
