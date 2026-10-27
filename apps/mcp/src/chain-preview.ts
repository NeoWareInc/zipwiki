/**
 * Markdown-table approval preview for chain tools (stamp / upgrade / mint).
 * Same contract as `pack`: first call returns a table and STOPs; only a later
 * call with confirm:true and humanApproved:true mutates the package.
 */
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  archiveMerkleRoot,
  maskEmail,
  maskMiddle,
  normalizeChainNetwork,
  resolveChainSettings,
  walletAddressFromKey,
  type ResolveChainSettingsOptions,
} from "@zipwiki/zipwiki/chain";

export type ChainAction = "stamp" | "upgrade" | "mint";

export type McpChainArgs = {
  package?: string;
  network?: string;
  /** stamp only */
  email?: string;
  /** stamp only */
  force?: boolean;
  /** stamp / upgrade: poll until confirmed */
  wait?: boolean;
  /** mint only: mint from the wallet (no TIMESTAMP.NZIP) */
  direct?: boolean;
  confirm?: boolean;
  humanApproved?: boolean;
  /** Test hook. Not an MCP tool field. */
  settings?: ResolveChainSettingsOptions;
};

export type ChainPlanSnapshot = {
  action: ChainAction;
  mode: string;
  package: string;
  network: string;
  merkleRoot: string | null;
  email: string | null;
  walletAddress: string | null;
  nextStep: string;
};

export type ChainPreview = {
  status: "preview";
  awaitingHumanApproval: true;
  /** Paste this markdown table into the chat. */
  displayForUser: string;
  cliCommand: string;
  message: string;
  agentInstruction: string;
  plan: ChainPlanSnapshot;
  warnings: string[];
};

export const CHAIN_AGENT_INSTRUCTION =
  "Paste displayForUser and STOP; wait for human yes; then call again with confirm:true and humanApproved:true";

const CHAIN_STOP_MESSAGE =
  "STOP. Paste displayForUser into the chat as a markdown table for the human. " +
  "Wait for their next message. Only after they approve (yes) call this tool again " +
  "with confirm:true and humanApproved:true. Do not invent humanApproved in this same turn.";

export function shortDigest(root: string | null): string {
  return root ? `\`${maskMiddle(root, 10, 8)}\`` : "(unavailable)";
}

function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function resolveChainPackage(pkg: string | undefined): string {
  const raw = pkg?.trim() || "wiki.zipwiki";
  const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  if (!existsSync(abs)) {
    throw new Error(`Package not found: ${abs}`);
  }
  return abs;
}

/** True unless confirm:true was passed. */
export function isChainPreviewOnly(args: McpChainArgs): boolean {
  return args.confirm !== true;
}

export function formatChainCli(
  action: ChainAction,
  plan: ChainPlanSnapshot,
  args: McpChainArgs,
): string {
  const parts = ["zipwiki", action, plan.package];
  if (action !== "upgrade") parts.push("--network", plan.network);
  if (action === "stamp") {
    if (plan.email) parts.push("--email", "<email>");
    if (args.force) parts.push("--force");
  }
  if (action === "mint" && args.direct) parts.push("--direct");
  if ((action === "stamp" || action === "upgrade") && args.wait) {
    parts.push("--wait");
  }
  return parts.map((p) => (p === "<email>" ? p : shellQuote(p))).join(" ");
}

export function formatChainPlanDisplay(
  plan: ChainPlanSnapshot,
  warnings: string[],
  cliCommand: string,
): string {
  const who =
    plan.action === "mint"
      ? (plan.walletAddress ?? "(no wallet key)")
      : (plan.email ?? "(no email)");
  const lines = [
    `### ZipWiki ${plan.action} plan — please confirm`,
    "",
    "| Action | Package | Network | Merkle root | " +
      (plan.action === "mint" ? "Wallet" : "Email") +
      " | Next step |",
    "| --- | --- | --- | --- | --- | --- |",
    `| ${plan.action} (${plan.mode}) | \`${plan.package}\` | ${plan.network} | ${shortDigest(plan.merkleRoot)} | ${who} | ${plan.nextStep} |`,
  ];
  if (warnings.length > 0) {
    lines.push("", "**Notes**");
    for (const w of warnings) lines.push(`- ${w}`);
  }
  lines.push(
    "",
    "**CLI** (copy if you want to run it yourself)",
    "",
    "```bash",
    cliCommand,
    "```",
    "",
    `Reply **yes** to ${plan.action} this package, or say what to change.`,
  );
  return lines.join("\n");
}

