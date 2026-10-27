/** Human-readable summaries for CLI output. */
import type { MintPackageResult } from "./mint.js";
import type { StampPackageResult } from "./stamp.js";
import type { UpgradeTimestampResult, VerifyArchiveResult } from "neozip-blockchain/archive";

export function formatStampSummary(pkg: string, r: StampPackageResult): string {
  const lines = [
    `Stamped ${pkg}`,
    `  merkle root: ${r.stamp.merkleRoot}`,
    `  network:     ${r.settings.network}`,
    `  sidecar:     META-INF/TS-SUBMIT.NZIP (pending)`,
  ];
  if (r.upgrade) {
    lines.push(`  upgrade:     ${r.upgrade.status}`);
  } else {
    lines.push(`  next:        zipwiki upgrade ${pkg} --wait`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatUpgradeSummary(pkg: string, r: UpgradeTimestampResult): string {
  const lines = [`Upgrade ${pkg}: ${r.status}`];
  if (r.merkleRoot) lines.push(`  merkle root: ${r.merkleRoot}`);
  if (r.status === "confirmed") lines.push("  sidecar:     META-INF/TIMESTAMP.NZIP");
  if (r.status === "pending") {
    lines.push(`  next:        zipwiki upgrade ${pkg} --wait`);
  }
  if (r.status === "none") {
    lines.push(`  next:        zipwiki stamp ${pkg} --email <email>`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatMintSummary(pkg: string, r: MintPackageResult): string {
  if (r.mode === "direct") {
    const m = r.result.mintingResult as unknown as Record<string, unknown>;
    return (
      [
        `Minted (direct) ${pkg}`,
        `  merkle root: ${r.result.merkleRoot}`,
        `  network:     ${r.network}`,
        ...(m.tokenId !== undefined ? [`  token id:    ${String(m.tokenId)}`] : []),
        ...(m.transactionHash ? [`  tx hash:     ${String(m.transactionHash)}`] : []),
        `  sidecar:     META-INF/TOKEN.NZIP`,
      ].join("\n") + "\n"
    );
  }
  const t = r.result;
  return (
    [
      `Minted TimestampProof ${pkg}${t.alreadyMinted ? " (already minted)" : ""}`,
      `  merkle root: ${t.merkleRoot}`,
      `  network:     ${r.network}`,
      `  token id:    ${t.tokenId}`,
      `  tx hash:     ${t.transactionHash}`,
      `  owner:       ${t.owner}`,
      `  sidecar:     META-INF/TOKEN.NZIP`,
    ].join("\n") + "\n"
  );
}

export function formatVerifySummary(
  pkg: string,
  r: VerifyArchiveResult,
  online: boolean,
): string {
  const lines = [
    `Verify ${pkg} (${online ? "online" : "offline"})`,
    `  sidecar:       ${r.kind}`,
    `  status:        ${r.status}`,
    `  merkle match:  ${r.merkle.match ? "yes" : "no"}`,
  ];
  if (r.merkle.root) lines.push(`  archive root:  ${r.merkle.root}`);
  if (r.status === "upgradable") lines.push(`  next:          zipwiki upgrade ${pkg}`);
  if (r.status === "merkle-mismatch") {
    lines.push("  note:          content changed since the proof; re-stamp required");
  }
  return `${lines.join("\n")}\n`;
}
