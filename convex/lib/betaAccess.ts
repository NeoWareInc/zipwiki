import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isBootstrapAdminEmail } from "./adminEmails";
import { CONTACT_INBOX } from "./contactForm";

export type BetaAccessMode = "invite" | "open";

type DbCtx = MutationCtx | QueryCtx;

export const DEFAULT_OPEN_USER_LIMIT = 500;

export const INVITE_ONLY_TITLE = "Development access is invite-only";

export const INVITE_ONLY_MESSAGE =
  `This development site is limited to invited beta testers and NeoWare operators. ` +
  `If you received an invite, sign in with that email. ` +
  `To request an invite, use Request Invite or email ${CONTACT_INBOX}.`;

export const CAPACITY_TITLE = "ZipWiki beta is at capacity";

/** Public copy — never include the numeric seat cap. */
export const LIMITED_SEATS_MESSAGE =
  "During beta development, a limited number of account seats are available.";

export function capacityMessage(): string {
  return (
    `${LIMITED_SEATS_MESSAGE} ` +
    `We've filled the current cohort. ` +
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

export function capacityDenial(_limit?: number): BetaGateDenial {
  return {
    code: "capacity",
    title: CAPACITY_TITLE,
    message: capacityMessage(),
  };
}

async function countAccountsUpTo(ctx: DbCtx, limit: number): Promise<number> {
  if (limit <= 0) {
    const all = await ctx.db.query("accounts").collect();
    return all.length;
  }
  const rows = await ctx.db.query("accounts").take(limit + 1);
  return rows.length;
}

async function emailHasInvite(ctx: DbCtx, email: string): Promise<boolean> {
  const invite = await ctx.db
    .query("betaInvites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return Boolean(invite);
}

/**
 * Decide whether a new account may be created for this email.
 * Existing accounts always pass (checked by the caller).
 * Lives in lib/ so profiles.ts does not import a Convex functions module.
 */
export async function denialForNewAccount(
  ctx: MutationCtx,
  email: string,
): Promise<BetaGateDenial | null> {
  const normalized = email.trim().toLowerCase();
  if (isAlwaysAllowedEmail(normalized)) return null;

  const mode: BetaAccessMode = resolveBetaAccessMode();
  if (mode === "invite") {
    if (await emailHasInvite(ctx, normalized)) return null;
    return inviteOnlyDenial();
  }

  const limit = resolveBetaUserLimit();
  if (limit <= 0) return null;
  const count = await countAccountsUpTo(ctx, limit);
  if (count < limit) return null;
  return capacityDenial(limit);
}

/** Shared with betaAccess.status for open-mode capacity UI. */
export async function accountCountForLimit(
  ctx: DbCtx,
  limit: number,
): Promise<number> {
  return countAccountsUpTo(ctx, limit);
}