export async function resolveChainPreview(
  action: ChainAction,
  args: McpChainArgs,
): Promise<ChainPreview> {
  const pkg = resolveChainPackage(args.package);
  const settings = await resolveChainSettings({
    ...args.settings,
    overrides: {
      ...args.settings?.overrides,
      network: normalizeChainNetwork(args.network),
      ...(action === "stamp" ? { email: args.email } : {}),
    },
  });
  const merkleRoot = await archiveMerkleRoot(pkg);

  const warnings: string[] = [];
  let mode: string;
  let nextStep: string;
  let walletAddress: string | null = null;

  if (action === "stamp") {
    mode = "Token Service timestamp";
    nextStep = args.wait
      ? "Submit root, then wait for on-chain confirmation (TIMESTAMP.NZIP)"
      : "Submit root (TS-SUBMIT.NZIP, pending); run upgrade later";
    warnings.push(
      "Only the 64-hex Merkle root and your email go to the Token Service. No document content is uploaded.",
    );
    if (!settings.email) {
      warnings.push(
        "No verified email found. Pass email, set NEOZIP_RECIPIENT_EMAIL, or add it to ~/.zipwiki/chain.json before confirming.",
      );
    }
    if (args.force) {
      warnings.push(
        "force:true replaces an existing proof bound to the current content.",
      );
    }
  } else if (action === "upgrade") {
    mode = "TS-SUBMIT → TIMESTAMP";
    nextStep = args.wait
      ? "Poll until confirmed, then write TIMESTAMP.NZIP"
      : "Check once; write TIMESTAMP.NZIP if the batch is confirmed";
    warnings.push("Contacts the Token Service. Rewrites the package sidecars on success.");
  } else {
    mode = args.direct ? "direct wallet mint" : "TimestampProof NFT";
    nextStep = args.direct
      ? "Mint from wallet and write TOKEN.NZIP"
      : "Mint from confirmed TIMESTAMP.NZIP and write TOKEN.NZIP";
    warnings.push("Minting spends gas from your wallet on-chain.");
    if (!args.direct) {
      warnings.push("Default mint needs a confirmed TIMESTAMP.NZIP (run stamp, then upgrade).");
    }
    if (settings.walletKey) {
      const addr = walletAddressFromKey(settings.walletKey);
      walletAddress = addr ? maskMiddle(addr, 6, 4) : "(wallet key set)";
    } else {
      warnings.push(
        "No wallet key found. Set ZIPWIKI_WALLET_KEY or NEOZIP_WALLET_PASSKEY in the MCP environment before confirming. The key is never accepted as a tool argument.",
      );
    }
  }
  if (merkleRoot === null) {
    warnings.push("Could not compute the package Merkle root (no content members or integrity error).");
  }

  const plan: ChainPlanSnapshot = {
    action,
    mode,
    package: pkg,
    network: settings.network,
    merkleRoot,
    email: settings.email ? maskEmail(settings.email) : null,
    walletAddress,
    nextStep,
  };
  const cliCommand = formatChainCli(action, plan, args);
  return {
    status: "preview",
    awaitingHumanApproval: true,
    displayForUser: formatChainPlanDisplay(plan, warnings, cliCommand),
    cliCommand,
    message: CHAIN_STOP_MESSAGE,
    agentInstruction: CHAIN_AGENT_INSTRUCTION,
    plan,
    warnings,
  };
}
