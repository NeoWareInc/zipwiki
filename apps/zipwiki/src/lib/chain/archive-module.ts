/**
 * Lazy loader for `neozip-blockchain/archive` so local pack without chain
 * features never loads ethers. Tests inject a mock via `setChainArchiveModule`.
 */
import { createRequire } from "node:module";

export type ChainArchiveModule = typeof import("neozip-blockchain/archive");

let override: ChainArchiveModule | null = null;
let cached: Promise<ChainArchiveModule> | null = null;

export async function loadChainArchive(): Promise<ChainArchiveModule> {
  if (override) return override;
  cached ??= import("neozip-blockchain/archive");
  return cached;
}

/** @internal tests only. */
export function setChainArchiveModule(mod: Partial<ChainArchiveModule> | null): void {
  override = mod as ChainArchiveModule | null;
}

/**
 * Wallet address for a private key (display only), or null when ethers is
 * unavailable. Resolves ethers through neozip-blockchain's own dependency tree.
 */
export function walletAddressFromKey(privateKey: string): string | null {
  try {
    const req = createRequire(import.meta.url);
    const anchor = req.resolve("neozip-blockchain/archive");
    const ethers = createRequire(anchor)("ethers") as {
      Wallet: new (k: string) => { address: string };
    };
    const hex = privateKey.trim();
    return new ethers.Wallet(hex.startsWith("0x") ? hex : `0x${hex}`).address;
  } catch {
    return null;
  }
}
