/**
 * Bounded parse → OKF pipeline scheduler.
 *
 * Interleaving is intentional: OKF (especially remote AI, often multi-second)
 * runs for file i while parse(i+1…) continues. That cuts wall time vs
 * “all parse then all OKF”. Logging must stay single-line / completion-only
 * so concurrent workers do not corrupt the terminal.
 */

import {
  withPipelineQuietGate,
  type PipelineQuietGate,
} from "./pipeline-gate.js";

export type SchedulerHooks<TParse, TOkf> = {
  parse: (item: string, index: number) => Promise<TParse>;
  okf: (item: string, index: number, parsed: TParse) => Promise<TOkf>;
  onParseError?: (item: string, index: number, err: unknown) => void;
  onOkfError?: (item: string, index: number, err: unknown) => void;
  failFast?: boolean;
};

export type SchedulerResult<TParse, TOkf> = {
  parsed: Array<{ item: string; index: number; value?: TParse; error?: string }>;
  okf: Array<{ item: string; index: number; value?: TOkf; error?: string }>;
  errors: number;
};

export async function runParseOkfPipeline<TParse, TOkf>(
  items: string[],
  concurrency: number,
  hooks: SchedulerHooks<TParse, TOkf>,
): Promise<SchedulerResult<TParse, TOkf>> {
  const limit = Math.max(1, Math.floor(concurrency) || 1);
  const parsed: SchedulerResult<TParse, TOkf>["parsed"] = new Array(items.length);
  const okf: SchedulerResult<TParse, TOkf>["okf"] = new Array(items.length);
  let errors = 0;
  let nextParse = 0;
  let activeParse = 0;
  let activeOkf = 0;
  let finishedParse = 0;
  let finishedOkf = 0;
  let abort = false;
  /** When true, do not start additional parses (interactive gate pending). */
  let pauseNewParses = false;
  /**
   * Pump id allowed to finish filling concurrency after pause is set mid-loop
   * (so waitForQuiet from a just-started parse does not starve sibling slots).
   * Only set when waitForQuiet runs synchronously inside pumpParse.
   */
  let pumpGeneration = 0;
  let pumpDepth = 0;
  let fillBurstPumpId: number | null = null;
  let quietWaiters: Array<() => void> = [];

  const okfQueue: Array<{ item: string; index: number; value: TParse }> = [];

  const flushQuietWaiters = () => {
    if (!pauseNewParses || quietWaiters.length === 0) return;
    // Current pump is still filling concurrency slots after pause.
    if (fillBurstPumpId !== null) return;
    if (activeOkf !== 0 || okfQueue.length > 0) return;
    // Every still-active parse is blocked in waitForQuiet — safe to prompt.
    if (activeParse !== quietWaiters.length) return;
    const resolvers = quietWaiters;
    quietWaiters = [];
    for (const resolve of resolvers) resolve();
  };

  let resumeParsePump = () => {
    /* assigned after pumpParse exists */
  };

  const gate: PipelineQuietGate = {
    waitForQuiet: () => {
      pauseNewParses = true;
      // Only hold flush for a sync fill-burst when called from inside pumpParse.
      // Async LibreOffice failures run after the pump has returned; setting
      // fillBurstPumpId then would deadlock (nothing clears it → exit 13).
      if (pumpDepth > 0) {
        fillBurstPumpId = pumpGeneration;
      }
      return new Promise<void>((resolve) => {
        quietWaiters.push(resolve);
        flushQuietWaiters();
      });
    },
    resume: () => {
      pauseNewParses = false;
      fillBurstPumpId = null;
      resumeParsePump();
    },
  };

  return await withPipelineQuietGate(gate, () => {
    return new Promise((resolvePromise, rejectPromise) => {
      const maybeDone = () => {
        if (abort) return;
        if (
          finishedParse === items.length &&
          finishedOkf === items.length &&
          activeParse === 0 &&
          activeOkf === 0 &&
          okfQueue.length === 0
        ) {
          resolvePromise({ parsed, okf, errors });
        }
      };

      const fail = (err: unknown) => {
        if (abort) return;
        abort = true;
        pauseNewParses = false;
        const resolvers = quietWaiters;
        quietWaiters = [];
        for (const resolve of resolvers) resolve();
        rejectPromise(err instanceof Error ? err : new Error(String(err)));
      };

      const pumpOkf = () => {
        if (abort) return;
        while (activeOkf < limit && okfQueue.length > 0) {
          const job = okfQueue.shift()!;
          activeOkf += 1;
          void hooks
            .okf(job.item, job.index, job.value)
            .then((value) => {
              okf[job.index] = { item: job.item, index: job.index, value };
            })
            .catch((err) => {
              errors += 1;
              const msg = err instanceof Error ? err.message : String(err);
              okf[job.index] = { item: job.item, index: job.index, error: msg };
              hooks.onOkfError?.(job.item, job.index, err);
              if (hooks.failFast) fail(err);
            })
            .finally(() => {
              activeOkf -= 1;
              finishedOkf += 1;
              flushQuietWaiters();
              pumpOkf();
              maybeDone();
            });
        }
        flushQuietWaiters();
        maybeDone();
      };

      const pumpParse = () => {
        if (abort) return;
        const myPumpId = ++pumpGeneration;
        pumpDepth += 1;
        try {
          while (activeParse < limit && nextParse < items.length) {
            if (pauseNewParses && fillBurstPumpId !== myPumpId) break;
            const index = nextParse;
            const item = items[index]!;
            nextParse += 1;
            activeParse += 1;
            void hooks
              .parse(item, index)
              .then((value) => {
                parsed[index] = { item, index, value };
                okfQueue.push({ item, index, value });
                pumpOkf();
              })
              .catch((err) => {
                // User aborted an interactive gate (e.g. LibreOffice prompt).
                if (
                  err instanceof Error &&
                  (err.name === "PackAbortedError" || err.name === "AbortError")
                ) {
                  fail(err);
                  return;
                }
                errors += 1;
                const msg = err instanceof Error ? err.message : String(err);
                parsed[index] = { item, index, error: msg };
                // Still count OKF slot as finished (skipped).
                okf[index] = { item, index, error: `skipped: ${msg}` };
                finishedOkf += 1;
                hooks.onParseError?.(item, index, err);
                if (hooks.failFast) fail(err);
              })
              .finally(() => {
                activeParse -= 1;
                finishedParse += 1;
                if (abort) {
                  maybeDone();
                  return;
                }
                flushQuietWaiters();
                pumpParse();
                pumpOkf();
                maybeDone();
              });
          }
          if (fillBurstPumpId === myPumpId) fillBurstPumpId = null;
        } finally {
          pumpDepth -= 1;
        }
        flushQuietWaiters();
        maybeDone();
      };

      resumeParsePump = () => {
        pumpParse();
        pumpOkf();
      };

      if (items.length === 0) {
        resolvePromise({ parsed: [], okf: [], errors: 0 });
        return;
      }
      pumpParse();
    });
  });
}
