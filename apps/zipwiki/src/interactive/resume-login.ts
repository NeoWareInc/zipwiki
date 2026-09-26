import * as p from "@clack/prompts";
import type { Command } from "commander";
import { ZipwikiApiError, type AccountSettingsResponse } from "@zipwiki/api-client";
import { runAuthLogin } from "../auth-cmd.js";
import {
  isZipwikiAccountConnected,
  loadCachedAccountSettings,
  pullAccountSettings,
  syncAccountSettingsForPack,
} from "../lib/config/account-settings-cache.js";
import { isInteractiveTty } from "./tty.js";

/** Offline and auth/config commands must not be blocked by a login prompt. */
const SKIP_LOGIN_PROMPT = new Set([
  "auth",
  "config",
  "list",
  "catalog",
  "search",
  "test",
  "read",
  "read-manifest",
  "origin",
  "extract",
  "parse-file",
  "is-complex",
  "screenshot",
  "help",
]);

/**
 * True when this machine still has portal settings from a login, but the
 * current process has no API URL and key.
 */
export function savedPortalLoginNeedsPrompt(): boolean {
  if (isZipwikiAccountConnected()) return false;
  return loadCachedAccountSettings() !== null;
}

/** True when this process has no API URL and key. */
export function signedOutNeedsLogin(): boolean {
  return !isZipwikiAccountConnected();
}

export function commandSkipsLoginPrompt(names: readonly string[]): boolean {
  const [leaf, parent] = names;
  // Top-level `open` is the catalog. `settings open` still needs an account.
  if (leaf === "open" && parent === "settings") return false;
  if (leaf === "open") return true;
  return names.some((name) => SKIP_LOGIN_PROMPT.has(name));
}

export function commandNames(cmd: Command): string[] {
  const names: string[] = [];
  let cur: Command | null = cmd;
  while (cur) {
    if (cur.name()) names.push(cur.name());
    cur = cur.parent;
  }
  return names;
}

export type LoginPromptReason = "signed-out" | "unauthorized" | "saved";

/** What portal login unlocks — print before asking to log in. */
export function portalLoginNeededExplainer(reason: LoginPromptReason): string {
  const need = [
    "Portal login loads your dashboard Settings into this CLI:",
    "  • Parser (LiteParse vs hosted LlamaParse)",
    "  • ZipWiki OKF / Claude model (CLI & website — not MCP)",
  ].join("\n");

  if (reason === "unauthorized") {
    return [
      "Your ZipWiki API key was rejected (expired, revoked, or wrong host).",
      "Until you log in again, this CLI cannot pull Settings and ZipWiki AI OKF will not run.",
      need,
    ].join("\n");
  }
  if (reason === "saved") {
    return [
      "Saved portal Settings are on this machine, but this CLI is not signed in.",
      need,
    ].join("\n");
  }
  return [
    "This CLI is not signed in, so portal Settings were not loaded.",
    need,
  ].join("\n");
}

export function loginConfirmMessage(reason: LoginPromptReason): string {
  if (reason === "unauthorized") {
    return "Log in now to get a new API key and pull Settings?";
  }
  if (reason === "saved") {
    return "Log in now to use those portal Settings (parser + ZipWiki OKF)?";
  }
  return "Log in now to load portal Settings (parser + ZipWiki OKF)?";
}

