import * as p from "@clack/prompts";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { formatZipwikiMenuIntro } from "../lib/cli/banner.js";
import { fetchClientConfig } from "@zipwiki/api-client";
import {
  activeCliAccountFromEnv,
  configuredUserOkfApiKey,
  isZipwikiAccountConnected,
  loadCachedAccountSettings,
  loadZipwikiOnboarding,
  resolveOmitOriginalDocuments,
  resolveZipwikiApiKey,
  resolveZipwikiApiUrl,
} from "../lib/config/index.js";
import { discoverInputs } from "../pipeline/discover.js";
import { runPack, type PackOptions } from "../pack.js";
import { runUpdateCommand, type UpdateCommandOptions } from "../update-cmd.js";
import { runConfigShowCommand } from "../config-cmd.js";
import { runSettingsOpen } from "../settings-cmd.js";
import { isInteractiveTty } from "./tty.js";

export function formatMenuAccountStatus(input: {
  signedIn: boolean;
  email?: string | null;
  creditsRemaining?: number | null;
  creditsUnlimited?: boolean;
  creditsUnavailable?: boolean;
}): string {
  if (!input.signedIn) {
    return "No ZipWiki account on this CLI. Run zipwiki login to use hosted credits, or pack locally without an account.";
  }
  const who = input.email?.trim()
    ? `Signed in as ${input.email.trim()}`
    : "Signed in";
  if (input.creditsUnavailable) {
    return `${who} · ZipWiki credits unavailable`;
  }
  if (input.creditsUnlimited) {
    return `${who} · ZipWiki credits unlimited`;
  }
  const credits = input.creditsRemaining ?? 0;
  return `${who} · ${credits.toLocaleString("en-US")} ZipWiki credits`;
}

export type MenuAccountStatus = {
  signedIn: boolean;
  email?: string | null;
  creditsRemaining?: number | null;
  creditsUnlimited?: boolean;
  creditsUnavailable?: boolean;
};

async function loadMenuAccountStatus(): Promise<MenuAccountStatus> {
  if (!isZipwikiAccountConnected()) return { signedIn: false };
  const email =
    activeCliAccountFromEnv()?.email ??
    loadCachedAccountSettings()?.email ??
    null;
  const url = resolveZipwikiApiUrl();
  const key = resolveZipwikiApiKey();
  if (!url || !key) return { signedIn: false };
  try {
    const config = await fetchClientConfig(url, key);
    return {
      signedIn: true,
      email,
      creditsRemaining: config.creditsRemaining,
      creditsUnlimited:
        config.creditsUnlimited === true || config.plan.slug === "unlimited",
    };
  } catch {
    return { signedIn: true, email, creditsUnavailable: true };
  }
}

/**
 * Ask to use AI OKF. Yes is the default when ZipWiki credits or a local AI
 * key can write it. No is the default only when neither is available.
 */
export function formatOkfEnrichmentPrompt(input: {
  signedIn: boolean;
  creditsRemaining?: number | null;
  creditsUnlimited?: boolean;
  creditsUnavailable?: boolean;
  hasLocalAi: boolean;
}): { message: string; initialValue: boolean } {
  const credits =
    input.signedIn &&
    input.creditsUnavailable !== true &&
    (input.creditsUnlimited === true || (input.creditsRemaining ?? 0) > 0);
  if (credits) {
    return {
      message: "Use AI for accurate OKF enrichment? (uses ZipWiki credits)",
      initialValue: true,
    };
  }
  if (input.hasLocalAi) {
    return {
      message: "Use AI for accurate OKF enrichment? (uses a local AI key)",
      initialValue: true,
    };
  }
  return {
    message:
      "Use AI for accurate OKF enrichment? (no ZipWiki credits or local AI)",
    initialValue: false,
  };
}

async function confirmAiOkf(): Promise<boolean | symbol> {
  const status = await loadMenuAccountStatus();
  return p.confirm(
    formatOkfEnrichmentPrompt({
      ...status,
      hasLocalAi: configuredUserOkfApiKey() !== undefined,
    }),
  );
}

