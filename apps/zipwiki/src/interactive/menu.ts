import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadCachedAccountSettings,
  loadZipwikiOnboarding,
  resolveOmitOriginalDocuments,
} from "../lib/config/index.js";
import { REPO_ROOT } from "../lib/parse/index.js";
import { runPack, type PackOptions } from "../pack.js";
import { runConfigShowCommand } from "../config-cmd.js";
import { runSettingsOpen } from "../settings-cmd.js";
import { isInteractiveTty } from "./tty.js";

export async function runMainMenu(): Promise<void> {
  if (!isInteractiveTty()) {
    console.error(
      "zipwiki: no command given. Try `zipwiki pack <files…>` or `zipwiki --help`.",
    );
    process.exitCode = 1;
    return;
  }

  p.intro("ZipWiki / zipwiki");
  const choice = await p.select({
    message: "What do you want to do?",
    options: [
      { value: "pack", label: "Pack documents into .zipwiki" },
      { value: "settings", label: "Open account settings" },
      { value: "config", label: "Show local config" },
      { value: "help", label: "Help" },
      { value: "quit", label: "Quit" },
    ],
  });
  if (p.isCancel(choice) || choice === "quit") {
    p.cancel("Bye.");
    return;
  }
  if (choice === "settings") {
    try {
      await runSettingsOpen();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(msg);
      p.log.message("Run: zipwiki auth login");
    }
    return;
  }
  if (choice === "config") {
    runConfigShowCommand({});
    return;
  }
  if (choice === "help") {
    console.log(
      [
        "zipwiki pack <files…>      Create .zipwiki (LiteParse works without login)",
        "zipwiki auth login         Connect account (hosted parse/OKF + settings)",
        "zipwiki settings show|pull|open",
        "zipwiki config api-key     Local BYO secrets only",
        "zipwiki list|test|extract  Inspect archives (offline OK)",
        "",
        "Account pack defaults live on the dashboard after login; zipwiki.config.json overlays.",
      ].join("\n"),
    );
    return;
  }
  if (choice === "pack") {
    await runGuidedPack();
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
  const sample = resolve(REPO_ROOT, "sample-docs");
  const { initialInput, ...packOpts } = baseOpts;
  const initial =
    (initialInput?.trim() && existsSync(initialInput)
      ? resolve(initialInput)
      : undefined) ??
    (existsSync(sample) ? sample : process.cwd());

  const input = await p.text({
    message: "Input file or directory",
    initialValue: initial,
  });
  if (p.isCancel(input)) {
    p.cancel("Cancelled.");
    return;
  }
  const out = await p.text({
    message: "Output .zipwiki path (optional)",
    placeholder: "derived from inputs",
  });
  if (p.isCancel(out)) {
    p.cancel("Cancelled.");
    return;
  }
  const noAi = await p.confirm({
    message: "Skip AI OKF enrichment? (needs LLM API keys in env if No)",
    initialValue: true,
  });
  if (p.isCancel(noAi)) {
    p.cancel("Cancelled.");
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
    output: String(out).trim() || undefined,
    noAiOkf: noAi === true,
    recurse,
    omitOriginalDocuments,
  });
}
