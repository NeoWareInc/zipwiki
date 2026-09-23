import * as p from "@clack/prompts";
import type { Command } from "commander";
import { runAuthLogin } from "../auth-cmd.js";
import {
  isZipwikiAccountConnected,
  loadCachedAccountSettings,
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

const SIGNED_OUT = "This CLI is not signed in, so portal parser and OKF settings are not loaded.";

function loginPromptMessage(): string {
  if (savedPortalLoginNeedsPrompt()) {
    return "Saved portal settings from a previous login are on this machine. Log in now?";
  }
  return `${SIGNED_OUT} Log in now?`;
}

/**
 * Signed-out account commands log in before any other work.
 * A TTY asks first. Without a TTY, login starts immediately.
 * Already signed in is a no-op.
 */
export async function resumeLoginIfSavedSettings(opts?: {
  interactive?: boolean;
  confirm?: (message: string) => Promise<boolean>;
  login?: () => Promise<void>;
}): Promise<void> {
  if (!signedOutNeedsLogin()) return;

  const login = opts?.login ?? (() => runAuthLogin({}));
  const interactive = opts?.interactive ?? isInteractiveTty();
  if (!interactive) {
    await login();
    if (!isZipwikiAccountConnected()) {
      throw new Error(`${SIGNED_OUT}\nLogin did not connect.`);
    }
    return;
  }

  const confirm =
    opts?.confirm ??
    (async (message: string) => {
      const answer = await p.confirm({
        message,
        initialValue: true,
      });
      if (p.isCancel(answer)) return false;
      return answer === true;
    });

  const yes = await confirm(loginPromptMessage());
  if (!yes) {
    throw new Error(`Stopped.\n${SIGNED_OUT}`);
  }

  await login();
  if (!isZipwikiAccountConnected()) {
    throw new Error(`${SIGNED_OUT}\nLogin did not connect.`);
  }
}