async function menuAccountLine(): Promise<string> {
  return formatMenuAccountStatus(await loadMenuAccountStatus());
}

export type MenuChoice = { value: string; label: string };

const QUIT: MenuChoice = { value: "quit", label: "Quit" };

export function archivesInDir(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".zipwiki") || entry.name.endsWith(".nzip")),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function suggestedZipwikiPath(
  inputPath: string,
  cwd = process.cwd(),
): string {
  const abs = resolve(inputPath);
  const base = basename(abs);
  let stem = base;
  try {
    if (statSync(abs).isFile()) {
      stem = base.replace(/\.[^.]+$/, "") || base;
    }
  } catch {
    stem = base.replace(/\.[^.]+$/, "") || base;
  }
  const safe =
    stem
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "archive";
  return join(cwd, `${safe}.zipwiki`);
}

export function mainMenuChoices(archives: string[]): MenuChoice[] {
  const addChoices: MenuChoice[] =
    archives.length > 8
      ? [{ value: "add", label: "Add files to an existing archive" }]
      : archives.map((name) => ({
          value: `add:${name}`,
          label: `Add files to ${name}`,
        }));
  return [
    { value: "pack", label: "Create a new archive" },
    ...addChoices,
    { value: "settings", label: "Open account settings" },
    { value: "config", label: "Show local config" },
    { value: "help", label: "Help" },
    QUIT,
  ];
}

function quitMenu(): void {
  p.cancel("Bye.");
}

function cancelled(value: unknown): value is symbol {
  return p.isCancel(value);
}

export async function runMainMenu(): Promise<void> {
  if (!isInteractiveTty()) {
    console.error(
      "zipwiki: no command given. Try `zipwiki pack <files…>` or `zipwiki --help`.",
    );
    process.exitCode = 1;
    return;
  }

  p.intro(formatZipwikiMenuIntro());
  p.log.message(await menuAccountLine());
  const archives = archivesInDir(process.cwd());
  const choice = await p.select({
    message: "What do you want to do?",
    options: mainMenuChoices(archives),
  });
  if (cancelled(choice) || choice === "quit") {
    quitMenu();
    return;
  }
  if (choice === "settings") {
    try {
      await runSettingsOpen();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(msg);
      p.log.message("Run: zipwiki login");
    }
    return;
  }
  if (choice === "config") {
    await runConfigShowCommand({});
    return;
  }
  if (choice === "help") {
    console.log(
      [
        "zipwiki pack <files…>      Create a .zipwiki Knowledge Archive",
        "zipwiki open|search|read   Query a .zipwiki already on disk",
        "zipwiki login               Choose a saved account, or sign in in the browser",
        "zipwiki auth                Show the signed-in email and saved accounts",
        "zipwiki reset               Forget the saved login",
        "zipwiki settings show|pull|open",
        "zipwiki config api-key     Local BYO secrets only",
        "",
        "Account pack defaults live on the dashboard after login.",
      ].join("\n"),
    );
    return;
  }
  if (choice === "pack") {
    await runGuidedPack();
    return;
  }
  if (choice === "add" || choice.startsWith("add:")) {
    const named = choice.startsWith("add:") ? choice.slice(4) : undefined;
    await runGuidedAdd({ archive: named });
  }
}

export type GuidedPackOptions = PackOptions & {
  /** Prefill for the input path prompt (CLI / session source). */
  initialInput?: string;
};

