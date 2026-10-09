/**
 * Interactive gate when LiteParse cannot convert Office docs without LibreOffice.
 */
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import { isInteractiveTty } from "../../interactive/tty.js";
import { getPipelineQuietGate } from "../../pipeline/pipeline-gate.js";
import {
  isLibreOfficeMissingIgnored,
  setIgnoreLibreOfficeMissing,
} from "../config/cli-preferences.js";
import {
  isLibreOfficeMissingError,
  libreOfficeInstallCommand,
} from "./libreoffice-hint.js";

export type LibreOfficeMissingAction = "continue" | "retry" | "cancel";

export type LibreOfficeMissingPromptDeps = {
  interactive?: boolean;
  quiet?: boolean;
  yes?: boolean;
  /** Filename that failed (for the message). */
  filename?: string;
  log?: (line: string) => void;
  /** Test seam: skip real install. */
  runInstall?: (cmd: { command: string; args: string[] }) => {
    ok: boolean;
    detail?: string;
  };
  /** Test seam: override the select. */
  promptChoice?: () => Promise<
    "install" | "continue" | "ignore" | "cancel" | symbol
  >;
  isIgnored?: () => boolean;
  setIgnored?: (value: boolean) => void;
  /** Test seam: pipeline quiet barrier (defaults to active scheduler gate). */
  getGate?: () => {
    waitForQuiet: () => Promise<void>;
    resume: () => void;
  } | null;
};

/** Session: after Continue/Ignore, do not prompt again until process exit. */
let sessionSkipPrompt = false;
/** Session: Cancel was chosen — every later call returns cancel (no second prompt). */
let sessionCancelled = false;
let inFlight: Promise<LibreOfficeMissingAction> | null = null;
let quietAnnounced = false;

/** @internal */
export function resetLibreOfficePromptSessionForTests(): void {
  sessionSkipPrompt = false;
  sessionCancelled = false;
  inFlight = null;
  quietAnnounced = false;
}

function defaultInstall(cmd: {
  command: string;
  args: string[];
}): { ok: boolean; detail?: string } {
  const result = spawnSync(cmd.command, cmd.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    return { ok: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      detail: `${cmd.command} exited with code ${result.status ?? "unknown"}`,
    };
  }
  return { ok: true };
}

async function askChoice(
  filename: string | undefined,
  installLabel: string | null,
  promptChoice?: LibreOfficeMissingPromptDeps["promptChoice"],
): Promise<"install" | "continue" | "ignore" | "cancel"> {
  if (promptChoice) {
    const raw = await promptChoice();
    if (p.isCancel(raw)) return "cancel";
    return raw as "install" | "continue" | "ignore" | "cancel";
  }
  const options: Array<{
    value: "install" | "continue" | "ignore" | "cancel";
    label: string;
    hint?: string;
  }> = [];
  if (installLabel) {
    options.push({
      value: "install",
      label: "Install LibreOffice",
      hint: installLabel,
    });
  } else {
    options.push({
      value: "install",
      label: "Show install instructions",
      hint: "then retry after installing",
    });
  }
  options.push(
    {
      value: "continue",
      label: "Continue without LibreOffice",
      hint: "Office docs stay unparsed for this pack",
    },
    {
      value: "ignore",
      label: "Ignore this warning",
      hint: "do not ask again",
    },
    { value: "cancel", label: "Cancel pack" },
  );
  const choice = await p.select({
    message: filename
      ? `LibreOffice is required to parse ${filename}`
      : "LibreOffice is required to parse Office documents",
    options,
    initialValue: installLabel ? "install" : "continue",
  });
  if (p.isCancel(choice)) return "cancel";
  return choice as "install" | "continue" | "ignore" | "cancel";
}

/**
 * When a parse fails because LibreOffice is missing, optionally stop and prompt.
 * Returns `retry` after a successful install attempt, `continue` to soft-fail,
 * or `cancel` so the caller can abort the pack.
 *
 * Waits for other in-flight parse/OKF work to finish before showing the prompt
 * so stage logs are not interleaved with the interactive UI; resumes the
 * pipeline after Continue / Ignore / Install→retry. Cancel does not resume
 * (the pack is aborting) and suppresses any further LibreOffice prompts.
 */