export function isUnauthorizedApiError(err: unknown): boolean {
  if (err instanceof ZipwikiApiError) {
    return err.status === 401 || err.status === 403;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /unauthorized|401|403|invalid.?api.?key|revoked/i.test(msg);
}

async function defaultConfirm(message: string): Promise<boolean> {
  const answer = await p.confirm({
    message,
    initialValue: true,
  });
  if (p.isCancel(answer)) return false;
  return answer === true;
}

/**
 * Print why login is required, ask clearly, then run auth login (which pulls Settings).
 */
export async function promptAndRunLogin(opts: {
  reason: LoginPromptReason;
  interactive?: boolean;
  confirm?: (message: string) => Promise<boolean>;
  login?: () => Promise<void>;
  quiet?: boolean;
}): Promise<void> {
  const login = opts.login ?? (() => runAuthLogin({}));
  const interactive = opts.interactive ?? isInteractiveTty();
  const explainer = portalLoginNeededExplainer(opts.reason);

  if (!opts.quiet) {
    console.error("");
    console.error("[zipwiki] ── Portal login needed ──");
    for (const line of explainer.split("\n")) {
      console.error(`[zipwiki] ${line}`);
    }
    console.error("");
  }

  if (!interactive) {
    if (!opts.quiet) {
      console.error(
        "[zipwiki] Non-interactive session — starting login (or run: zipwiki auth login).",
      );
    }
    await login();
    if (!isZipwikiAccountConnected()) {
      throw new Error(
        `${explainer}\nLogin did not connect. Run: zipwiki auth login`,
      );
    }
    return;
  }

  const confirm = opts.confirm ?? defaultConfirm;
  const yes = await confirm(loginConfirmMessage(opts.reason));
  if (!yes) {
    throw new Error(
      [
        "Stopped — portal Settings were not loaded.",
        "When you are ready:",
        "  zipwiki auth login",
        "  (login pulls Settings automatically)",
      ].join("\n"),
    );
  }

  await login();
  if (!isZipwikiAccountConnected()) {
    throw new Error(
      `${explainer}\nLogin did not connect. Run: zipwiki auth login`,
    );
  }
}

/**
 * Signed-out account commands log in before any other work.
 * A TTY asks first. Without a TTY, login starts immediately.
 * Already signed in is a no-op (unauthorized keys are handled during settings sync).
 */
export async function resumeLoginIfSavedSettings(opts?: {
  interactive?: boolean;
  confirm?: (message: string) => Promise<boolean>;
  login?: () => Promise<void>;
}): Promise<void> {
  if (!signedOutNeedsLogin()) return;

  const reason: LoginPromptReason = savedPortalLoginNeedsPrompt()
    ? "saved"
    : "signed-out";

  await promptAndRunLogin({
    reason,
    interactive: opts?.interactive,
    confirm: opts?.confirm,
    login: opts?.login,
  });
}

/**
 * Pack path: pull live portal Settings. On unauthorized API key, offer login
 * (login pulls Settings), then retry. Other network errors soft-fall back to
 * cache via syncAccountSettingsForPack.
 */
export async function syncAccountSettingsForPackWithAuth(opts?: {
  quiet?: boolean;
  interactive?: boolean;
  confirm?: (message: string) => Promise<boolean>;
  login?: () => Promise<void>;
}): Promise<AccountSettingsResponse> {
  if (!isZipwikiAccountConnected()) {
    // Pack may continue offline only after the preAction login prompt was skipped
    // (--no-ai-okf). Still use local defaults without a second prompt here.
    return syncAccountSettingsForPack({ quiet: opts?.quiet });
  }

  try {
    const payload = await pullAccountSettings({ quiet: opts?.quiet });
    if (!payload.setupComplete) {
      const url =
        payload.setupUrl ??
        "Finish Settings in the dashboard (same account as this API key).";
      throw new Error(
        `Account setup incomplete. Complete the settings wizard, then retry.\n  ${url}`,
      );
    }
    return payload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Account setup incomplete/i.test(msg)) throw err;

    if (isUnauthorizedApiError(err)) {
      await promptAndRunLogin({
        reason: "unauthorized",
        interactive: opts?.interactive,
        confirm: opts?.confirm,
        login: opts?.login,
        quiet: opts?.quiet,
      });
      const payload = await pullAccountSettings({ quiet: opts?.quiet });
      if (!payload.setupComplete) {
        const url =
          payload.setupUrl ??
          "Finish Settings in the dashboard (same account as this API key).";
        throw new Error(
          `Account setup incomplete. Complete the settings wizard, then retry.\n  ${url}`,
        );
      }
      return payload;
    }

    // Non-auth failures: keep prior soft-fallback behavior.
    return syncAccountSettingsForPack({ quiet: opts?.quiet });
  }
}
