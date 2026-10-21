import { isBootstrapAdminEmail } from "./adminEmails";
import { CONTACT_INBOX } from "./contactForm";

export type BetaAccessMode = "invite" | "open";

export const DEFAULT_OPEN_USER_LIMIT = 500;

export const INVITE_ONLY_TITLE = "Development access is invite-only";

export const INVITE_ONLY_MESSAGE =
  `This development site is limited to invited beta testers and NeoWare operators. ` +
  `If you received an invite, sign in with that email. ` +
  `To request an invite, use Request Invite or email ${CONTACT_INBOX}.`;

export const CAPACITY_TITLE = "ZipWiki beta is at capacity";

export function capacityMessage(limit: number): string {
  return (
    `We've reached our initial limit of ${limit.toLocaleString()} beta accounts. ` +
    `You can still install the CLI and pack or query .zipwiki packages on your machine. ` +
    `Leave your email below and we'll notify you when a seat opens or the next cohort starts. ` +
    `You can also write to ${CONTACT_INBOX}.`
  );
}

/** Resolve mode from env, falling back to SITE_URL host. */
export function resolveBetaAccessMode(
  env: NodeJS.ProcessEnv = process.env,
): BetaAccessMode {
  const raw = (env.BETA_ACCESS_MODE ?? "").trim().toLowerCase();
  if (raw === "invite" || raw === "invite-only") return "invite";
  if (raw === "open") return "open";
  const site = (env.SITE_URL ?? "").toLowerCase();
  // Prefer SITE_URL only — WEB_ORIGIN often lists localhost on both stacks.
  if (site.includes("dev.zipwiki.ai")) return "invite";
  return "open";
}

/** Account cap for open mode. Ignored for invite mode. 0 or negative = unlimited. */
export function resolveBetaUserLimit(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = (env.BETA_USER_LIMIT ?? "").trim();
  if (raw === "") return DEFAULT_OPEN_USER_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_OPEN_USER_LIMIT;
  return n;
}

export function isAlwaysAllowedEmail(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isBootstrapAdminEmail(email, env);
}

export type BetaGateDenial = {
  code: "invite_only" | "capacity";
  title: string;
  message: string;
};

export function inviteOnlyDenial(): BetaGateDenial {
  return {
    code: "invite_only",
    title: INVITE_ONLY_TITLE,
    message: INVITE_ONLY_MESSAGE,
  };
}

export function capacityDenial(limit: number): BetaGateDenial {
  return {
    code: "capacity",
    title: CAPACITY_TITLE,
    message: capacityMessage(limit),
  };
}
