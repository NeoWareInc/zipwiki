import { loadChainArchive } from "./archive-module.js";
import {
  ChainError,
  normalizeChainNetwork,
  resolveChainSettings,
  type ResolveChainSettingsOptions,
} from "./config.js";
import type {
  MintDirectResult,
  MintTimestampProofResult,
} from "neozip-blockchain/archive";

export type MintPackageOptions = {
  /** `true`: mint straight from the wallet (no TIMESTAMP.NZIP needed). */
  direct?: boolean;
  network?: string;
  /** Wallet private key. Prefer ZIPWIKI_WALLET_KEY / NEOZIP_WALLET_PASSKEY. */
  walletKey?: string;
  merkleRoot?: string;
  settings?: ResolveChainSettingsOptions;
};

export type MintPackageResult =
  | { mode: "timestamp-proof"; result: MintTimestampProofResult; network: string }
  | { mode: "direct"; result: MintDirectResult; network: string };

export const MISSING_WALLET_MESSAGE =
  "Mint needs a wallet key. Set ZIPWIKI_WALLET_KEY or NEOZIP_WALLET_PASSKEY (or pass --wallet-key). It is never written to disk.";

/** Resolve the wallet and mint TOKEN.NZIP (TimestampProof by default, or direct). */
export async function mintPackage(
  path: string,
  opts: MintPackageOptions = {},
): Promise<MintPackageResult> {
  const settings = await resolveChainSettings({
    ...opts.settings,
    overrides: {
      ...opts.settings?.overrides,
      network: normalizeChainNetwork(opts.network),
      walletKey: opts.walletKey,
    },
  });
  if (!settings.walletKey) {
    throw new ChainError(MISSING_WALLET_MESSAGE, "missing_wallet_key");
  }
  const chain = await loadChainArchive();
  if (opts.direct) {
    const result = await chain.mintDirect(path, {
      walletPrivateKey: settings.walletKey,
      network: settings.network,
      ...(opts.merkleRoot ? { merkleRoot: opts.merkleRoot } : {}),
    });
    return { mode: "direct", result, network: settings.network };
  }
  const result = await chain.mintTimestampProof(path, {
    walletPrivateKey: settings.walletKey,
    network: settings.network,
    ...(settings.accessToken ? { accessToken: settings.accessToken } : {}),
    ...(settings.tokenServiceUrl ? { serverUrl: settings.tokenServiceUrl } : {}),
    ...(opts.merkleRoot ? { merkleRoot: opts.merkleRoot } : {}),
  });
  return { mode: "timestamp-proof", result, network: settings.network };
}
