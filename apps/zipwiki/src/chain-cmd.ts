/**
 * Blockchain commands on the zipwiki CLI: stamp, upgrade, mint, verify.
 * Thin shell over `lib/chain`. Secrets come from the environment only
 * (`ZIPWIKI_WALLET_KEY` / `NEOZIP_WALLET_PASSKEY`, `NEOZIP_TOKEN_SERVICE_ACCESS_TOKEN`).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  ChainError,
  formatMintSummary,
  formatStampSummary,
  formatUpgradeSummary,
  formatVerifySummary,
  mintPackage,
  stampPackage,
  upgradePackage,
  verifyPackage,
} from "./lib/chain/index.js";
import { resolveRepoPath } from "./lib/parse/index.js";

const CHAIN = "Chain";

export type StampCommandOptions = {
  network?: string;
  email?: string;
  wait?: boolean;
  force?: boolean;
  json?: boolean;
};
export type UpgradeCommandOptions = { wait?: boolean; json?: boolean };
export type MintCommandOptions = {
  direct?: boolean;
  network?: string;
  walletKey?: string;
  json?: boolean;
};
export type VerifyCommandOptions = {
  offline?: boolean;
  online?: boolean;
  json?: boolean;
};

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`zipwiki: ${msg}`);
  process.exit(err instanceof ChainError ? 2 : 1);
}

function resolvePkg(pkg: string): string {
  const abs = resolve(resolveRepoPath(pkg));
  if (!existsSync(abs)) {
    throw new ChainError(`Package not found: ${abs}`, "not_found");
  }
  return abs;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runStampCommand(
  pkg: string,
  opts: StampCommandOptions = {},
): Promise<void> {
  const path = resolvePkg(pkg);
  if (!opts.json) console.error("Submitting Merkle root to the Token Service…");
  const result = await stampPackage(path, {
    network: opts.network,
    email: opts.email,
    wait: opts.wait === true,
    force: opts.force === true,
  });
  if (opts.json) {
    printJson({
      package: path,
      merkleRoot: result.stamp.merkleRoot,
      written: result.stamp.written,
      network: result.settings.network,
      sidecar: result.stamp.sidecar,
      ...(result.upgrade
        ? {
            upgrade: {
              status: result.upgrade.status,
              merkleRoot: result.upgrade.merkleRoot,
            },
          }
        : {}),
    });
    return;
  }
  process.stdout.write(formatStampSummary(pkg, result));
}

export async function runUpgradeCommand(
  pkg: string,
  opts: UpgradeCommandOptions = {},
): Promise<void> {
  const path = resolvePkg(pkg);
  if (opts.wait && !opts.json) {
    console.error("Waiting for the batch to confirm (up to 5 minutes)…");
  }
  const result = await upgradePackage(path, { wait: opts.wait === true });
  if (opts.json) {
    printJson({
      package: path,
      status: result.status,
      merkleRoot: result.merkleRoot,
      ...(result.sidecar ? { sidecar: result.sidecar } : {}),
    });
    return;
  }
  process.stdout.write(formatUpgradeSummary(pkg, result));
}

export async function runMintCommand(
  pkg: string,
  opts: MintCommandOptions = {},
): Promise<void> {
  const path = resolvePkg(pkg);
  const result = await mintPackage(path, {
    direct: opts.direct === true,
    network: opts.network,
    walletKey: opts.walletKey,
  });
  if (opts.json) {
    printJson({ package: path, mode: result.mode, network: result.network, ...result.result });
    return;
  }
  process.stdout.write(formatMintSummary(pkg, result));
}

export async function runVerifyCommand(
  pkg: string,
  opts: VerifyCommandOptions = {},
): Promise<void> {
  if (opts.online && opts.offline) {
    throw new ChainError("Use only one of --offline or --online.", "invalid_args");
  }
  const path = resolvePkg(pkg);
  const online = opts.online === true;
  const result = await verifyPackage(path, { online });
  if (opts.json) {
    printJson({ package: path, online, ...result });
  } else {
    process.stdout.write(formatVerifySummary(pkg, result, online));
  }
  // Tampered or invalid proofs must fail scripts.
  if (
    result.status === "merkle-mismatch" ||
    result.status === "integrity-error" ||
    result.status === "invalid-proof" ||
    result.status === "token-invalid"
  ) {
    process.exitCode = 1;
  }
}

export function registerChainCommands(program: Command): void {
  program
    .command("stamp")
    .helpGroup(CHAIN)
    .description(
      "Submit the package Merkle root to the Token Service (writes META-INF/TS-SUBMIT.NZIP). Needs a verified email (--email, NEOZIP_RECIPIENT_EMAIL, or ~/.zipwiki/chain.json)",
    )
    .argument("<package>", "Path to .zipwiki")
    .option("--network <name>", "base-sepolia | base (default: chain.json or base-sepolia)")
    .option("--email <email>", "Verified Token Service email")
    .option("--wait", "After submit, poll until the timestamp is confirmed")
    .option("--force", "Re-stamp even if a proof already binds the current content")
    .option("-j, --json", "JSON output")
    .action(async (pkg: string, opts: StampCommandOptions) => {
      try {
        await runStampCommand(pkg, opts);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("upgrade")
    .helpGroup(CHAIN)
    .description(
      "Upgrade a pending stamp (TS-SUBMIT.NZIP) to a confirmed TIMESTAMP.NZIP once the batch is on-chain",
    )
    .argument("<package>", "Path to .zipwiki")
    .option("--wait", "Poll until confirmed (default: single check)")
    .option("-j, --json", "JSON output")
    .action(async (pkg: string, opts: UpgradeCommandOptions) => {
      try {
        await runUpgradeCommand(pkg, opts);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("mint")
    .helpGroup(CHAIN)
    .description(
      "Mint an NFT proof (writes META-INF/TOKEN.NZIP). Default: TimestampProof from a confirmed TIMESTAMP.NZIP. --direct mints from the wallet. Spends gas; wallet key from ZIPWIKI_WALLET_KEY or NEOZIP_WALLET_PASSKEY",
    )
    .argument("<package>", "Path to .zipwiki")
    .option("--direct", "Mint directly from the wallet (no TIMESTAMP.NZIP needed)")
    .option("--network <name>", "base-sepolia | base")
    .option(
      "-w, --wallet-key <hex>",
      "Wallet private key (prefer the env var; it can land in shell history)",
    )
    .option("-j, --json", "JSON output")
    .action(async (pkg: string, opts: MintCommandOptions) => {
      try {
        await runMintCommand(pkg, opts);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("verify")
    .helpGroup(CHAIN)
    .description(
      "Verify blockchain proofs in a package. Default offline (Merkle binding + embedded proof); --online asks the Token Service / chain",
    )
    .argument("<package>", "Path to .zipwiki")
    .option("--offline", "Do not contact the Token Service or chain (default)")
    .option("--online", "Also confirm with the Token Service / chain")
    .option("-j, --json", "JSON output")
    .action(async (pkg: string, opts: VerifyCommandOptions) => {
      try {
        await runVerifyCommand(pkg, opts);
      } catch (err) {
        fail(err);
      }
    });
}
