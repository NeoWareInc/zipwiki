import { stdin, stdout } from "node:process";

/** True when prompts are allowed (real TTY, not CI). */
export function isInteractiveTty(): boolean {
  if (process.env.CI === "1" || process.env.CI === "true") return false;
  if (process.env.ZIPWIKI_FORCE_INTERACTIVE === "1") return true;
  return Boolean(stdin.isTTY && stdout.isTTY);
}
