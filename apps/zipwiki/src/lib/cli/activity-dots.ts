/**
 * In-place activity dots on stderr for long remote waits.
 * Concurrent jobs share one line. Other stage messages must use
 * {@link stageLog} so they clear the spinner first and do not corrupt lines.
 */

type Job = { label: string };

const jobs = new Map<number, Job>();
let nextId = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let frame = 0;
let lastLen = 0;
/** Guard so timer ticks never interleave with stageLog / job teardown. */
let locked = false;

const DOT_FRAMES = [".  ", ".. ", "...", " ..", "  .", "   "] as const;
const TICK_MS = 200;

function clearLine(): void {
  if (!process.stderr.isTTY || lastLen <= 0) return;
  process.stderr.write(`\r${" ".repeat(lastLen)}\r`);
  lastLen = 0;
}

function render(): void {
  if (locked || !process.stderr.isTTY || jobs.size === 0) return;
  frame = (frame + 1) % DOT_FRAMES.length;
  const dots = DOT_FRAMES[frame]!;
  const labels = [...jobs.values()].map((j) => j.label);
  const names =
    labels.length <= 2
      ? labels.join(", ")
      : `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
  const line = `[stage] zipwiki parse ${names} ${dots}`;
  const pad = Math.max(0, lastLen - line.length);
  process.stderr.write(`\r${line}${" ".repeat(pad)}`);
  lastLen = line.length;
}

function ensureTicker(): void {
  if (timer || !process.stderr.isTTY) return;
  timer = setInterval(render, TICK_MS);
  timer.unref?.();
}

function releaseTicker(): void {
  if (jobs.size > 0) return;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  clearLine();
  frame = 0;
}

/**
 * Print a durable stderr line without fighting the activity spinner.
 * Clears the in-place progress line, writes the message, then redraws.
 */
export function stageLog(message: string): void {
  const text = message.endsWith("\n") ? message : `${message}\n`;
  if (!process.stderr.isTTY) {
    process.stderr.write(text);
    return;
  }
  locked = true;
  try {
    clearLine();
    process.stderr.write(text);
  } finally {
    locked = false;
    if (jobs.size > 0) render();
  }
}

/**
 * Run `work` while showing moving activity dots (TTY stderr only).
 * No-op when quiet. Pair durable status with {@link stageLog}.
 */
export async function withActivityDots<T>(
  label: string,
  opts: { quiet?: boolean },
  work: () => Promise<T>,
): Promise<T> {
  if (opts.quiet) {
    return work();
  }
  if (!process.stderr.isTTY) {
    stageLog(`[stage] zipwiki parse ${label}…`);
    return work();
  }

  const id = nextId++;
  jobs.set(id, { label });
  ensureTicker();
  locked = true;
  try {
    renderUnlocked();
  } finally {
    locked = false;
  }

  try {
    return await work();
  } finally {
    locked = true;
    try {
      jobs.delete(id);
      clearLine();
    } finally {
      locked = false;
    }
    if (jobs.size === 0) {
      releaseTicker();
    } else {
      render();
    }
  }
}

/** render() without the locked check — caller holds the lock. */
function renderUnlocked(): void {
  if (!process.stderr.isTTY || jobs.size === 0) return;
  frame = (frame + 1) % DOT_FRAMES.length;
  const dots = DOT_FRAMES[frame]!;
  const labels = [...jobs.values()].map((j) => j.label);
  const names =
    labels.length <= 2
      ? labels.join(", ")
      : `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
  const line = `[stage] zipwiki parse ${names} ${dots}`;
  const pad = Math.max(0, lastLen - line.length);
  process.stderr.write(`\r${line}${" ".repeat(pad)}`);
  lastLen = line.length;
}

/** Test helper — reset shared ticker state. */
export function resetActivityDotsForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  jobs.clear();
  lastLen = 0;
  frame = 0;
  nextId = 1;
  locked = false;
}