export async function runGuidedPack(
  baseOpts: GuidedPackOptions = {},
): Promise<void> {
  const cached = loadCachedAccountSettings();
  const onboarding = loadZipwikiOnboarding();
  const { initialInput, ...packOpts } = baseOpts;
  const seeded =
    initialInput?.trim() && existsSync(initialInput)
      ? resolve(initialInput)
      : "";

  const input = seeded || (await promptPath("File or folder to pack"));
  if (input === "quit") {
    quitMenu();
    return;
  }
  const suggested =
    packOpts.output?.trim() || suggestedZipwikiPath(input);
  const out = await p.text({
    message: "Output .zipwiki path (Esc quits)",
    initialValue: suggested,
    placeholder: suggested,
  });
  if (cancelled(out)) {
    quitMenu();
    return;
  }
  const useAi = await confirmAiOkf();
  if (cancelled(useAi)) {
    quitMenu();
    return;
  }

  const recurse =
    packOpts.recurse !== undefined
      ? packOpts.recurse === true
      : cached?.settings.pack.recurse === true ||
        (!cached?.setupComplete && onboarding.recurse === true);
  const omitOriginalDocuments = resolveOmitOriginalDocuments({
    cli: packOpts.omitOriginalDocuments,
    pack: cached?.settings.pack,
    onboarding: cached?.setupComplete ? undefined : onboarding,
  });

  await runPack([String(input)], {
    ...packOpts,
    output: String(out).trim() || suggested,
    noAiOkf: useAi !== true,
    recurse,
    omitOriginalDocuments,
  });
}

export type GuidedAddOptions = UpdateCommandOptions & {
  archive?: string;
};

export async function runGuidedAdd(
  opts: GuidedAddOptions = {},
): Promise<void> {
  const archive = await chooseArchive(opts.archive);
  if (archive === "quit") {
    quitMenu();
    return;
  }
  const preset = (opts.add ?? []).map((file) => resolve(file));
  const files =
    preset.length > 0 ? preset : await promptAddFiles();
  if (files === "quit") {
    quitMenu();
    return;
  }
  if (files.length === 0) {
    quitMenu();
    return;
  }
  let noAiOkf = opts.noAiOkf === true;
  if (opts.noAiOkf === undefined) {
    const useAi = await confirmAiOkf();
    if (cancelled(useAi)) {
      quitMenu();
      return;
    }
    noAiOkf = useAi !== true;
  }
  const { archive: _archive, ...updateOpts } = opts;
  await runUpdateCommand(archive, {
    ...updateOpts,
    add: files,
    noAiOkf,
  });
}

async function chooseArchive(current?: string): Promise<string | "quit"> {
  const named = current?.trim();
  if (named) return resolve(named);
  const archives = archivesInDir(process.cwd());
  if (archives.length === 0) {
    const typed = await promptPath("Archive to add files to");
    return typed;
  }
  const choice = await p.select({
    message: "Which archive?",
    options: [
      ...archives.map((name) => ({ value: name, label: name })),
      QUIT,
    ],
  });
  if (cancelled(choice) || choice === "quit") return "quit";
  return resolve(process.cwd(), choice);
}

async function promptAddFiles(): Promise<string[] | "quit"> {
  for (;;) {
    const input = await promptPath("File or folder to add");
    if (input === "quit") return "quit";
    try {
      return discoverInputs([input], { recurse: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const next = await p.select({
        message,
        options: [
          { value: "retry", label: "Enter another path" },
          QUIT,
        ],
      });
      if (cancelled(next) || next === "quit") return "quit";
    }
  }
}

async function promptPath(message: string): Promise<string | "quit"> {
  for (;;) {
    const input = await p.text({
      message: `${message} (Esc quits)`,
      placeholder: "Path",
    });
    if (cancelled(input)) return "quit";
    const value = String(input).trim();
    if (!value) {
      const next = await p.select({
        message: "No path entered",
        options: [
          { value: "retry", label: "Enter a path" },
          QUIT,
        ],
      });
      if (cancelled(next) || next === "quit") return "quit";
      continue;
    }
    const abs = resolve(value);
    if (!existsSync(abs)) {
      const next = await p.select({
        message: `Not found: ${value}`,
        options: [
          { value: "retry", label: "Enter another path" },
          QUIT,
        ],
      });
      if (cancelled(next) || next === "quit") return "quit";
      continue;
    }
    return abs;
  }
}
