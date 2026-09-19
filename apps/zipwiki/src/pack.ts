/**
 * Pack — thin wrapper around the unified stage orchestrator (`phase=all`).
 */
import { runStage, type StageOptions } from "./pipeline/index.js";

export type PackOptions = StageOptions;

export async function runPack(
  files: string[],
  opts: PackOptions = {},
): Promise<void> {
  await runStage(files, { ...opts, phase: opts.phase ?? "all" });
}
