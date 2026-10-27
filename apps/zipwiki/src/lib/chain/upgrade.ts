import { loadChainArchive } from "./archive-module.js";
import { resolveChainSettings, type ResolveChainSettingsOptions } from "./config.js";
import type { UpgradeTimestampResult } from "neozip-blockchain/archive";

export type UpgradePackageOptions = {
  wait?: boolean;
  timeoutMs?: number;
  serverUrl?: string;
  merkleRoot?: string;
  settings?: ResolveChainSettingsOptions;
};

/** Upgrade a pending TS-SUBMIT.NZIP to TIMESTAMP.NZIP when the batch is on-chain. */
export async function upgradePackage(
  path: string,
  opts: UpgradePackageOptions = {},
): Promise<UpgradeTimestampResult> {
  const settings = await resolveChainSettings({
    ...opts.settings,
    overrides: {
      ...opts.settings?.overrides,
      tokenServiceUrl: opts.serverUrl,
    },
  });
  const chain = await loadChainArchive();
  return chain.upgradeTimestamp(path, {
    ...(opts.wait ? { wait: true } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(settings.tokenServiceUrl ? { serverUrl: settings.tokenServiceUrl } : {}),
    ...(opts.merkleRoot ? { merkleRoot: opts.merkleRoot } : {}),
  });
}
