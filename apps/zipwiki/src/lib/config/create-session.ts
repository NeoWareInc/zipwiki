import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const createIdAls = new AsyncLocalStorage<string>();

/** Current Create ZipWiki session id (set for the duration of a pack). */
export function getCreateId(): string | undefined {
  return createIdAls.getStore();
}

/** Allocate a new create session id. */
export function newCreateId(): string {
  return randomUUID();
}

/** Run work with createId available to nested parse/OKF/telemetry callers. */
export function runWithCreateId<T>(createId: string, fn: () => T): T {
  return createIdAls.run(createId, fn);
}

export async function runWithCreateIdAsync<T>(
  createId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return createIdAls.run(createId, fn);
}