export async function resolveLibreOfficeMissing(
  err: unknown,
  deps: LibreOfficeMissingPromptDeps = {},
): Promise<LibreOfficeMissingAction> {
  if (!isLibreOfficeMissingError(err)) return "continue";
  if (sessionCancelled) return "cancel";

  const ignored = deps.isIgnored?.() ?? isLibreOfficeMissingIgnored();
  if (ignored || sessionSkipPrompt) return "continue";

  const interactive = deps.interactive ?? isInteractiveTty();
  if (!interactive || deps.quiet === true || deps.yes === true) {
    return "continue";
  }

  const log = deps.log ?? ((line: string) => console.error(line));
  const gate =
    deps.getGate !== undefined ? deps.getGate() : getPipelineQuietGate();

  // Register every concurrent caller as a quiet waiter so the scheduler does
  // not treat coalesced prompt waiters as still-busy parse workers.
  if (gate) {
    if (!quietAnnounced) {
      quietAnnounced = true;
      log(
        "[zipwiki] LibreOffice needed — waiting for in-flight work to finish…",
      );
    }
    await gate.waitForQuiet();
  }

  // Cancel may have been chosen while we waited for quiet.
  if (sessionCancelled) return "cancel";

  let action: LibreOfficeMissingAction = "continue";
  try {
    if (!inFlight) {
      inFlight = (async () => {
        const install = libreOfficeInstallCommand();
        const choice = await askChoice(
          deps.filename,
          install?.label ?? null,
          deps.promptChoice,
        );

        if (choice === "cancel") {
          sessionCancelled = true;
          return "cancel";
        }
        if (choice === "ignore") {
          (deps.setIgnored ?? setIgnoreLibreOfficeMissing)(true);
          sessionSkipPrompt = true;
          log(
            "[zipwiki] Ignoring LibreOffice warnings (saved in ~/.zipwiki/cli-preferences.json).",
          );
          return "continue";
        }
        if (choice === "continue") {
          sessionSkipPrompt = true;
          log(
            "[zipwiki] Continuing without LibreOffice — Office documents will stay unparsed.",
          );
          return "continue";
        }

        // install
        if (!install) {
          log(
            "[zipwiki] Install LibreOffice, then choose Install again or Continue:",
          );
          log("  macOS:   brew install --cask libreoffice");
          log("  Ubuntu:  sudo apt-get install -y libreoffice");
          log("  Windows: choco install libreoffice-fresh -y");
          const again = await askChoice(
            deps.filename,
            null,
            deps.promptChoice,
          );
          if (again === "cancel") {
            sessionCancelled = true;
            return "cancel";
          }
          if (again === "ignore") {
            (deps.setIgnored ?? setIgnoreLibreOfficeMissing)(true);
            sessionSkipPrompt = true;
            return "continue";
          }
          if (again === "continue") {
            sessionSkipPrompt = true;
            return "continue";
          }
          // User says they installed manually — retry parse.
          return "retry";
        }

        log(`[zipwiki] Running: ${install.label}`);
        const run = deps.runInstall ?? defaultInstall;
        const result = run({ command: install.command, args: install.args });
        if (!result.ok) {
          log(
            `[zipwiki] LibreOffice install failed${result.detail ? `: ${result.detail}` : ""}.`,
          );
          sessionSkipPrompt = true;
          return "continue";
        }
        log("[zipwiki] LibreOffice install finished — retrying parse.");
        return "retry";
      })().finally(() => {
        inFlight = null;
      });
    }

    action = await inFlight;
    return action;
  } finally {
    // Resume only when the pack continues; Cancel must not restart parses
    // before PackAbortedError aborts the scheduler (that caused a second prompt).
    if (action !== "cancel" && !sessionCancelled) {
      gate?.resume();
    }
  }
}
