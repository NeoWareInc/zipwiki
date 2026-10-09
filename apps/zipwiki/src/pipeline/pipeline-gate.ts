/**
 * Lets an in-flight parse pause new work and wait until other parse/OKF
 * workers finish before showing an interactive prompt (clean terminal).
 */

export type PipelineQuietGate = {
  /** Stop starting new parses; resolve when only this waiter is still active. */
  waitForQuiet: () => Promise<void>;
  /** Allow the scheduler to start new parses again. */
  resume: () => void;
};

let currentGate: PipelineQuietGate | null = null;

/** Active gate for the running parse→OKF pipeline, if any. */
export function getPipelineQuietGate(): PipelineQuietGate | null {
  return currentGate;
}

/** @internal */
export function setPipelineQuietGateForTests(
  gate: PipelineQuietGate | null,
): void {
  currentGate = gate;
}

/**
 * Install a quiet gate for the duration of `fn` (usually one pipeline run).
 */
export async function withPipelineQuietGate<T>(
  gate: PipelineQuietGate,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = currentGate;
  currentGate = gate;
  try {
    return await fn();
  } finally {
    currentGate = prev;
  }
}
