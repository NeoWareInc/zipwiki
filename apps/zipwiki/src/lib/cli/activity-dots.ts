/**
 * In-place activity dots on stderr for long remote waits.
 * Concurrent jobs share one line. Other stage messages must use
 * {@link stageLog} so they clear the spinner first and do not corrupt lines.
 */

type Job = { label: string; activity: string };

const jobs = new Map<number, Job>();
let nextId = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let frame = 0;
let lastLen = 0;
/** Visual rows the last spinner frame occupied. A wrapped frame must be erased upward. */
let lastRows = 0;
/** Guard so timer ticks never interleave with stageLog / job teardown. */
let locked = false;

const DOT_FRAMES = [".  ", ".. ", "...", " ..", "  .", "   "] as const;
const TICK_MS = 200;
const DEFAULT_ACTIVITY = "zipwiki parse";

function terminalColumns(): number {
  const columns = process.stderr.columns;
  return typeof columns === "number" && columns > 20 ? columns : 80;
}

/** Keep the spinner on one row. A line past the terminal width wraps, and `\r` then reprints it. */
export function fitActivityLine(line: string, columns: number): string {
  const width = Math.max(20, columns - 1);
  if (line.length <= width) return line;
  return `${line.slice(0, width - 1)}…`;
}

function clearLine(): void {
  if (!process.stderr.isTTY || lastRows <= 0) return;
  if (lastRows > 1) process.stderr.write(`\x1b[${lastRows - 1}A`);
  process.stderr.write("\r\x1b[J");
  lastLen = 0;
  lastRows = 0;
}

function paint(line: string): void {
  const fitted = fitActivityLine(line, terminalColumns());
  if (lastRows > 1) process.stderr.write(`\x1b[${lastRows - 1}A\r\x1b[J`);
  else process.stderr.write("\r\x1b[K");
  process.stderr.write(fitted);
  lastLen = fitted.length;
  lastRows = 1;
}

function formatActivityLine(dots: string): string {
  const byActivity = new Map<string, string[]>();
  for (const job of jobs.values()) {
    const list = byActivity.get(job.activity) ?? [];
    list.push(job.label);
    byActivity.set(job.activity, list);
  }
  const parts: string[] = [];
  for (const [activity, labels] of byActivity) {
    const names =
      labels.length <= 2
        ? labels.join(", ")
        : `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
    parts.push(`${activity} ${names}`);
  }
  return `[stage] ${parts.join(" · ")} ${dots}`;
}

function render(): void {
  if (locked || !process.stderr.isTTY || jobs.size === 0) return;
  frame = (frame + 1) % DOT_FRAMES.length;
  const dots = DOT_FRAMES[frame]!;
  paint(formatActivityLine(dots));
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
 *
 * @param opts.activity - Verb shown before the filename (default `zipwiki parse`).
 *   Use `llamaparse` for local LlamaParse waits.
 */
export async function withActivityDots<T>(
  label: string,
  opts: { quiet?: boolean; activity?: string },
  work: () => Promise<T>,
): Promise<T> {
  const activity = opts.activity?.trim() || DEFAULT_ACTIVITY;
  if (opts.quiet) {
    return work();
  }
  if (!process.stderr.isTTY) {
    stageLog(`[stage] ${activity} ${label}…`);
    return work();
  }

  const id = nextId++;
  jobs.set(id, { label, activity });
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
  paint(formatActivityLine(dots));
}

/** Test helper — reset shared ticker state. */
export function resetActivityDotsForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  jobs.clear();
  lastLen = 0;
  lastRows = 0;
  frame = 0;
  nextId = 1;
  locked = false;
}
