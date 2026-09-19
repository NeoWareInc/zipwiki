/**
 * Bounded parse → OKF pipeline scheduler.
 *
 * Interleaving is intentional: OKF (especially remote AI, often multi-second)
 * runs for file i while parse(i+1…) continues. That cuts wall time vs
 * “all parse then all OKF”. Logging must stay single-line / completion-only
 * so concurrent workers do not corrupt the terminal.
 */

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

  const okfQueue: Array<{ item: string; index: number; value: TParse }> = [];

  return await new Promise((resolvePromise, rejectPromise) => {
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
            pumpOkf();
            maybeDone();
          });
      }
      maybeDone();
    };

    const pumpParse = () => {
      if (abort) return;
      while (activeParse < limit && nextParse < items.length) {
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
            pumpParse();
            pumpOkf();
            maybeDone();
          });
      }
      maybeDone();
    };

    if (items.length === 0) {
      resolvePromise({ parsed: [], okf: [], errors: 0 });
      return;
    }
    pumpParse();
  });
}
